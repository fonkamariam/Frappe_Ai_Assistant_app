frappe.pages['ai-chat'].on_page_load = async function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    $(page.body).html(frappe.render_template("ai_chat", {}));
    frappe.require("/assets/ai_assistant/css/ai_chat.css");

    // ========== STATE ==========
    let currentConversationId = null;
    let pendingAttachments = [];
    let conversations = [];
    let isDarkMode = true;
    const MAX_TITLE_LENGTH = 30;

    // ========== DUMMY DATA ==========
    function getDummyConversations() {
        return [
            {
                id: '1',
                title: 'How to build a REST API with Node.js',
                messages: [
                    { role: 'user', content: 'How do I build a REST API with Node.js?' },
                    { role: 'assistant', content: 'Building a REST API with Node.js is straightforward. Here\'s a quick example using **Express**:\n\n```javascript\nconst express = require(\'express\');\nconst app = express();\n\napp.use(express.json());\n\napp.get(\'/api/users\', (req, res) => {\n  res.json({ users: [] });\n});\n\napp.listen(3000, () => console.log(\'Server running on port 3000\'));\n```\n\nThis sets up a basic GET endpoint. You can extend it with POST, PUT, and DELETE routes as needed.' }
                ],
                timestamp: new Date()
            },
            {
                id: '2',
                title: 'Explain quantum computing in simple terms',
                messages: [
                    { role: 'user', content: 'Explain quantum computing in simple terms' },
                    { role: 'assistant', content: 'Quantum computing uses **qubits** instead of classical bits. While a classical bit is either 0 or 1, a qubit can be both simultaneously — this is called *superposition*. This allows quantum computers to solve certain problems exponentially faster than classical computers.' }
                ],
                timestamp: new Date()
            },
            {
                id: '3',
                title: 'Best practices for React performance',
                messages: [
                    { role: 'user', content: 'What are best practices for React performance?' },
                    { role: 'assistant', content: 'Here are the key React performance practices:\n\n1. Use `React.memo` to prevent unnecessary re-renders\n2. Leverage `useMemo` and `useCallback` for expensive computations\n3. Code-split with `React.lazy` and `Suspense`\n4. Avoid inline object/function creation in JSX\n5. Use virtualization for long lists (`react-window`)' }
                ],
                timestamp: new Date(Date.now() - 86400000)
            },
            {
                id: '4',
                title: 'Design patterns in JavaScript',
                messages: [
                    { role: 'user', content: 'What are common design patterns in JavaScript?' },
                    { role: 'assistant', content: 'Common JavaScript design patterns include the **Module**, **Observer**, **Factory**, and **Singleton** patterns. Each solves different architectural problems.' }
                ],
                timestamp: new Date(Date.now() - 86400000)
            },
            {
                id: '5',
                title: 'Docker container orchestration guide',
                messages: [
                    { role: 'user', content: 'Guide me on Docker container orchestration' },
                    { role: 'assistant', content: 'Docker container orchestration with **Kubernetes** or **Docker Swarm** allows you to manage clusters of containers at scale, handling scaling, networking, and self-healing automatically.' }
                ],
                timestamp: new Date(Date.now() - 3 * 86400000)
            },
            {
                id: '6',
                title: 'Machine learning model deployment',
                messages: [
                    { role: 'user', content: 'How do I deploy a machine learning model?' },
                    { role: 'assistant', content: 'There are several approaches to ML model deployment: **Flask/FastAPI** for a REST endpoint, **TensorFlow Serving**, **AWS SageMaker**, or containerized via Docker. The right choice depends on your scale and infrastructure.' }
                ],
                timestamp: new Date(Date.now() - 3 * 86400000)
            }
        ];
    }

    const dummyResponses = [
        "That's an interesting question! Let me think about it.\n\nBased on what you've shared, there are a few approaches worth considering. The key is to start with the simplest solution and iterate from there.",
        "Great point! Here's a quick example in **JavaScript**:\n\n```javascript\n// Coming soon!\nconst response = await aiAssistant.chat(message);\nconsole.log(response);\n```\n\nOnce connected, you'll see real AI responses here.",
        "I appreciate your question! This is a demo UI — API integration is coming soon. The response showcases how messages render with **markdown**, `inline code`, and proper formatting.",
        "Sure! Here are a few things to keep in mind:\n\n1. Start simple and iterate\n2. Test thoroughly at each step\n3. Document your approach\n4. Consider edge cases early",
        "I'm still learning! In a real scenario, I would fetch the latest information and provide a comprehensive answer tailored to your needs."
    ];

    // ========== LIGHTWEIGHT MARKDOWN PARSER ==========
    function renderMarkdown(text) {
        if (!text) return '';

        // Escape HTML first (for safety)
        function escapeHtml(str) {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        // Store code blocks separately to avoid double-processing
        const codeBlocks = [];
        let result = text;

        // Fenced code blocks ```lang\ncode```
        result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, function(match, lang, code) {
            const escaped = escapeHtml(code.trimEnd());
            const langLabel = lang || 'code';
            const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
            codeBlocks.push(
                `<div class="code-block-wrap">` +
                `<div class="code-block-header">` +
                `<span class="code-lang">${escapeHtml(langLabel)}</span>` +
                `<button class="copy-code-btn" data-code="${escaped.replace(/"/g, '&quot;')}">` +
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>` +
                ` Copy</button>` +
                `</div>` +
                `<pre>${escaped}</pre>` +
                `</div>`
            );
            return placeholder;
        });

        // Inline code `code`
        result = result.replace(/`([^`]+)`/g, function(match, code) {
            return `<code>${escapeHtml(code)}</code>`;
        });

        // Bold **text**
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic *text* or _text_
        result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        result = result.replace(/_(.+?)_/g, '<em>$1</em>');

        // Process line by line for lists and paragraphs
        const lines = result.split('\n');
        const output = [];
        let inOl = false;
        let inUl = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Ordered list
            const olMatch = line.match(/^(\d+)\.\s+(.+)/);
            if (olMatch) {
                if (!inOl) { output.push('<ol>'); inOl = true; }
                output.push(`<li>${olMatch[2]}</li>`);
                continue;
            } else if (inOl) {
                output.push('</ol>');
                inOl = false;
            }

            // Unordered list
            const ulMatch = line.match(/^[-*]\s+(.+)/);
            if (ulMatch) {
                if (!inUl) { output.push('<ul>'); inUl = true; }
                output.push(`<li>${ulMatch[1]}</li>`);
                continue;
            } else if (inUl) {
                output.push('</ul>');
                inUl = false;
            }

            // Code block placeholder
            if (line.includes('__CODEBLOCK_')) {
                output.push(line);
                continue;
            }

            // Empty line
            if (line.trim() === '') {
                output.push('');
                continue;
            }

            // Normal paragraph line
            output.push(`<p>${line}</p>`);
        }

        if (inOl) output.push('</ol>');
        if (inUl) output.push('</ul>');

        result = output.join('');

        // Restore code blocks
        codeBlocks.forEach((block, i) => {
            result = result.replace(new RegExp(`<p>__CODEBLOCK_${i}__</p>|__CODEBLOCK_${i}__`), block);
        });

        return result;
    }

    // ========== UI HELPERS ==========
    function showToast(message, type = 'info') {
        frappe.show_alert({ message, indicator: type }, 3);
    }

    function disableSend(disabled) {
        $('#send-btn').prop('disabled', disabled);
        $('#user-message').prop('disabled', disabled);
    }

    function scrollToBottom() {
        const chatBox = document.getElementById('chat-messages');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    }

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 44), 180) + 'px';
    }

    function closeDropdowns() {
        $('.dropdown-menu.show').removeClass('show');
    }

    function truncateTitle(title) {
        return title.length > MAX_TITLE_LENGTH
            ? title.substring(0, MAX_TITLE_LENGTH) + '...'
            : title;
    }

    function updateChatHeader(title) {
        if (title) {
            $('#chat-title').text(title);
        }
    }

    // ========== THEME ==========
    function applyTheme() {
        const wrapper = $('#ai-chat-wrapper');
        const label = $('#theme-label');
        const icon = $('#theme-icon');
        if (isDarkMode) {
            wrapper.removeClass('light-mode');
            label.text('Light Mode');
            // Sun icon (already the default SVG in HTML)
        } else {
            wrapper.addClass('light-mode');
            label.text('Dark Mode');
        }
    }

    $('#theme-toggle-btn').on('click', function () {
        isDarkMode = !isDarkMode;
        applyTheme();
    });

    // ========== SIDEBAR COLLAPSE ==========
    $('#collapse-sidebar-btn').on('click', function () {
        $('#sidebar').addClass('collapsed');
        $('#expand-sidebar-btn').show();
    });
    $('#expand-sidebar-btn').on('click', function () {
        $('#sidebar').removeClass('collapsed');
        $('#expand-sidebar-btn').hide();
    });

    // New chat via compose button (top of sidebar)
    $('#compose-btn').on('click', function () {
        closeDropdowns();
        newConversation();
    });

    // ========== CONVERSATION RENDERING ==========
    function groupByDate(convs) {
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'days').startOf('day');
        const weekAgo = moment().subtract(7, 'days').startOf('day');
        const monthAgo = moment().subtract(30, 'days').startOf('day');
        const groups = {
            'Today': [],
            'Yesterday': [],
            'Previous 7 Days': [],
            'Previous 30 Days': [],
            'Older': []
        };
        convs.forEach(c => {
            const m = moment(c.timestamp);
            if (m.isSameOrAfter(today)) groups['Today'].push(c);
            else if (m.isSameOrAfter(yesterday)) groups['Yesterday'].push(c);
            else if (m.isSameOrAfter(weekAgo)) groups['Previous 7 Days'].push(c);
            else if (m.isSameOrAfter(monthAgo)) groups['Previous 30 Days'].push(c);
            else groups['Older'].push(c);
        });
        return groups;
    }

    function renderConversationList(filter = '') {
        const container = $('#conversation-list');
        container.empty();

        let visible = conversations.filter(c => c.messages.length > 0);
        if (filter) {
            visible = visible.filter(c =>
                c.title.toLowerCase().includes(filter.toLowerCase())
            );
        }

        const groups = groupByDate(visible);
        Object.keys(groups).forEach(label => {
            if (groups[label].length === 0) return;
            const groupEl = $(`<div class="date-group"><div class="date-label">${label}</div></div>`);
            groups[label].forEach(conv => {
                const item = $(`
                    <div class="conversation-item${conv.id === currentConversationId ? ' active' : ''}" data-id="${conv.id}">
                        <span class="title">${truncateTitle(conv.title)}</span>
                        <button class="more-btn" title="More options">⋯</button>
                        <div class="dropdown-menu">
                            <div class="dropdown-item rename-action">Rename</div>
                            <div class="dropdown-item danger delete-action">Delete</div>
                        </div>
                    </div>
                `);

                item.on('click', function (e) {
                    if ($(e.target).closest('.more-btn, .dropdown-menu, .title input').length) return;
                    closeDropdowns();
                    if (conv.id === currentConversationId) return;
                    loadConversation(conv.id);
                });

                item.find('.more-btn').on('click', function (e) {
                    e.stopPropagation();
                    closeDropdowns();
                    item.find('.dropdown-menu').toggleClass('show');
                });

                item.find('.rename-action').on('click', function (e) {
                    e.stopPropagation();
                    closeDropdowns();
                    startInlineRename(item, conv);
                });

                item.find('.delete-action').on('click', function (e) {
                    e.stopPropagation();
                    closeDropdowns();
                    deleteConversation(conv.id);
                });

                groupEl.append(item);
            });
            container.append(groupEl);
        });
    }

    function startInlineRename(item, conv) {
        const titleSpan = item.find('.title');
        const currentTitle = conv.title;
        const input = $(`<input type="text" value="${currentTitle}" />`);
        titleSpan.html(input);
        input.focus().select();

        const save = () => {
            const newTitle = input.val().trim();
            if (newTitle && newTitle !== currentTitle) {
                conv.title = newTitle;
                renderConversationList();
                showToast('Conversation renamed', 'green');
                if (conv.id === currentConversationId) {
                    updateChatHeader(conv.title);
                }
            } else {
                titleSpan.text(truncateTitle(currentTitle));
            }
        };

        input.on('blur', save);
        input.on('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); input.trigger('blur'); }
            else if (e.key === 'Escape') { titleSpan.text(truncateTitle(currentTitle)); }
        });
    }

    // ========== MESSAGE RENDERING ==========
    function addMessage(role, content, isThinking = false, attachments = []) {
        const chatBox = $('#chat-messages');

        if (isThinking) {
            const thinkingHtml = `
                <div class="message assistant thinking-row" id="thinking-indicator">
                    <div class="msg-avatar avatar-bot">✦</div>
                    <div class="msg-body">
                        <div class="thinking-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>`;
            chatBox.append(thinkingHtml);
            scrollToBottom();
            return;
        }

        const isUser = role === 'user';
        const authorLabel = isUser ? 'You' : 'AI Assistant';
        const avatarHtml = isUser
            ? `<div class="msg-avatar avatar-user">U</div>`
            : `<div class="msg-avatar avatar-bot">✦</div>`;

        // Build bubble content
        let bubbleContent = '';

        // Attachments
        if (attachments && attachments.length > 0) {
            const attHtml = attachments.map(a => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.file_url);
                if (isImage) {
                    return `<div class="chat-attachment-preview" data-url="${a.file_url}" data-name="${a.file_name}">
                        <img src="${a.file_url}" alt="${a.file_name}">
                    </div>`;
                } else {
                    const ext = a.file_name.split('.').pop().toUpperCase();
                    return `<div class="file-card">
                        <span class="file-card-icon">📄</span>
                        <div class="file-card-info">
                            <span class="file-card-name">${a.file_name}</span>
                            <span class="file-card-size">${ext} file</span>
                        </div>
                    </div>`;
                }
            }).join('');
            bubbleContent += `<div class="attachments-grid">${attHtml}</div>`;
        }

        // Text content with markdown
        if (content) {
            bubbleContent += renderMarkdown(content);
        }

        const msgHtml = `
            <div class="message ${role}">
                ${avatarHtml}
                <div class="msg-body">
                    <span class="msg-author">${authorLabel}</span>
                    <div class="bubble">${bubbleContent}</div>
                </div>
            </div>`;

        chatBox.append(msgHtml);

        // Bind copy buttons for code blocks
        chatBox.find('.copy-code-btn').last().off('click').on('click', function () {
            const code = $(this).attr('data-code')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"');
            navigator.clipboard.writeText(code).then(() => {
                const btn = $(this);
                btn.html('<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!');
                setTimeout(() => {
                    btn.html('<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy');
                }, 2000);
            }).catch(() => {
                showToast('Copy failed — please copy manually', 'red');
            });
        });

        // Bind lightbox for image attachments
        chatBox.find('.chat-attachment-preview[data-url]').off('click').on('click', function () {
            openLightbox($(this).data('url'), $(this).data('name'));
        });

        scrollToBottom();
    }

    function clearChat() {
        $('#chat-messages').empty();
        $('.start-chatting').remove();
    }

    function showStartChatting() {
        const main = $('.ai-chat-main');
        if (!$('.start-chatting').length) {
            main.append('<div class="start-chatting">Start chatting…</div>');
        }
    }

    // ========== CONVERSATION ACTIONS ==========
    function loadConversation(id) {
        pendingAttachments = [];
        renderAttachmentPreviews();
        if (id === currentConversationId) return;
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        currentConversationId = id;
        clearChat();
        conv.messages.forEach(m => addMessage(m.role, m.content, false, m.attachments || []));
        $('#empty-state').hide();
        $('#chat-messages, #input-container').show();
        updateChatHeader(conv.title);
        if (conv.messages.length === 0) showStartChatting();
        renderConversationList();
        scrollToBottom();
        const textarea = $('#user-message')[0];
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(textarea.scrollHeight, 44) + 'px';
        }
        $('#user-message').focus();
    }

    function newConversation() {
        pendingAttachments = [];
        renderAttachmentPreviews();
        const newId = 'conv_' + Date.now();
        conversations.unshift({
            id: newId,
            title: 'New Chat',
            messages: [],
            timestamp: new Date()
        });
        currentConversationId = newId;
        clearChat();
        $('#empty-state').hide();
        $('#chat-messages, #input-container').show();
        showStartChatting();
        updateChatHeader('New Chat');
        closeDropdowns();
        $('#user-message').val('');
        const textarea = $('#user-message')[0];
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.max(textarea.scrollHeight, 44) + 'px';
        }
        $('#user-message').focus();
    }

    function deleteConversation(id) {
        frappe.confirm('Are you sure you want to delete this conversation?', () => {
            conversations = conversations.filter(c => c.id !== id);
            if (currentConversationId === id) {
                const remaining = conversations.filter(c => c.messages.length > 0);
                currentConversationId = remaining.length ? remaining[0].id : null;
                if (currentConversationId) {
                    loadConversation(currentConversationId);
                } else {
                    $('#empty-state').show();
                    $('#chat-messages, #input-container').hide();
                    $('.start-chatting').remove();
                    updateChatHeader('AI Assistant');
                }
            }
            renderConversationList();
            showToast('Conversation deleted', 'red');
        });
    }

    // ========== FILE UPLOAD ==========
    async function uploadAttachments() {
        const uploaded = [];
        for (let att of pendingAttachments) {
            try {
                const result = await new Promise((resolve, reject) => {
                    const formData = new FormData();
                    formData.append('file', att.file);
                    formData.append('is_private', 1);
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/method/upload_file', true);
                    xhr.setRequestHeader('X-Frappe-CSRF-Token', frappe.csrf_token);
                    xhr.onload = function () {
                        if (xhr.status === 200) {
                            const resp = JSON.parse(xhr.responseText);
                            if (resp.message && resp.message.file_url) resolve(resp.message);
                            else reject(new Error('Upload failed'));
                        } else {
                            reject(new Error('Upload failed'));
                        }
                    };
                    xhr.onerror = () => reject(new Error('Network error'));
                    xhr.send(formData);
                });
                uploaded.push({
                    file_name: result.file_name || att.name,
                    file_url: result.file_url
                });
                $(`.attachment-preview-item[data-id="${att.id}"] .thumb`).removeClass('uploading');
            } catch (err) {
                showToast(`Failed to upload ${att.name}: ${err.message}`, 'red');
            }
        }
        return uploaded;
    }

    // ========== MESSAGE SENDING ==========
    async function sendMessage() {
        const textarea = $('#user-message');
        const message = textarea.val().trim();

        if (!message && pendingAttachments.length === 0) return;

        if (!currentConversationId || !conversations.find(c => c.id === currentConversationId)) {
            newConversation();
        }
        const conv = conversations.find(c => c.id === currentConversationId);
        if (!conv) return;

        disableSend(true);

        let uploadedFiles = [];
        if (pendingAttachments.length > 0) {
            uploadedFiles = await uploadAttachments();
            pendingAttachments = [];
            renderAttachmentPreviews();
        }

        if (!message && uploadedFiles.length === 0) {
            disableSend(false);
            return;
        }

        const msgData = { role: 'user', content: message || '' };
        if (uploadedFiles.length > 0) msgData.attachments = uploadedFiles;
        conv.messages.push(msgData);
        addMessage('user', msgData.content, false, uploadedFiles);
        textarea.val('');
        autoResize(textarea[0]);

        // Auto-title from first user message
        const userMsgCount = conv.messages.filter(m => m.role === 'user').length;
        if (userMsgCount === 1 && message) {
            conv.title = message.length > MAX_TITLE_LENGTH
                ? message.substring(0, MAX_TITLE_LENGTH) + '...'
                : message;
            updateChatHeader(conv.title);
            renderConversationList();
        }

        $('.start-chatting').remove();

        // Thinking indicator
        addMessage('assistant', '', true);

        setTimeout(() => {
            $('#thinking-indicator').remove();
            const response = dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
            conv.messages.push({ role: 'assistant', content: response });
            addMessage('assistant', response);
            disableSend(false);
            $('#user-message').focus();
        }, 1200 + Math.random() * 800);
    }

    // ========== ATTACHMENT PREVIEW (INPUT AREA) ==========
    function truncateFileName(name) {
        const max = 20;
        if (name.length <= max) return name;
        const ext = name.lastIndexOf('.');
        if (ext === -1) return name.substring(0, max - 3) + '...';
        const extension = name.substring(ext);
        return name.substring(0, max - extension.length - 3) + '...' + extension;
    }

    function renderAttachmentPreviews() {
        const container = $('#attachment-previews');
        container.empty();
        pendingAttachments.forEach(att => {
            const isImage = att.type.startsWith('image/');
            const sizeStr = att.size < 1024 ? att.size + ' B'
                : att.size < 1048576 ? (att.size / 1024).toFixed(1) + ' KB'
                : (att.size / 1048576).toFixed(1) + ' MB';
            const item = $(`
                <div class="attachment-preview-item" data-id="${att.id}">
                    ${isImage
                        ? `<img class="thumb uploading" src="${URL.createObjectURL(att.file)}" alt="${att.name}">`
                        : `<span class="file-icon">📄</span>`}
                    <div class="file-info">
                        <span class="file-name" title="${att.name}">${truncateFileName(att.name)}</span>
                        <span class="file-size">${sizeStr}</span>
                    </div>
                    <span class="remove-file" data-id="${att.id}">✕</span>
                </div>
            `);
            container.append(item);
            if (isImage) {
                const img = item.find('.thumb')[0];
                img.src = img.src;
            }
        });

        $('.remove-file').off('click').on('click', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            pendingAttachments = pendingAttachments.filter(a => a.id !== id);
            renderAttachmentPreviews();
        });
    }

    // ========== LIGHTBOX ==========
    function openLightbox(url, name) {
        $('#lightbox-image').attr('src', url).attr('alt', name);
        $('#lightbox-modal').addClass('show');
    }

    function closeLightbox() {
        $('#lightbox-modal').removeClass('show');
        $('#lightbox-image').attr('src', '');
    }

    $(document).on('click', '#lightbox-close, .lightbox-overlay', closeLightbox);
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && $('#lightbox-modal').hasClass('show')) closeLightbox();
    });

    // ========== EVENT BINDINGS ==========
    $('#send-btn').on('click', sendMessage);

    $('#user-message')
        .on('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        })
        .on('input', function () {
            autoResize(this);
        });

    $('#search-input').on('input', function () {
        renderConversationList($(this).val());
    });

    $('#attach-btn').on('click', function () {
        $('#file-input').click();
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('.dropdown-menu, .more-btn').length) {
            closeDropdowns();
        }
    });

    $('#file-input').on('change', function (e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const maxSize = 10 * 1024 * 1024;
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        for (let file of files) {
            if (pendingAttachments.length >= 3) {
                showToast('Maximum 3 attachments allowed', 'red');
                break;
            }
            if (!allowedTypes.includes(file.type)) {
                showToast(`File type not allowed: ${file.name}`, 'red');
                continue;
            }
            if (file.size > maxSize) {
                showToast(`File too large: ${file.name} (max 10MB)`, 'red');
                continue;
            }
            const id = 'att_' + Date.now() + Math.random();
            pendingAttachments.push({ id, file, name: file.name, size: file.size, type: file.type });
        }
        this.value = '';
        renderAttachmentPreviews();
    });

    // ========== INIT ==========
    conversations = getDummyConversations();
    currentConversationId = null;
    isDarkMode = true;
    applyTheme();

    $('#empty-state').show();
    $('#chat-messages, #input-container').hide();
    renderConversationList();

    const textarea = $('#user-message')[0];
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 44) + 'px';
    }
};