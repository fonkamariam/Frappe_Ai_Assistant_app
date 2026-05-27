/**
 * ai_chat.js
 * ==========
 * Architecture:
 *
 *   ConversationStorage  — localStorage CRUD, schema, sort. Swap for DocType later.
 *   ChatApiService       — All HTTP, streaming simulation, error handling, retries.
 *   ChatUI               — DOM rendering only. No API calls. No storage calls.
 *   Page controller      — Wires the three layers together. Handles events.
 *
 * Storage schema per conversation:
 *   {
 *     id:           string,
 *     title:        string,
 *     created_at:   ISO string,
 *     last_updated: ISO string,
 *     messages:     Array<{ role, content, reasoning_content?, attachments? }>
 *   }
 */

frappe.pages['ai-chat'].on_page_load = async function (wrapper) {

    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    $(page.body).html(frappe.render_template('ai_chat', {}));
    frappe.require('/assets/ai_assistant/css/ai_chat.css');

    // =========================================================================
    // LAYER 1: ConversationStorage
    // Responsible for: localStorage CRUD, schema normalisation, ordering.
    // To migrate to Frappe DocTypes later: replace only this class.
    // =========================================================================
    const ConversationStorage = (() => {
        const STORAGE_KEY = 'ai_chat_conversations_v2';
        const MAX_TITLE   = 30;

        function _load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }

        function _save(convs) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
            } catch (e) {
                // localStorage quota exceeded — non-fatal
                console.warn('AI Chat: localStorage save failed', e);
            }
        }

        /** Always return conversations sorted by last_updated DESC */
        function getAll() {
            const convs = _load();
            return convs.sort((a, b) =>
                new Date(b.last_updated) - new Date(a.last_updated)
            );
        }

        function getById(id) {
            return _load().find(c => c.id === id) || null;
        }

        function create(overrides = {}) {
            const now = new Date().toISOString();
            const conv = {
                id:           'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title:        'New Chat',
                created_at:   now,
                last_updated: now,
                messages:     [],
                ...overrides
            };
            const convs = _load();
            convs.unshift(conv);
            _save(convs);
            return conv;
        }

        function save(conv) {
            const convs = _load();
            const idx = convs.findIndex(c => c.id === conv.id);
            if (idx >= 0) {
                convs[idx] = conv;
            } else {
                convs.unshift(conv);
            }
            _save(convs);
        }

        function deleteById(id) {
            const convs = _load().filter(c => c.id !== id);
            _save(convs);
        }

        function rename(id, newTitle) {
            const convs = _load();
            const conv = convs.find(c => c.id === id);
            if (conv) {
                conv.title = newTitle.trim().substring(0, 80) || conv.title;
                _save(convs);
                return conv;
            }
            return null;
        }

        /**
         * Touch last_updated on a conversation so it floats to the top.
         * Call this whenever a user or assistant message is added.
         */
        function touch(id) {
            const convs = _load();
            const conv = convs.find(c => c.id === id);
            if (conv) {
                conv.last_updated = new Date().toISOString();
                _save(convs);
            }
        }

        function addMessage(convId, message) {
            const convs = _load();
            const conv = convs.find(c => c.id === convId);
            if (!conv) return null;
            if (!Array.isArray(conv.messages)) conv.messages = [];
            conv.messages.push(message);
            conv.last_updated = new Date().toISOString();
            _save(convs);
            return conv;
        }

        function autoTitle(text, maxLen = MAX_TITLE) {
            const clean = text.trim().replace(/\s+/g, ' ');
            return clean.length > maxLen ? clean.substring(0, maxLen) + '…' : clean;
        }

        return { getAll, getById, create, save, deleteById, rename, touch, addMessage, autoTitle };
    })();


    // =========================================================================
    // LAYER 2: ChatApiService
    // Responsible for: HTTP calls, streaming simulation, error normalisation,
    //                  retry logic, abort control.
    // =========================================================================
    const ChatApiService = (() => {
        // Active AbortController for the current request
        let _abortController = null;

        const ERROR_MESSAGES = {
            MISSING_API_KEY:   'The AI service is not configured. Please contact your administrator.',
            INVALID_API_KEY:   'The AI API key is invalid. Please contact your administrator.',
            RATE_LIMITED:      'The AI service is rate-limited. Please wait a moment and try again.',
            REQUEST_TIMEOUT:   'The request timed out. The AI may be busy — please try again.',
            NETWORK_ERROR:     'Network error. Please check your connection and try again.',
            EMPTY_RESPONSE:    'The AI returned an empty response. Please rephrase and try again.',
            MALFORMED_RESPONSE:'Received an unexpected response from the AI service.',
            UPSTREAM_ERROR:    'The AI service is experiencing issues. Please try again shortly.',
            VALIDATION_ERROR:  'Invalid request. Please check your message and try again.',
            UNKNOWN:           'An unexpected error occurred. Please try again.'
        };

        /**
         * Send a message to the backend and return a structured result.
         *
         * @param {string}   message  - latest user text
         * @param {Array}    history  - prior messages [{role, content}, ...]
         * @returns {Promise<{ content, reasoning_content, model, usage }>}
         * @throws  {Error} with a user-friendly .message
         */
        async function sendMessage(message, history = []) {
            // Abort any in-progress request
            cancel();
            _abortController = new AbortController();

            // Build history stripped to role+content only (no UI-only fields)
            const cleanHistory = history.map(m => ({
                role:    m.role,
                content: m.content || ''
            }));

            let response;
            try {
                response = await fetch(
                    '/api/method/ai_assistant.ai_chat_api.send_message',
                    {
                        method:  'POST',
                        headers: {
                            'Content-Type':       'application/json',
                            'X-Frappe-CSRF-Token': frappe.csrf_token,
                        },
                        body:    JSON.stringify({
                            message,
                            history: JSON.stringify(cleanHistory)
                        }),
                        signal:  _abortController.signal,
                    }
                );
            } catch (err) {
                if (err.name === 'AbortError') {
                    throw Object.assign(new Error('Request cancelled.'), { code: 'CANCELLED' });
                }
                throw Object.assign(
                    new Error(ERROR_MESSAGES.NETWORK_ERROR),
                    { code: 'NETWORK_ERROR' }
                );
            } finally {
                _abortController = null;
            }

            let data;
            try {
                data = await response.json();
            } catch {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.MALFORMED_RESPONSE),
                    { code: 'MALFORMED_RESPONSE' }
                );
            }

            // Frappe wraps responses in { message: ... }
            const payload = data.message || data;

            if (!payload.ok) {
                const code = payload.error || 'UNKNOWN';
                const userMsg = payload.message
                    || ERROR_MESSAGES[code]
                    || ERROR_MESSAGES.UNKNOWN;
                throw Object.assign(new Error(userMsg), { code });
            }

            return {
                content:           payload.content           || '',
                reasoning_content: payload.reasoning_content || '',
                model:             payload.model             || '',
                usage:             payload.usage             || {},
            };
        }

        /**
         * Cancel the current in-flight request.
         */
        function cancel() {
            if (_abortController) {
                _abortController.abort();
                _abortController = null;
            }
        }

        function isActive() {
            return _abortController !== null;
        }

        /**
         * Simulate streaming: call onChunk(char) for each character
         * with a small random delay, then resolve.
         * This gives the DeepSeek typewriter feel on top of a batch response.
         *
         * @param {string}   text       - full text to stream
         * @param {Function} onChunk    - called with each incremental string
         * @param {Function} isCancelled- checked before each chunk; if true, stops
         * @param {number}   speed      - base ms per chunk (adaptive)
         */
        async function simulateStream(text, onChunk, isCancelled, speed = 8) {
            if (!text) return;

            // Adaptive chunk size: larger for long texts to keep it snappy
            const chunkSize = text.length > 1000 ? 4 : text.length > 400 ? 2 : 1;

            for (let i = 0; i < text.length; i += chunkSize) {
                if (isCancelled()) return;
                onChunk(text.slice(i, i + chunkSize));
                // Very short delay — feels like real streaming
                if (i % 12 === 0) {
                    await new Promise(r => setTimeout(r, speed + Math.random() * 6));
                }
            }
        }

        /**
         * Upload a file to Frappe and return { file_name, file_url }.
         */
        async function uploadFile(file) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('is_private', 1);

            const response = await fetch('/api/method/upload_file', {
                method:  'POST',
                headers: { 'X-Frappe-CSRF-Token': frappe.csrf_token },
                body:    formData,
            });

            if (!response.ok) {
                throw new Error(`Upload failed (HTTP ${response.status})`);
            }

            const data = await response.json();
            const msg  = data.message;
            if (!msg || !msg.file_url) throw new Error('Upload response missing file_url');
            return { file_name: msg.file_name || file.name, file_url: msg.file_url };
        }

        return { sendMessage, cancel, isActive, simulateStream, uploadFile };
    })();


    // =========================================================================
    // LAYER 3: ChatUI
    // Responsible for: DOM rendering only.
    // No direct API calls. No localStorage calls.
    // Calls back to the controller via passed-in functions.
    // =========================================================================
    const ChatUI = (() => {
        const MAX_TITLE_DISPLAY = 30;

        // ------ Markdown renderer ------
        function renderMarkdown(text) {
            if (!text) return '';

            function escHtml(str) {
                return str
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            const codeBlocks = [];

            // 1. Extract fenced code blocks and replace with HTML immediately
            let result = text.replace(/```(\w*)\s*\n?([\s\S]*?)```/g, (_, lang, code) => {
                const escaped   = escHtml(code.trimEnd());
                const langLabel = lang || 'code';
                const html = `
                    <div class="code-block-wrap">
                        <div class="code-block-header">
                            <span class="code-lang">${escHtml(langLabel)}</span>
                            <button class="copy-code-btn" data-code="${escaped.replace(/"/g, '&quot;')}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg> Copy
                            </button>
                        </div>
                        <pre>${escaped}</pre>
                    </div>`;
                return html;
            });

            // 2. Inline code
            result = result.replace(/`([^`]+)`/g, (_, c) => `<code>${escHtml(c)}</code>`);

            // 3. Bold / italic
            result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
            result = result.replace(/_(.+?)_/g, '<em>$1</em>');

            // 4. Lists and paragraphs
            const lines  = result.split('\n');
            const output = [];
            let inOl = false, inUl = false;

            for (const line of lines) {
                const olMatch = line.match(/^(\d+)\.\s+(.+)/);
                if (olMatch) {
                    if (!inOl) { output.push('<ol>'); inOl = true; }
                    output.push(`<li>${olMatch[2]}</li>`);
                    continue;
                } else if (inOl) { output.push('</ol>'); inOl = false; }

                const ulMatch = line.match(/^[-*]\s+(.+)/);
                if (ulMatch) {
                    if (!inUl) { output.push('<ul>'); inUl = true; }
                    output.push(`<li>${ulMatch[1]}</li>`);
                    continue;
                } else if (inUl) { output.push('</ul>'); inUl = false; }

                if (line.trim() === '') { output.push(''); continue; }

                // Do NOT wrap a line that is already an HTML block (code block)
                // Since code blocks are already inserted as raw HTML, they won't be caught here.
                output.push(`<p>${line}</p>`);
            }

            if (inOl) output.push('</ol>');
            if (inUl) output.push('</ul>');

            result = output.join('');

            // 5. Clean up empty <p> tags (optional)
            result = result.replace(/<p>\s*<\/p>/g, '');

            return result;
}
    
        // ------ Sidebar ------
        function renderConversationList(conversations, currentId, callbacks) {
            const container = $('#conversation-list');
            const filter    = ($('#search-input').val() || '').toLowerCase();
            container.empty();

            let visible = conversations.filter(c => c.messages && c.messages.length > 0);
            if (filter) {
                visible = visible.filter(c => c.title.toLowerCase().includes(filter));
            }

            if (visible.length === 0) {
                container.append('<div class="conv-empty-msg">No conversations found.</div>');
                return;
            }

            const today     = moment().startOf('day');
            const yesterday = moment().subtract(1, 'days').startOf('day');
            const weekAgo   = moment().subtract(7, 'days').startOf('day');
            const monthAgo  = moment().subtract(30, 'days').startOf('day');

            const groups = {
                'Today':           [],
                'Yesterday':       [],
                'Previous 7 Days': [],
                'Previous 30 Days':[],
                'Older':           []
            };

            visible.forEach(c => {
                const m = moment(c.last_updated || c.created_at);
                if      (m.isSameOrAfter(today))     groups['Today'].push(c);
                else if (m.isSameOrAfter(yesterday))  groups['Yesterday'].push(c);
                else if (m.isSameOrAfter(weekAgo))    groups['Previous 7 Days'].push(c);
                else if (m.isSameOrAfter(monthAgo))   groups['Previous 30 Days'].push(c);
                else                                  groups['Older'].push(c);
            });

            Object.entries(groups).forEach(([label, items]) => {
                if (!items.length) return;
                const groupEl = $(`<div class="date-group"><div class="date-label">${label}</div></div>`);
                items.forEach(conv => {
                    const displayTitle = conv.title.length > MAX_TITLE_DISPLAY
                        ? conv.title.substring(0, MAX_TITLE_DISPLAY) + '…'
                        : conv.title;

                    const item = $(`
                        <div class="conversation-item${conv.id === currentId ? ' active' : ''}"
                             data-id="${conv.id}">
                            <span class="title">${displayTitle}</span>
                            <button class="more-btn" title="More options">⋯</button>
                            <div class="dropdown-menu">
                                <div class="dropdown-item rename-action">Rename</div>
                                <div class="dropdown-item danger delete-action">Delete</div>
                            </div>
                        </div>`);

                    item.on('click', e => {
                        if ($(e.target).closest('.more-btn, .dropdown-menu, .title input').length) return;
                        closeDropdowns();
                        callbacks.onSelect(conv.id);
                    });
                    item.find('.more-btn').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        item.find('.dropdown-menu').toggleClass('show');
                    });
                    item.find('.rename-action').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        _startInlineRename(item, conv, callbacks.onRename);
                    });
                    item.find('.delete-action').on('click', e => {
                        e.stopPropagation();
                        closeDropdowns();
                        callbacks.onDelete(conv.id);
                    });

                    groupEl.append(item);
                });
                container.append(groupEl);
            });
        }

        function _startInlineRename(item, conv, onRename) {
            const titleSpan    = item.find('.title');
            const currentTitle = conv.title;
            const input        = $(`<input type="text" value="${currentTitle}" />`);
            titleSpan.html(input);
            input.focus().select();

            const save = () => {
                const newTitle = input.val().trim();
                if (newTitle && newTitle !== currentTitle) {
                    onRename(conv.id, newTitle);
                } else {
                    const disp = currentTitle.length > 30
                        ? currentTitle.substring(0, 30) + '…'
                        : currentTitle;
                    titleSpan.text(disp);
                }
            };

            input.on('blur', save);
            input.on('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); input.trigger('blur'); }
                if (e.key === 'Escape') { titleSpan.text(currentTitle); }
            });
        }

        function closeDropdowns() {
            $('.dropdown-menu.show').removeClass('show');
        }

        function updateChatHeader(title) {
            $('#chat-title').text(title || 'AI Assistant');
        }

        // ------ Message rendering ------

        /**
         * Append a completed message bubble to the chat.
         */
        function appendMessage(role, content, opts = {}) {
            const { attachments = [], reasoning_content = '', messageId = null } = opts;
            const chatBox    = $('#chat-messages');
            const isUser     = role === 'user';
            const authorLabel= isUser ? 'You' : 'AI Assistant';
            const avatarHtml = isUser
                ? `<div class="msg-avatar avatar-user">U</div>`
                : `<div class="msg-avatar avatar-bot">✦</div>`;

            let bubbleContent = '';

            // Reasoning block (DeepSeek R1)
            if (!isUser && reasoning_content) {
                bubbleContent += _buildReasoningBlock(reasoning_content);
            }

            // Attachments
            if (attachments.length > 0) {
                bubbleContent += _buildAttachmentsHtml(attachments);
            }

            // Main text
            if (content) {
                bubbleContent += renderMarkdown(content);
            }

            const idAttr = messageId ? `id="${messageId}"` : '';
            const msgHtml = `
                <div class="message ${role}" ${idAttr}>
                    ${avatarHtml}
                    <div class="msg-body">
                        <span class="msg-author">${authorLabel}</span>
                        <div class="bubble">
                            ${bubbleContent}
                            ${role === 'assistant' ? `<button class="copy-msg-btn" title="Copy message" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
                        </div>
                    </div>
                </div>`;

            chatBox.append(msgHtml);
            _bindBubbleEvents(chatBox);
            scrollToBottom();
        }

        /**
         * Create a streaming placeholder message and return control handles.
         * The caller feeds content into it incrementally.
         */
        function createStreamingMessage() {
            const msgId     = 'stream_msg_' + Date.now();
            const chatBox   = $('#chat-messages');

            chatBox.append(`
                <div class="message assistant" id="${msgId}">
                    <div class="msg-avatar avatar-bot">✦</div>
                    <div class="msg-body">
                        <span class="msg-author">AI Assistant</span>
                        <div class="bubble">
                            <div class="reasoning-block reasoning-thinking" id="${msgId}_reasoning" style="display:none">
                                <button class="reasoning-toggle" type="button">
                                    <span class="reasoning-toggle-icon">▶</span>
                                    <span class="reasoning-label">Thinking…</span>
                                </button>
                                <div class="reasoning-content" id="${msgId}_reasoning_content" style="white-space: pre-wrap; word-break: break-word;"></div>
                            </div>
                            <div class="stream-content" id="${msgId}_content"></div>
                            <span class="stream-cursor" id="${msgId}_cursor">▋</span>
                        </div>
                    </div>
                </div>`);

            scrollToBottom();

            // Bind reasoning toggle for this message
            $(`#${msgId} .reasoning-toggle`).on('click', function (e) {
                e.preventDefault();
                const block = $(`#${msgId}_reasoning`);
                block.toggleClass('open');
                $(this).find('.reasoning-toggle-icon').text(
                    block.hasClass('open') ? '▼' : '▶'
                );
            });

            return {
                /**
                 * Append reasoning text incrementally.
                 * Shows the reasoning block on first call.
                 */
                appendReasoning(text) {
                    const block = $(`#${msgId}_reasoning`);
                    if (!block.is(':visible')) {
                        block.show();
                    }
                    const el = $(`#${msgId}_reasoning_content`);
                    el.append(document.createTextNode(text));
                    scrollToBottom();
                },

                /**
                 * Mark reasoning as complete — update label and make toggleable.
                 */
                finishReasoning() {
                    const block = $(`#${msgId}_reasoning`);
                    block.removeClass('reasoning-thinking').addClass('reasoning-done open');
                    block.find('.reasoning-label').text('Thought process');
                    block.find('.reasoning-toggle-icon').text('▼');
                },

                /**
                 * Append main content text incrementally.
                 */
                appendContent(text) {
                    const el = $(`#${msgId}_content`);
                    // Append as raw text, we'll re-render as markdown at the end
                    el.data('raw', (el.data('raw') || '') + text);
                    el.text((el.text() || '') + text);
                    scrollToBottom();
                },

                /**
                 * Finalise the message: render markdown, remove cursor, bind events.
                 */
                finalise(fullContent, fullReasoning) {
                    $(`#${msgId}_cursor`).remove();
                    const contentEl = $(`#${msgId}_content`);
                    contentEl.html(renderMarkdown(fullContent));
                    _bindBubbleEvents($('#chat-messages'));
                },

                /**
                 * Replace entire message with an error state.
                 */
                showError(errorMessage) {
                    $(`#${msgId}_cursor`).remove();
                    $(`#${msgId}_reasoning`).hide();
                    $(`#${msgId}_content`).html(
                        `<div class="msg-error">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            ${errorMessage}
                            <button class="retry-btn" id="${msgId}_retry">Try again</button>
                        </div>`
                    );
                },

                id: msgId
            };
        }

        function showThinking() {
            const chatBox = $('#chat-messages');
            chatBox.append(`
                <div class="message assistant thinking-row" id="thinking-indicator">
                    <div class="msg-avatar avatar-bot">✦</div>
                    <div class="msg-body">
                        <div class="thinking-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>`);
            scrollToBottom();
        }

        function removeThinking() {
            $('#thinking-indicator').remove();
        }

        function showEmptyState()  {
            $('#empty-state').show();
            $('#chat-messages, #input-container').hide();
        }

        function showChatState() {
            $('#empty-state').hide();
            $('#chat-messages, #input-container').show();
        }

        function clearMessages() {
            $('#chat-messages').empty();
            $('.start-chatting').remove();
        }

        function showStartChatting() {
            if (!$('.start-chatting').length) {
                $('.ai-chat-main').append('<div class="start-chatting">Start chatting…</div>');
            }
        }

        function setSendState(sending) {
            $('#send-btn').prop('disabled', sending);
            $('#user-message').prop('disabled', sending);
            if (sending) {
                $('#stop-btn').show();
                $('#send-btn').hide();
            } else {
                $('#stop-btn').hide();
                $('#send-btn').show();
            }
        }

        function scrollToBottom() {
            const el = document.getElementById('chat-messages');
            if (el) el.scrollTop = el.scrollHeight;
        }

        function autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 44), 180) + 'px';
        }

        function applyTheme(isDark) {
            $('#ai-chat-wrapper').toggleClass('light-mode', !isDark);
            $('#theme-label').text(isDark ? 'Light Mode' : 'Dark Mode');
        }

        // ------ Attachment preview in input area ------
        function renderAttachmentPreviews(pendingAttachments) {
            const container = $('#attachment-previews');
            container.empty();
            pendingAttachments.forEach(att => {
                const isImage = att.type.startsWith('image/');
                const sizeStr = _formatSize(att.size);
                const item    = $(`
                    <div class="attachment-preview-item" data-id="${att.id}">
                        ${isImage
                            ? `<img class="thumb uploading" src="${URL.createObjectURL(att.file)}" alt="${att.name}">`
                            : `<span class="file-icon">📄</span>`}
                        <div class="file-info">
                            <span class="file-name" title="${att.name}">${_truncateFileName(att.name)}</span>
                            <span class="file-size">${sizeStr}</span>
                        </div>
                        <span class="remove-file" data-id="${att.id}">✕</span>
                    </div>`);
                container.append(item);
            });
        }

        // ------ Private helpers ------
        function _buildReasoningBlock(reasoning) {
            return `
                <div class="reasoning-block reasoning-done">
                    <button class="reasoning-toggle" type="button">
                        <span class="reasoning-toggle-icon">▶</span>
                        <span class="reasoning-label">Thought process</span>
                    </button>
                    <div class="reasoning-content">${escapeHtml(reasoning)}</div>
                </div>`;
        }

        function escapeHtml(str) {
            return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        function _buildAttachmentsHtml(attachments) {
            const items = attachments.map(a => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_url);
                if (isImage) {
                    return `<div class="chat-attachment-preview" data-url="${a.file_url}" data-name="${a.file_name}">
                        <img src="${a.file_url}" alt="${a.file_name}">
                    </div>`;
                }
                const ext = (a.file_name || '').split('.').pop().toUpperCase();
                return `<div class="file-card">
                    <span class="file-card-icon">📄</span>
                    <div class="file-card-info">
                        <span class="file-card-name">${a.file_name}</span>
                        <span class="file-card-size">${ext} file</span>
                    </div>
                </div>`;
            }).join('');
            return `<div class="attachments-grid">${items}</div>`;
        }

        function _bindBubbleEvents(chatBox) {
            // Helper to decode HTML entities
            const decodeHtml = (html) => {
                const txt = document.createElement('textarea');
                txt.innerHTML = html;
                return txt.value;
            };

            // Copy code buttons
            chatBox.find('.copy-code-btn').off('click.ai').on('click.ai', function () {
                let code = $(this).attr('data-code');
                // Decode HTML entities
                code = decodeHtml(code);
                // Remove any remaining HTML tags
                code = code.replace(/<[^>]*>/g, '');
                
                navigator.clipboard.writeText(code).then(() => {
                    const btn = $(this);
                    btn.html(`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`);
                    setTimeout(() => btn.html(
                        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`
                    ), 2000);
                }).catch(() => frappe.show_alert({ message: 'Copy failed', indicator: 'red' }, 2));
            });

            // Copy message button (hover on bubble) - copy just the text content, not HTML
            chatBox.find('.bubble').off('mouseenter.ai mouseleave.ai').on('mouseenter.ai', function() {
                $(this).find('.copy-msg-btn').show();
            }).on('mouseleave.ai', function() {
                $(this).find('.copy-msg-btn').hide();
            });

            chatBox.find('.copy-msg-btn').off('click.ai').on('click.ai', function (e) {
                e.stopPropagation();
                const bubble = $(this).closest('.bubble');
                // Get text content, excluding code blocks
                let text = bubble.clone();
                text.find('.code-block-wrap').remove();
                text = text.text().trim();
                
                navigator.clipboard.writeText(text).then(() => {
                    const btn = $(this);
                    btn.html(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`);
                    setTimeout(() => btn.html(
                        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
                    ), 1500);
                }).catch(() => frappe.show_alert({ message: 'Copy failed', indicator: 'red' }, 2));
            });

            // Reasoning toggles
            chatBox.find('.reasoning-toggle').off('click.ai').on('click.ai', function () {
                const block = $(this).closest('.reasoning-block');
                block.toggleClass('open');
                $(this).find('.reasoning-toggle-icon').text(block.hasClass('open') ? '▼' : '▶');
            });

            // Image lightbox
            chatBox.find('.chat-attachment-preview[data-url]').off('click.ai').on('click.ai', function () {
                _openLightbox($(this).data('url'), $(this).data('name'));
            });
        }

        function _openLightbox(url, name) {
            $('#lightbox-image').attr('src', url).attr('alt', name);
            $('#lightbox-modal').addClass('show');
        }

        function _formatSize(bytes) {
            if (bytes < 1024)    return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        function _truncateFileName(name, max = 20) {
            if (name.length <= max) return name;
            const ext = name.lastIndexOf('.');
            if (ext === -1) return name.substring(0, max - 3) + '…';
            const extension = name.substring(ext);
            return name.substring(0, max - extension.length - 3) + '…' + extension;
        }

        return {
            renderConversationList,
            updateChatHeader,
            appendMessage,
            createStreamingMessage,
            showThinking,
            removeThinking,
            showEmptyState,
            showChatState,
            clearMessages,
            showStartChatting,
            setSendState,
            scrollToBottom,
            autoResize,
            applyTheme,
            renderAttachmentPreviews,
            closeDropdowns,
            renderMarkdown,
        };
    })();


    // =========================================================================
    // PAGE CONTROLLER
    // Wires ConversationStorage + ChatApiService + ChatUI together.
    // Handles all events. Manages page-level state.
    // =========================================================================

    // ---- Page state ----
    let currentConversationId = null;
    let pendingAttachments    = [];
    let isDarkMode            = true;
    let isStreaming           = false;  // true while a request is in flight
    let cancelStreaming        = false; // signal to stop simulation loop
    const MAX_TITLE_LENGTH    = 30;

    // ---- Sidebar callbacks passed to ChatUI ----
    const sidebarCallbacks = {
        onSelect: loadConversation,
        onDelete: deleteConversation,
        onRename: (id, newTitle) => {
            const conv = ConversationStorage.rename(id, newTitle);
            if (conv) {
                refreshSidebar();
                if (id === currentConversationId) ChatUI.updateChatHeader(conv.title);
                frappe.show_alert({ message: 'Conversation renamed', indicator: 'green' }, 2);
            }
        }
    };

    function refreshSidebar() {
        const convs = ConversationStorage.getAll();
        ChatUI.renderConversationList(convs, currentConversationId, sidebarCallbacks);
    }

    // ---- Conversation management ----
    function loadConversation(id) {
        if (id === currentConversationId) return;
        const conv = ConversationStorage.getById(id);
        if (!conv) return;

        pendingAttachments = [];
        ChatUI.renderAttachmentPreviews([]);

        currentConversationId = id;
        ChatUI.clearMessages();
        ChatUI.showChatState();
        ChatUI.updateChatHeader(conv.title);

        if (conv.messages && conv.messages.length > 0) {
            conv.messages.forEach(m => {
                ChatUI.appendMessage(m.role, m.content, {
                    attachments:       m.attachments || [],
                    reasoning_content: m.reasoning_content || ''
                });
            });
        } else {
            ChatUI.showStartChatting();
        }

        refreshSidebar();
        ChatUI.scrollToBottom();
        setTimeout(() => $('#user-message').focus(), 50);
    }

    function newConversation() {
        pendingAttachments = [];
        ChatUI.renderAttachmentPreviews([]);

        const conv = ConversationStorage.create();
        currentConversationId = conv.id;

        ChatUI.closeDropdowns();
        ChatUI.clearMessages();
        ChatUI.showChatState();
        ChatUI.showStartChatting();
        ChatUI.updateChatHeader('New Chat');

        $('#user-message').val('');
        ChatUI.autoResize($('#user-message')[0]);

        refreshSidebar();
        setTimeout(() => $('#user-message').focus(), 50);
    }

    function deleteConversation(id) {
        frappe.confirm('Are you sure you want to delete this conversation?', () => {
            ConversationStorage.deleteById(id);

            if (currentConversationId === id) {
                const remaining = ConversationStorage.getAll();
                if (remaining.length > 0) {
                    loadConversation(remaining[0].id);
                } else {
                    currentConversationId = null;
                    ChatUI.showEmptyState();
                }
            }

            refreshSidebar();
            frappe.show_alert({ message: 'Conversation deleted', indicator: 'red' }, 2);
        });
    }

    // ---- File uploads ----
    async function uploadPendingAttachments() {
        const uploaded = [];
        for (const att of pendingAttachments) {
            try {
                const result = await ChatApiService.uploadFile(att.file);
                uploaded.push(result);
                $(`.attachment-preview-item[data-id="${att.id}"] .thumb`).removeClass('uploading');
            } catch (err) {
                frappe.show_alert({ message: `Upload failed: ${att.name}`, indicator: 'red' }, 3);
            }
        }
        return uploaded;
    }

    // ---- Send message ----
    async function sendMessage() {
        if (isStreaming) return;

        const textarea = $('#user-message');
        const message  = textarea.val().trim();

        if (!message && pendingAttachments.length === 0) return;

        // Ensure we have an active conversation
        if (!currentConversationId || !ConversationStorage.getById(currentConversationId)) {
            newConversation();
        }

        isStreaming    = true;
        cancelStreaming = false;
        ChatUI.setSendState(true);

        // Upload attachments first
        let uploadedFiles = [];
        if (pendingAttachments.length > 0) {
            uploadedFiles     = await uploadPendingAttachments();
            pendingAttachments = [];
            ChatUI.renderAttachmentPreviews([]);
        }

        if (!message && uploadedFiles.length === 0) {
            isStreaming = false;
            ChatUI.setSendState(false);
            return;
        }

        // Persist user message
        const userMsg = {
            role:        'user',
            content:     message || '',
            attachments: uploadedFiles.length > 0 ? uploadedFiles : undefined,
        };
        ConversationStorage.addMessage(currentConversationId, userMsg);

        // Auto-title
        const conv = ConversationStorage.getById(currentConversationId);
        if (conv) {
            const userCount = conv.messages.filter(m => m.role === 'user').length;
            if (userCount === 1 && message) {
                const title = ConversationStorage.autoTitle(message, MAX_TITLE_LENGTH);
                ConversationStorage.rename(currentConversationId, title);
                ChatUI.updateChatHeader(title);
            }
        }

        // Render user message immediately
        ChatUI.appendMessage('user', userMsg.content, { attachments: uploadedFiles });
        textarea.val('');
        ChatUI.autoResize(textarea[0]);
        $('.start-chatting').remove();

        refreshSidebar(); // re-sort so this conv floats to top

        // Show thinking state
        ChatUI.showThinking();

        // Build history for the API (all prior messages)
        const freshConv = ConversationStorage.getById(currentConversationId);
        const history   = freshConv
            ? freshConv.messages.slice(0, -1) // exclude the message we just added (it's the "latest")
            : [];

        try {
            const result = await ChatApiService.sendMessage(message, history);
            ChatUI.removeThinking();

            // Create streaming placeholder
            const streamHandle = ChatUI.createStreamingMessage();

            // Stream reasoning first (if present)
            if (result.reasoning_content) {
                await ChatApiService.simulateStream(
                    result.reasoning_content,
                    chunk => streamHandle.appendReasoning(chunk),
                    () => cancelStreaming,
                    5  // slightly faster for reasoning
                );
                streamHandle.finishReasoning();
            }

            if (cancelStreaming) {
                streamHandle.finalise(result.content, result.reasoning_content);
            } else {
                // Stream main content
                await ChatApiService.simulateStream(
                    result.content,
                    chunk => streamHandle.appendContent(chunk),
                    () => cancelStreaming,
                    8
                );
                streamHandle.finalise(result.content, result.reasoning_content);
            }

            // Persist assistant message
            const assistantMsg = {
                role:              'assistant',
                content:           result.content,
                reasoning_content: result.reasoning_content || undefined,
            };
            ConversationStorage.addMessage(currentConversationId, assistantMsg);

            // Refresh sidebar to update last_updated ordering
            refreshSidebar();

        } catch (err) {
            ChatUI.removeThinking();

            if (err.code === 'CANCELLED') {
                // User cancelled — show partial content if any, else remove the row
                // (the streamHandle may or may not exist — safe to ignore)
            } else {
                // Show error inside the message row
                const errHandle = ChatUI.createStreamingMessage();
                errHandle.showError(err.message || 'An error occurred. Please try again.');

                // Bind retry
                $(`#${errHandle.id}_retry`).on('click', () => {
                    // Remove the error bubble and retry
                    $(`#${errHandle.id}`).remove();
                    // Remove the last (failed) user message from storage to avoid double-send
                    const c = ConversationStorage.getById(currentConversationId);
                    if (c && c.messages.length > 0 && c.messages[c.messages.length - 1].role === 'user') {
                        c.messages.pop();
                        ConversationStorage.save(c);
                    }
                    // Re-populate textarea and retry
                    $('#user-message').val(message);
                    ChatUI.autoResize($('#user-message')[0]);
                    // Remove the user bubble that was rendered
                    $('#chat-messages .message.user').last().remove();
                    sendMessage();
                });
            }
        } finally {
            isStreaming    = false;
            cancelStreaming = false;
            ChatUI.setSendState(false);
            setTimeout(() => $('#user-message').focus(), 50);
        }
    }

    function stopStreaming() {
        if (isStreaming) {
            cancelStreaming = true;
            ChatApiService.cancel();
        }
    }


    // =========================================================================
    // EVENT BINDINGS
    // =========================================================================

    // Send
    $('#send-btn').on('click', sendMessage);
    $('#user-message')
        .on('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        })
        .on('input', function () { ChatUI.autoResize(this); });

    // Stop
    $('#stop-btn').on('click', stopStreaming);

    // New chat
    $('#compose-btn').on('click', () => { ChatUI.closeDropdowns(); newConversation(); });

    // Sidebar collapse / expand
    $('#collapse-sidebar-btn').on('click', () => {
        $('#sidebar').addClass('collapsed');
        $('#expand-sidebar-btn').show();
    });
    $('#expand-sidebar-btn').on('click', () => {
        $('#sidebar').removeClass('collapsed');
        $('#expand-sidebar-btn').hide();
    });

    // Search
    $('#search-input').on('input', refreshSidebar);

    // Attach file
    $('#attach-btn').on('click', () => $('#file-input').click());
    $('#file-input').on('change', function (e) {
        const files       = Array.from(e.target.files);
        const maxSize     = 10 * 1024 * 1024;
        const allowedTypes= ['image/jpeg','image/png','image/gif','image/webp',
                             'application/pdf','application/msword',
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                             'text/plain'];
        for (const file of files) {
            if (pendingAttachments.length >= 3) {
                frappe.show_alert({ message: 'Maximum 3 attachments allowed', indicator: 'red' }, 2);
                break;
            }
            if (!allowedTypes.includes(file.type)) {
                frappe.show_alert({ message: `File type not allowed: ${file.name}`, indicator: 'red' }, 2);
                continue;
            }
            if (file.size > maxSize) {
                frappe.show_alert({ message: `File too large: ${file.name}`, indicator: 'red' }, 2);
                continue;
            }
            pendingAttachments.push({
                id:   'att_' + Date.now() + Math.random(),
                file, name: file.name, size: file.size, type: file.type
            });
        }
        this.value = '';
        ChatUI.renderAttachmentPreviews(pendingAttachments);
    });
    // Remove attachment
    $(document).on('click', '.remove-file', function (e) {
        e.stopPropagation();
        const id = $(this).data('id');
        pendingAttachments = pendingAttachments.filter(a => a.id !== id);
        ChatUI.renderAttachmentPreviews(pendingAttachments);
    });

    // Theme toggle
    $('#theme-toggle-btn').on('click', () => {
        isDarkMode = !isDarkMode;
        ChatUI.applyTheme(isDarkMode);
    });

    // Close dropdowns on outside click
    $(document).on('click', e => {
        if (!$(e.target).closest('.dropdown-menu, .more-btn').length) {
            ChatUI.closeDropdowns();
        }
    });

    // Lightbox close
    $(document).on('click', '#lightbox-close, .lightbox-overlay', () => {
        $('#lightbox-modal').removeClass('show');
        $('#lightbox-image').attr('src', '');
    });
    $(document).on('keydown', e => {
        if (e.key === 'Escape' && $('#lightbox-modal').hasClass('show')) {
            $('#lightbox-modal').removeClass('show');
        }
    });


    // =========================================================================
    // INIT
    // =========================================================================
    ChatUI.applyTheme(isDarkMode);
    ChatUI.setSendState(false); // ensure stop-btn is hidden

    // Load conversations from localStorage (seeding dummy data if empty)
    let storedConvs = ConversationStorage.getAll();
    if (storedConvs.length === 0) {
        // Seed with representative dummy conversations so the sidebar is not empty
        const seedData = [
            {
                title: 'How to build a REST API with Node.js',
                messages: [
                    { role: 'user', content: 'How do I build a REST API with Node.js?' },
                    { role: 'assistant', content: 'Building a REST API with Node.js is straightforward. Here\'s a quick example using **Express**:\n\n```javascript\nconst express = require(\'express\');\nconst app = express();\n\napp.use(express.json());\n\napp.get(\'/api/users\', (req, res) => {\n  res.json({ users: [] });\n});\n\napp.listen(3000, () => console.log(\'Server running on port 3000\'));\n```\n\nThis sets up a basic GET endpoint.' }
                ],
                created_at:   new Date(Date.now() - 1000 * 60 * 5).toISOString(),
                last_updated: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
            },
            {
                title: 'Best practices for React performance',
                messages: [
                    { role: 'user', content: 'What are best practices for React performance?' },
                    { role: 'assistant', content: 'Key React performance practices:\n\n1. Use `React.memo` to prevent unnecessary re-renders\n2. Leverage `useMemo` and `useCallback`\n3. Code-split with `React.lazy`\n4. Virtualise long lists with `react-window`' }
                ],
                created_at:   new Date(Date.now() - 86400000).toISOString(),
                last_updated: new Date(Date.now() - 86400000).toISOString(),
            },
            {
                title: 'Docker container orchestration guide',
                messages: [
                    { role: 'user', content: 'Guide me on Docker container orchestration' },
                    { role: 'assistant', content: 'Docker container orchestration with **Kubernetes** or **Docker Swarm** lets you manage container clusters at scale, handling scaling, networking, and self-healing automatically.' }
                ],
                created_at:   new Date(Date.now() - 3 * 86400000).toISOString(),
                last_updated: new Date(Date.now() - 3 * 86400000).toISOString(),
            }
        ];
        seedData.forEach(s => ConversationStorage.create(s));
    }

    ChatUI.showEmptyState();
    refreshSidebar();

    // Textarea initial size
    const ta = $('#user-message')[0];
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 44) + 'px'; }
};