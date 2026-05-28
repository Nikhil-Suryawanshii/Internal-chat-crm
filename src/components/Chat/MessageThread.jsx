import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import echo from "../../config/echo";

export default function MessageThread({ conversation, onMarkRead, onConversationUpdate }) {
    const { user }                      = useAuth();
    const [messages, setMessages]       = useState([]);
    const [input, setInput]             = useState("");
    const [loading, setLoading]         = useState(true);
    const [sending, setSending]         = useState(false);
    const [groupMembers, setGroupMembers] = useState([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [groupPanelOpen, setGroupPanelOpen] = useState(false);
    const [editingGroupName, setEditingGroupName] = useState(false);
    const [groupNameDraft, setGroupNameDraft] = useState(conversation.title ?? "");
    const [groupActionLoading, setGroupActionLoading] = useState(false);
    const [groupError, setGroupError] = useState(null);
    const bottomRef                     = useRef(null);
    const isGroup = conversation.source_type === "group" || Boolean(Number(conversation.is_group));
    const currentMember = groupMembers.find(member => String(member.user_id) === String(user.id));
    const isGroupAdmin = Boolean(Number(currentMember?.is_admin));

    // ── Load messages ─────────────────────────────────────────────────────────
    useEffect(() => {
        loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    useEffect(() => {
        setGroupNameDraft(conversation.title ?? "");
    }, [conversation.title]);

    useEffect(() => {
        if (!isGroup) return;
        loadGroupMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id, isGroup]);

    // ── Auto-scroll to bottom ─────────────────────────────────────────────────
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Mark as read when thread opens ────────────────────────────────────────
    useEffect(() => {
        const previousUnread = parseInt(conversation.unread_count) || 0;
        if (previousUnread > 0) {
            // Tell ChatWidget to subtract from total badge
            if (onMarkRead) onMarkRead(previousUnread);
            // API call
            ChatService.markAsRead(conversation.thread_id, user.id).catch(err =>
                console.error("markAsRead error:", err)
            );
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    // ── WebSocket: receive real-time messages ─────────────────────────────────
    useEffect(() => {
        const channel = echo.channel(`chat.${conversation.thread_id}`);

        channel.listen(".message.sent", (data) => {
            if (String(data.sender_id) !== String(user.id)) {
                setMessages(p => [...p, {
                    message_id: data.message_id,
                    sender_id:  data.sender_id,
                    message:    data.message,
                    created_at: data.created_at,
                    name:       data.sender_name,
                }]);
                // Auto mark as read since we're looking at this thread
                ChatService.markAsRead(conversation.thread_id, user.id).catch(() => {});
            }
        });

        // Listen for message deletion
        channel.listen(".message.deleted", (data) => {
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(data.message_id)
                    ? { ...msg, deleted_at: new Date().toISOString() }
                    : msg
            ));
        });

        return () => {
            echo.leaveChannel(`chat.${conversation.thread_id}`);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    const loadMessages = async () => {
        try {
            setLoading(true);
            const res = await ChatService.getMessages(conversation.thread_id, user.id);
            if (res.data.success) {
                setMessages(res.data.data);
            }
        } catch (err) {
            console.error("Error loading messages:", err);
        } finally {
            setLoading(false);
        }
    };

    const loadGroupMembers = async () => {
        try {
            setMembersLoading(true);
            setGroupError(null);
            const res = await ChatService.getGroupMembers(conversation.thread_id);
            if (res.data.success) {
                setGroupMembers(res.data.data || []);
            }
        } catch (err) {
            console.error("Error loading group members:", err);
            setGroupError("Failed to load group members");
        } finally {
            setMembersLoading(false);
        }
    };

    const updateGroupName = async () => {
        const nextName = groupNameDraft.trim();
        if (!nextName || groupActionLoading) return;

        try {
            setGroupActionLoading(true);
            setGroupError(null);
            const res = await ChatService.updateGroup(conversation.thread_id, user.id, nextName);
            if (res.data.success) {
                setEditingGroupName(false);
                onConversationUpdate?.({ title: nextName });
            } else {
                setGroupError(res.data.message || "Failed to update group");
            }
        } catch (err) {
            console.error("Error updating group:", err);
            setGroupError(err.response?.data?.message || "Failed to update group");
        } finally {
            setGroupActionLoading(false);
        }
    };

    const removeMember = async (member) => {
        if (groupActionLoading || String(member.user_id) === String(user.id)) return;

        try {
            setGroupActionLoading(true);
            setGroupError(null);
            const res = await ChatService.removeGroupMember(conversation.thread_id, user.id, member.user_id);
            if (res.data.success) {
                setGroupMembers(prev => prev.filter(item => String(item.user_id) !== String(member.user_id)));
            } else {
                setGroupError(res.data.message || "Failed to remove member");
            }
        } catch (err) {
            console.error("Error removing group member:", err);
            setGroupError(err.response?.data?.message || "Failed to remove member");
        } finally {
            setGroupActionLoading(false);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm("Delete this message?")) return;

        try {
            await ChatService.deleteMessage(messageId, user.id);
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(messageId)
                    ? { ...msg, deleted_at: new Date().toISOString() }
                    : msg
            ));
        } catch (err) {
            console.error("Error deleting message:", err);
        }
    };

    const send = async () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput("");
        setSending(true);

        // Optimistic UI
        const tempMsg = {
            message_id: Date.now(),
            sender_id:  user.id,
            message:    text,
            created_at: new Date().toISOString(),
            name:       user.name,
        };
        setMessages(p => [...p, tempMsg]);

        try {
            const res = await ChatService.sendMessage(conversation.thread_id, text, user.id);
            if (res.data.success && res.data.data) {
                setMessages(prev => prev.map(msg =>
                    msg.message_id === tempMsg.message_id ? res.data.data : msg
                ));
            }
        } catch (err) {
            console.error("Error sending message:", err);
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading messages...</p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            {isGroup && (
                <div style={{ borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                    <button
                        onClick={() => setGroupPanelOpen(open => !open)}
                        style={{
                            width: "100%",
                            padding: "10px 16px",
                            border: "none",
                            background: "#fafafa",
                            color: "#374151",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: 13,
                            fontWeight: 600,
                        }}
                    >
                        <span>{groupMembers.length || ""} members</span>
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>
                            {groupPanelOpen ? "Hide" : "Manage"}
                        </span>
                    </button>

                    {groupPanelOpen && (
                        <div style={{ padding: "12px 16px", background: "white" }}>
                            {isGroupAdmin && (
                                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                    <input
                                        type="text"
                                        value={groupNameDraft}
                                        disabled={!editingGroupName || groupActionLoading}
                                        onChange={e => setGroupNameDraft(e.target.value)}
                                        style={{
                                            flex: 1,
                                            border: "1px solid #e5e7eb",
                                            borderRadius: 8,
                                            padding: "8px 10px",
                                            fontSize: 13,
                                            outline: "none",
                                            color: "#111827",
                                            background: editingGroupName ? "white" : "#f9fafb",
                                        }}
                                    />
                                    {editingGroupName ? (
                                        <button
                                            onClick={updateGroupName}
                                            disabled={groupActionLoading || !groupNameDraft.trim()}
                                            style={{
                                                border: "none",
                                                borderRadius: 8,
                                                padding: "0 12px",
                                                background: "#2563eb",
                                                color: "white",
                                                cursor: groupActionLoading ? "not-allowed" : "pointer",
                                                fontSize: 12,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Save
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setEditingGroupName(true)}
                                            style={{
                                                border: "none",
                                                borderRadius: 8,
                                                padding: "0 12px",
                                                background: "#eff6ff",
                                                color: "#2563eb",
                                                cursor: "pointer",
                                                fontSize: 12,
                                                fontWeight: 600,
                                            }}
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>
                            )}

                            {groupError && (
                                <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{groupError}</p>
                            )}

                            <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                                {membersLoading ? (
                                    <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>Loading members...</p>
                                ) : groupMembers.map(member => {
                                    const memberName = `${member.name ?? ""} ${member.surname ?? ""}`.trim() || member.email;
                                    const memberIsAdmin = Boolean(Number(member.is_admin));
                                    const canRemove = isGroupAdmin && !memberIsAdmin && String(member.user_id) !== String(user.id);

                                    return (
                                        <div key={member.user_id ?? member.participant_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <div style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: "50%",
                                                background: memberIsAdmin ? "#2563eb" : "#6366f1",
                                                color: "white",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: 12,
                                                fontWeight: 700,
                                                flexShrink: 0,
                                            }}>
                                                {memberName.charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {memberName}
                                                </p>
                                                <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
                                                    {memberIsAdmin ? "Admin" : member.email}
                                                </p>
                                            </div>
                                            {canRemove && (
                                                <button
                                                    onClick={() => removeMember(member)}
                                                    disabled={groupActionLoading}
                                                    title={`Remove ${memberName}`}
                                                    style={{
                                                        border: "none",
                                                        background: "#fef2f2",
                                                        color: "#dc2626",
                                                        borderRadius: 8,
                                                        padding: "6px 8px",
                                                        cursor: groupActionLoading ? "not-allowed" : "pointer",
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Messages ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: "center", margin: "auto" }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
                        <p style={{ color: "#9ca3af", fontSize: 14 }}>No messages yet</p>
                        <p style={{ color: "#d1d5db", fontSize: 12 }}>Say hello!</p>
                    </div>
                )}

                {messages.map(msg => {
                    const isMe = String(msg.sender_id) === String(user.id);
                    return (
                        <div key={msg.message_id}
                            style={{ display:"flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems:"flex-end", gap:8 }}
                            onMouseEnter={e => {
                                const btn = e.currentTarget.querySelector('.delete-btn');
                                if (btn) btn.style.opacity = "1";
                            }}
                            onMouseLeave={e => {
                                const btn = e.currentTarget.querySelector('.delete-btn');
                                if (btn) btn.style.opacity = "0";
                            }}
                        >
                            {!isMe && (
                                <div style={{ width:28, height:28, borderRadius:"50%", background:"#6366f1", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:11, fontWeight:600, flexShrink:0 }}>
                                    {conversation.name ? conversation.name.charAt(0).toUpperCase() : "?"}
                                </div>
                            )}

                            <div style={{ display:"flex", flexDirection:"column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth:"72%" }}>

                                {/* Delete button - only for my messages */}
                                {isMe && !msg.deleted_at && (
                                    <button
                                        className="delete-btn"
                                        onClick={() => handleDeleteMessage(msg.message_id)}
                                        style={{
                                            opacity: 0,
                                            background: "none", border: "none",
                                            cursor: "pointer", color: "#ef4444",
                                            fontSize: 11, padding: "0 4px 2px",
                                            transition: "opacity 0.2s",
                                            alignSelf: "flex-end"
                                        }}
                                    >
                                        Delete
                                    </button>
                                )}

                                {/* Message bubble */}
                                <div style={{
                                    padding: "10px 14px",
                                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                    background: msg.deleted_at
                                        ? "#f3f4f6"
                                        : isMe
                                            ? "linear-gradient(135deg,#0066FF,#0044CC)"
                                            : "#f3f4f6",
                                    color: msg.deleted_at ? "#9ca3af" : isMe ? "white" : "#1f2937",
                                    fontSize: 14, lineHeight: 1.5,
                                    fontStyle: msg.deleted_at ? "italic" : "normal"
                                }}>
                                    {msg.deleted_at ? "This message was deleted" : msg.message}
                                </div>

                                <span style={{ fontSize:11, color:"#9ca3af", marginTop:4, padding:"0 4px" }}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                                </span>
                            </div>
                        </div>
                    );
                })}

                <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div style={{ padding: 12, borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#f9fafb", borderRadius: 20, padding: "8px 12px" }}>
                    <textarea
                        rows={1}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                send();
                            }
                        }}
                        placeholder="Type a message..."
                        style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 14, color: "#374151", lineHeight: 1.5, maxHeight: 80, padding: "2px 0" }}
                    />
                    <button
                        onClick={send}
                        disabled={!input.trim() || sending}
                        style={{
                            width: 32, height: 32, borderRadius: "50%", border: "none",
                            cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                            background: input.trim() && !sending ? "linear-gradient(135deg,#0066FF,#0044CC)" : "#e5e7eb",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, transition: "all 0.2s"
                        }}
                    >
                        {sending ? (
                            <div style={{ width: 14, height: 14, border: "2px solid #9ca3af", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        ) : (
                            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
                <p style={{ textAlign: "center", fontSize: 11, color: "#d1d5db", marginTop: 6 }}>
                    Enter to send · Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}
