import API from "../config/api";

const ChatService = {

    // ─── API 1: Get conversations (org-scoped) ────────────────
    getConversations: (userId, orgId) => {
        return API.get(`/chat/conversations?user_id=${userId}&org_id=${orgId}`);
    },

    // ─── API 2: Get messages in a thread ─────────────────────
    getMessages: (threadId, userId) => {
        return API.get(`/chat/messages/${threadId}?user_id=${userId}`);
    },

    // ─── API 3: Send a message ────────────────────────────────
    sendMessage: (threadId, message, senderId, orgId, replyToId = null) => {
        return API.post("/chat/send", {
            thread_id:   threadId,
            message:     message,
            sender_id:   senderId,
            org_id:      orgId,
            reply_to_id: replyToId,
        });
    },

    // ─── API 4: Create new thread ─────────────────────────────
    createThread: (senderId, receiverId, orgId) => {
        return API.post("/chat/thread/create", {
            sender_id:   senderId,
            receiver_id: receiverId,
            org_id:      orgId,
        });
    },

    // ─── API 5: Get users (org-scoped) ────────────────────────
    getUsers: (userId, search = "", orgId) => {
        return API.get(`/chat/users?user_id=${userId}&search=${search}&org_id=${orgId}`);
    },

    // ─── API 6: Mark thread as read ───────────────────────────
    markAsRead: (threadId, userId) => {
        return API.post(`/chat/read/${threadId}`, { user_id: userId });
    },

    // ─── API 7: Typing indicator ──────────────────────────────
    typingIndicator: (threadId, userId, isTyping) => {
        return API.post("/chat/typing", {
            thread_id: threadId,
            user_id:   userId,
            is_typing: isTyping,
        });
    },

    // ─── API 8: Edit message ──────────────────────────────────
    editMessage: (messageId, userId, newMessage) => {
        return API.post(`/chat/message/edit/${messageId}`, {
            user_id: userId,
            message: newMessage,
        });
    },

    // ─── API 9: Delete message ────────────────────────────────
    deleteMessage: (messageId, userId) => {
        return API.post(`/chat/message/delete/${messageId}`, {
            user_id: userId,
        });
    },

    // ─── API 10: Delete conversation ──────────────────────────
    deleteConversation: (threadId, userId) => {
        return API.post(`/chat/conversation/delete/${threadId}`, {
            user_id: userId,
        });
    },
};

export default ChatService;
