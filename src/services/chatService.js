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

    createGroup: (creatorId, groupName, memberIds) => {
    return API.post("/chat/group/create", {
        creator_id:  creatorId,
        group_name:  groupName,
        member_ids:  memberIds,
    });
    },

    getGroupMembers: (threadId) => {
        return API.get(`/chat/group/members/${threadId}`);
    },

    addGroupMember: (threadId, adminId, memberId) => {
        return API.post("/chat/group/add-member", {
            thread_id: threadId,
            admin_id:  adminId,
            member_id: memberId,
        });
    },

    removeGroupMember: (threadId, adminId, memberId) => {
        return API.post("/chat/group/remove-member", {
            thread_id: threadId,
            admin_id:  adminId,
            member_id: memberId,
        });
    },

    updateGroup: (threadId, adminId, groupName) => {
        return API.post("/chat/group/update", {
            thread_id:  threadId,
            admin_id:   adminId,
            group_name: groupName,
        });
    },

    // Delete single message
    deleteMessage: (messageId, userId) => {
        return API.post(`/chat/message/delete/${messageId}`, {
            user_id: userId
        });
    },

    // Delete conversation
    deleteConversation: (threadId, userId) => {
        return API.post(`/chat/conversation/delete/${threadId}`, {
            user_id: userId
        });
    },
};


export default ChatService;
