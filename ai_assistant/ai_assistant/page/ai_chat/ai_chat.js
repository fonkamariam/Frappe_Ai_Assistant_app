frappe.pages['ai-chat'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    // Load HTML
    $(page.body).html(frappe.render_template("ai_chat", {}));

    // Load CSS
    frappe.require("/assets/ai_assistant/css/ai_chat.css");

    // Chat Logic
    const chatBox = $("#chat-box");

    function addMessage(text, type) {
        const html = `<div class="message ${type}"><b>${type === 'user' ? 'You' : 'AI'}:</b> ${text}</div>`;
        chatBox.append(html);
        chatBox.scrollTop(chatBox[0].scrollHeight);
    }

    $("#send-btn").on('click', function() {
        let message = $("#user-message").val().trim();
        if (!message) return;

        addMessage(message, 'user');
        $("#user-message").val("");

        let typing = $('<div class="message assistant typing">AI is thinking...</div>');
        chatBox.append(typing);
        chatBox.scrollTop(chatBox[0].scrollHeight);

        setTimeout(() => {
            typing.remove();
            addMessage("Hello! This is a basic AI Assistant. How can I help you?", 'assistant');
        }, 1000);
    });

    $("#user-message").keypress(function(e) {
        if (e.which === 13) {
            e.preventDefault();
            $("#send-btn").click();
        }
    });
};