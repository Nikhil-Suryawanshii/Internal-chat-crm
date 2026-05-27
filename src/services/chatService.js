import API from "../config/api";

const ChatService = {

    // Get all conversations
    getConversations: (userId) => {
        return API.get(`/chat/conversations?user_id=${userId}`);
    },

    // Get messages in a thread
    getMessages: (threadId, userId) => {
        return API.get(`/chat/messages/${threadId}?user_id=${userId}`);
    },

    // Send a message
    sendMessage: (threadId, message, senderId) => {
        return API.post("/chat/send", {
            thread_id: threadId,
            message: message,
            sender_id: senderId,
        });
    },

    // Create new thread
    createThread: (senderId, receiverId) => {
        return API.post("/chat/thread/create", {
            sender_id: senderId,
            receiver_id: receiverId,
        });
    },

    // Get all users
    getUsers: (userId, search = "") => {
        return API.get(`/chat/users?user_id=${userId}&search=${search}`);
    },

    // Mark thread as read
    markAsRead: (threadId, userId) => {
        return API.post(`/chat/read/${threadId}?user_id=${userId}`);
    },
};

export default ChatService;