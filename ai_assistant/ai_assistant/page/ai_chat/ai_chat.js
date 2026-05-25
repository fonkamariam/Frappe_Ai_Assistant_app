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

    // Dummy data with at least one message so they appear in sidebar
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
        // Reset height to calculate scrollHeight correctly
        textarea.style.height = 'auto';
        // Set to scrollHeight, but not less than 38px (single line)
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }

    // Close any open dropdowns
    function closeDropdowns() {
        $('.dropdown-menu.show').removeClass('show');
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

        // Only show conversations that have at least one message
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
                        <span class="title">${conv.title}</span>
                        <button class="more-btn">⋮</button>
                        <div class="dropdown-menu">
                            <div class="dropdown-item rename-action">Rename</div>
                            <div class="dropdown-item danger delete-action">Delete</div>
                        </div>
                    </div>
                `);

                // Click on the whole item (except actions) loads conversation
                item.on('click', function(e) {
                    if (!$(e.target).closest('.more-btn, .dropdown-menu').length) {
                        closeDropdowns();
                        loadConversation(conv.id);
                    }
                });

                // Three-dot button click: toggle dropdown
                item.find('.more-btn').on('click', function(e) {
                    e.stopPropagation();
                    closeDropdowns();  // close any other open dropdowns
                    item.find('.dropdown-menu').toggleClass('show');
                });

                // Rename action
                item.find('.rename-action').on('click', function(e) {
                    e.stopPropagation();
                    closeDropdowns();
                    renameConversation(conv.id);
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
    }

    // ========== CONVERSATION ACTIONS ==========
    function loadConversation(id) {
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        currentConversationId = id;
        clearChat();
        conv.messages.forEach(m => addMessage(m.role, m.content));
        $('#empty-state').hide();
        $('#chat-messages, #input-container').show();
        renderConversationList();
        scrollToBottom();
        // Reset textarea height
        const textarea = $('#user-message')[0];
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }

    function newConversation() {
        const newId = 'conv_' + Date.now();
        conversations.unshift({
            id: newId,
            title: 'New Chat',   // temporary, will be updated on first message
            messages: [],
            timestamp: new Date()
        });
        currentConversationId = newId;
        clearChat();
        $('#empty-state').hide();
        $('#chat-messages, #input-container').show();
        // Do NOT render the sidebar list because the conversation has no messages yet
        closeDropdowns();
        // Reset input
        $('#user-message').val('');
        const textarea = $('#user-message')[0];
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }

    function deleteConversation(id) {
        frappe.confirm('Are you sure you want to delete this conversation?', () => {
            conversations = conversations.filter(c => c.id !== id);
            if (currentConversationId === id) {
                // Switch to the most recent conversation that has messages, if any
                const remaining = conversations.filter(c => c.messages.length > 0);
                currentConversationId = remaining.length ? remaining[0].id : null;
                if (currentConversationId) {
                    loadConversation(currentConversationId);
                } else {
                    // No conversations left with messages -> show empty state
                    $('#empty-state').show();
                    $('#chat-messages, #input-container').hide();
                }
            }
            renderConversationList();
            showToast('Conversation deleted', 'red');
        });
    }

    function renameConversation(id) {
        const conv = conversations.find(c => c.id === id);
        if (!conv) return;
        const newTitle = prompt('Rename conversation:', conv.title);
        if (newTitle && newTitle.trim()) {
            conv.title = newTitle.trim().substring(0, MAX_TITLE_LENGTH);
            renderConversationList();
            showToast('Conversation renamed', 'green');
        }
    }

    // ========== MESSAGE SENDING ==========
    async function sendMessage() {
        const textarea = $('#user-message');
        const message = textarea.val().trim();
        if (!message) return;

        // If no active conversation, create one first
        if (!currentConversationId || !conversations.find(c => c.id === currentConversationId)) {
            newConversation();
        }
        const conv = conversations.find(c => c.id === currentConversationId);
        if (!conv) return;

        // Add user message
        conv.messages.push({ role: 'user', content: message });
        addMessage('user', message);
        textarea.val('');
        autoResize(textarea[0]);

        // If this is the first message, update title and now show in sidebar
        if (conv.messages.filter(m => m.role === 'user').length === 1 && conv.messages.filter(m => m.role === 'assistant').length === 0) {
            // Still has no assistant response, so title based on user message only
            conv.title = message.length > MAX_TITLE_LENGTH ? message.substring(0, MAX_TITLE_LENGTH) + '...' : message;
            // Now that the conversation has a message, re-render sidebar
            renderConversationList();
        } else if (conv.messages.filter(m => m.role === 'user').length === 1) {
            // First user message already set title, maybe it was a new chat with existing welcome? Not used.
        }

        // Show thinking and disable send
        disableSend(true);
        addMessage('assistant', '', true);

        // Simulate API delay
        setTimeout(() => {
            $('.thinking').remove();
            const response = dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
            conv.messages.push({ role: 'assistant', content: response });
            addMessage('assistant', response);
            disableSend(false);
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

    // Close dropdowns when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.dropdown-menu, .more-btn').length) {
            closeDropdowns();
        }
    });

    // ========== INIT ==========
    conversations = getDummyConversations();
    if (conversations.length > 0) {
        // Load the first conversation with messages
        const firstWithMessages = conversations.find(c => c.messages.length > 0);
        if (firstWithMessages) {
            currentConversationId = firstWithMessages.id;
            loadConversation(currentConversationId);
        } else {
            // Should not happen with dummy data, but fallback
            newConversation();
        }
    } else {
        newConversation();
    }
    renderConversationList();
    // Ensure textarea starts at single line
    const textarea = $('#user-message')[0];
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 38) + 'px';
    }
};