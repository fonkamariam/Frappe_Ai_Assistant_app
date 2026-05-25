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
    let conversations = [];
    const MAX_TITLE_LENGTH = 30;

    function getDummyConversations() {
        return [
            { id: '1', title: 'Welcome & introduction', messages: [
                { role: 'assistant', content: 'Hello! I’m your AI assistant. How can I help you today?' }
            ], timestamp: new Date() },
            { id: '2', title: 'Project ideas brainstorming', messages: [
                { role: 'user', content: 'Give me some project ideas for a startup.' },
                { role: 'assistant', content: 'Sure! Here are five innovative ideas:\n1. AI‑powered personal finance coach.\n2. Sustainable packaging marketplace.\n3. Remote team wellness platform.\n4. Smart home energy optimizer.\n5. On‑demand tutoring for niche skills.' }
            ], timestamp: new Date(Date.now() - 86400000) },
            { id: '3', title: 'Recipe suggestions', messages: [
                { role: 'user', content: 'What can I cook with chicken and rice?' },
                { role: 'assistant', content: 'You can make chicken fried rice, chicken biryani, or lemon herb grilled chicken with rice. Would you like a recipe for any of these?' }
            ], timestamp: new Date(Date.now() - 2 * 86400000) }
        ];
    }

    const dummyResponses = [
        "That’s an interesting question! Let me think about it...",
        "I’m a mock AI, so I can’t give real answers yet. But here’s a placeholder.",
        "Sure! Here’s a detailed response for demonstration purposes.",
        "Based on your query, I would suggest exploring the topic further.",
        "I'm still learning! In a real scenario, I would fetch the latest information."
    ];

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
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }

    function closeDropdowns() {
        $('.dropdown-menu.show').removeClass('show');
    }

    function truncateTitle(title) {
        return title.length > MAX_TITLE_LENGTH ? title.substring(0, MAX_TITLE_LENGTH) + '...' : title;
    }

    // Update fixed header title and visibility
    function updateChatHeader(title) {
        if (title) {
            $('#chat-title').text(title);
            $('#chat-header').show();
        } else {
            $('#chat-header').hide();
        }
    }

    // ========== CONVERSATION RENDERING ==========
    function groupByDate(convs) {
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'days').startOf('day');
        const weekAgo = moment().subtract(7, 'days').startOf('day');
        const groups = { 'Today': [], 'Yesterday': [], 'Previous 7 Days': [], 'Older': [] };
        convs.forEach(c => {
            const m = moment(c.timestamp);
            if (m.isSameOrAfter(today)) groups['Today'].push(c);
            else if (m.isSameOrAfter(yesterday)) groups['Yesterday'].push(c);
            else if (m.isSameOrAfter(weekAgo)) groups['Previous 7 Days'].push(c);
            else groups['Older'].push(c);
        });
        return groups;
    }

    function renderConversationList(filter = '') {
        const container = $('#conversation-list');
        container.empty();

        let visibleConversations = conversations.filter(c => c.messages.length > 0);
        if (filter) {
            visibleConversations = visibleConversations.filter(c => 
                c.title.toLowerCase().includes(filter.toLowerCase())
            );
        }

        const groups = groupByDate(visibleConversations);
        Object.keys(groups).forEach(label => {
            if (groups[label].length === 0) return;
            container.append(`<div class="date-group"><div class="date-label">${label}</div></div>`);
            groups[label].forEach(conv => {
                const item = $(`
                    <div class="conversation-item${conv.id === currentConversationId ? ' active' : ''}" data-id="${conv.id}">
                        <span class="title">${truncateTitle(conv.title)}</span>
                        <button class="more-btn">⋯</button>
                        <div class="dropdown-menu">
                            <div class="dropdown-item rename-action">Rename</div>
                            <div class="dropdown-item danger delete-action">Delete</div>
                        </div>
                    </div>
                `);

                // Click on conversation (ignore if already active)
                item.on('click', function(e) {
                    if ($(e.target).closest('.more-btn, .dropdown-menu, .title input').length) return;
                    closeDropdowns();
                    if (conv.id === currentConversationId) return; // already active – do nothing
                    loadConversation(conv.id);
                });

                // Three-dot button toggle
                item.find('.more-btn').on('click', function(e) {
                    e.stopPropagation();
                    closeDropdowns();
                    item.find('.dropdown-menu').toggleClass('show');
                });

                // Rename action – inline editing
                item.find('.rename-action').on('click', function(e) {
                    e.stopPropagation();
                    closeDropdowns();
                    startInlineRename(item, conv);
                });

                // Delete action
                item.find('.delete-action').on('click', function(e) {
                    e.stopPropagation();
                    closeDropdowns();
                    deleteConversation(conv.id);
                });

                container.append(item);
            });
        });
    }

    function startInlineRename(item, conv) {
        const titleSpan = item.find('.title');
        const currentTitle = conv.title;
        const input = $(`<input type="text" value="${currentTitle}" />`);
        titleSpan.html(input);
        input.focus();
        input.select();

        const save = () => {
            const newTitle = input.val().trim();
            if (newTitle && newTitle !== currentTitle) {
                conv.title = newTitle;
                renderConversationList();
                showToast('Conversation renamed', 'green');
                // Update header if this conversation is active
                if (conv.id === currentConversationId) {
                    updateChatHeader(conv.title);
                }
            } else {
                titleSpan.text(truncateTitle(currentTitle));
            }
        };

        input.on('blur', save);
        input.on('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.trigger('blur');
            } else if (e.key === 'Escape') {
                titleSpan.text(truncateTitle(currentTitle));
            }
        });
    }

    // ========== MESSAGE RENDERING ==========
    function addMessage(role, content, isThinking = false) {
        const chatBox = $('#chat-messages');
        if (isThinking) {
            chatBox.append(`<div class="thinking">Thinking...</div>`);
        } else {
            const bubble = `<div class="message ${role}"><div class="bubble">${content}</div></div>`;
            chatBox.append(bubble);
        }
        scrollToBottom();
    }

    function clearChat() {
        $('#chat-messages').empty();
        $('.start-chatting').remove();
    }

    function showStartChatting() {
        const main = $('.ai-chat-main');
        if (!$('.start-chatting').length) {
            main.append('<div class="start-chatting">Start Chatting</div>');
        }
    }

    // ========== CONVERSATION ACTIONS ==========
    function loadConversation(id) {
        if (id === currentConversationId) return; // already loaded
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        currentConversationId = id;
        clearChat();
        conv.messages.forEach(m => addMessage(m.role, m.content));
        $('#empty-state').hide();
        $('#chat-messages, #input-container').show();
        // Show header with title
        updateChatHeader(conv.title);
        // Remove "Start Chatting" if messages exist
        if (conv.messages.length === 0) {
            showStartChatting();
        }
        renderConversationList();
        scrollToBottom();
        // Reset textarea and focus
        const textarea = $('#user-message')[0];
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
        $('#user-message').focus();
    }

    function newConversation() {
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
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
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
                    updateChatHeader(null);
                }
            }
            renderConversationList();
            showToast('Conversation deleted', 'red');
        });
    }

    // ========== MESSAGE SENDING ==========
    async function sendMessage() {
        const textarea = $('#user-message');
        const message = textarea.val().trim();
        if (!message) return;

        if (!currentConversationId || !conversations.find(c => c.id === currentConversationId)) {
            newConversation();
        }
        const conv = conversations.find(c => c.id === currentConversationId);
        if (!conv) return;

        conv.messages.push({ role: 'user', content: message });
        addMessage('user', message);
        textarea.val('');
        autoResize(textarea[0]);

        // Update title and header if this is the first user message
        const userMsgCount = conv.messages.filter(m => m.role === 'user').length;
        if (userMsgCount === 1) {
            conv.title = message.length > MAX_TITLE_LENGTH ? message.substring(0, MAX_TITLE_LENGTH) + '...' : message;
            updateChatHeader(conv.title);
            renderConversationList();
        }

        // Remove "Start Chatting" now that we have messages
        $('.start-chatting').remove();

        disableSend(true);
        addMessage('assistant', '', true);

        setTimeout(() => {
            $('.thinking').remove();
            const response = dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
            conv.messages.push({ role: 'assistant', content: response });
            addMessage('assistant', response);
            disableSend(false);
            // Ensure input is focused after response
            $('#user-message').focus();
        }, 1500 + Math.random() * 1000);
    }

    // ========== EVENT BINDINGS ==========
    $('#new-chat-btn').on('click', function() {
        closeDropdowns();
        newConversation();
    });
    $('#send-btn').on('click', sendMessage);
    $('#user-message').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }).on('input', function() {
        autoResize(this);
    });
    $('#search-input').on('input', function() {
        renderConversationList($(this).val());
    });
    $('#attach-btn').on('click', function() {
        showToast('File upload will be added in Phase 6', 'orange');
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.dropdown-menu, .more-btn').length) {
            closeDropdowns();
        }
    });

	// ========== INIT ==========
    conversations = getDummyConversations();
    // Do NOT auto‑select any conversation – remain in the empty welcome state
    currentConversationId = null;
    $('#empty-state').show();
    $('#chat-messages, #input-container').hide();
    $('#chat-header').hide();
    renderConversationList();
    const textarea = $('#user-message')[0];
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }
};