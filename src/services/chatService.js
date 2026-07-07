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

    // ─── API 10: Get Teams ────────────────────────────────────
    getTeams: (orgId) => {
        return API.get(`/v1/${orgId}/get_team_list`);
    },

    // ─── API 11: Get Team Members ─────────────────────────────
    getTeamMembers: (teamId) => {
        return API.get(`/v1/${teamId}/get_team_member`);
    },

    // ─── API 6: Create group ───────────────────────────────────
    createGroup: (senderId, groupName, memberIds, orgId) => {
        const normalizedMembers = Array.from(
            new Set((memberIds || [])
                .map(id => Number(id))
                .filter(id => !Number.isNaN(id) && id > 0))
        );

        return API.post("/chat/group/create", {
            sender_id: Number(senderId),
            user_id: Number(senderId),
            creator_id: Number(senderId),
            group_name: groupName,
            name: groupName,
            title: groupName,
            member_ids: normalizedMembers,
            members: normalizedMembers,
            user_ids: normalizedMembers,
            receiver_ids: normalizedMembers,
            participants: normalizedMembers,
            org_id: Number(orgId),
            organization_id: Number(orgId),
        });
    },

    // ─── API 6b: Get group members ─────────────────────────────
    getGroupMembers: (threadId) => {
        return API.get(`/chat/group/members/${threadId}`);
    },

    // ─── API 6c: Add group member (admin only) ────────────────
    addGroupMember: (threadId, adminId, memberIds, teamIds = []) => {
        return API.post("/chat/group/add-member", {
            thread_id:  threadId,
            admin_id:   adminId,
            member_ids: memberIds,
            team_ids:   teamIds
        });
    },

    // ─── API 6d: Remove group member (admin only) ─────────────
    removeGroupMember: (threadId, adminId, participantId, participantType = "user") => {
        return API.post("/chat/group/remove-member", {
            thread_id:        threadId,
            admin_id:         adminId,
            participant_id:   participantId,
            participant_type: participantType
        });
    },

    // ─── API 6e: Update group name (admin only) ────────────────
    updateGroup: (threadId, adminId, groupName) => {
        return API.post("/chat/group/update", {
            thread_id:  threadId,
            admin_id:   adminId,
            group_name: groupName,
        });
    },

    // ─── API 6f: Delete group (admin only) ─────────────────────
    deleteGroup: (threadId, adminId) => {
        return API.post(`/chat/group/delete/${threadId}`, {
            admin_id: adminId,
        });
    },

    // ─── API 7: Mark thread as read ───────────────────────────
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

    // ─── API 11: Clear conversation ───────────────────────────
    clearChat: (threadId, userId) => {
        return API.post(`/chat/conversation/clear/${threadId}`, {
            user_id: userId,
        });
    },
};

export default ChatService;
