import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import echo from "../../config/echo";

export default function ConversationList({ onSelect, searchQuery = "", onMarkRead, isOnline }) {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading]             = useState(true);
    const [activeTab, setActiveTab]         = useState("All");
    const [hoveredThreadId, setHoveredThreadId] = useState(null);
    const tabs = ["All", "Unread", "Groups"];

    // ── Load conversations ────────────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            setLoading(true);
            const res = await ChatService.getConversations(user.id);
            if (res.data.success) {
                const uniqueConversations = Array.from(
                    new Map((res.data.data || []).map(conv => [String(conv.thread_id), conv])).values()
                );
                setConversations(uniqueConversations);
            }
        } catch (err) {
            console.error("Error loading conversations:", err);
        } finally {
            setLoading(false);
        }
    }, [user.id]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // ── WebSocket: live badge updates for new incoming messages ───────────────
    useEffect(() => {
        if (!user) return;

        const channel = echo.channel(`conv.${user.id}`);

        channel.listen(".message.sent", (data) => {
            setConversations(prev => prev.map(c => {
                if (String(c.thread_id) === String(data.thread_id)) {
                    return {
                        ...c,
                        last_message:      data.message,
                        last_message_time: data.created_at,
                        // Only increment unread if message is from someone else
                        unread_count: String(data.sender_id) !== String(user.id)
                            ? (parseInt(c.unread_count) || 0) + 1
                            : c.unread_count,
                    };
                }
                return c;
            }));
        });

        return () => {
            echo.leaveChannel(`conv.${user.id}`);
        };
    }, [user]);

    // ── Click: select conversation + mark as read ─────────────────────────────
    const handleSelect = async (conv) => {
        const previousUnread = parseInt(conv.unread_count) || 0;

        // Optimistic: clear badge immediately in UI
        if (previousUnread > 0) {
            setConversations(prev => prev.map(c =>
                c.thread_id === conv.thread_id ? { ...c, unread_count: 0 } : c
            ));
        }

        // Tell parent (ChatWidget) to subtract from total
        if (onMarkRead && previousUnread > 0) {
            onMarkRead(previousUnread);
        }

        // API: mark as read in DB
        try {
            await ChatService.markAsRead(conv.thread_id, user.id);
        } catch (err) {
            console.error("Error marking as read:", err);
        }

        onSelect(conv);
    };

    const handleDeleteConversation = async (threadId) => {
        if (!window.confirm("Delete this conversation?")) return;

        try {
            await ChatService.deleteConversation(threadId, user.id);
            setConversations(prev =>
                prev.filter(c => String(c.thread_id) !== String(threadId))
            );
        } catch (err) {
            console.error("Error deleting conversation:", err);
        }
    };

    // ── Filter by tab + search ────────────────────────────────────────────────
    const totalUnreadConvs = conversations.filter(c => c.unread_count > 0).length;

    const isGroupConversation = (conversation) =>
        conversation.source_type === "group" || Boolean(Number(conversation.is_group));

    const filtered = conversations.filter(c => {
        if (activeTab === "Unread" && !(c.unread_count > 0)) return false;
        if (activeTab === "Groups" && !isGroupConversation(c)) return false;
        if (searchQuery.trim()) {
            const q        = searchQuery.toLowerCase();
            const fullName = `${c.name ?? ""} ${c.surname ?? ""}`.toLowerCase();
            const title    = (c.title ?? "").toLowerCase();
            const lastMsg  = (c.last_message ?? "").toLowerCase();
            if (!fullName.includes(q) && !title.includes(q) && !lastMsg.includes(q)) return false;
        }
        return true;
    });

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading conversations...</p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", padding: "0 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                {tabs.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 500,
                        background: "none", border: "none", cursor: "pointer",
                        color: activeTab === tab ? "#2563eb" : "#9ca3af",
                        borderBottom: activeTab === tab ? "2px solid #2563eb" : "2px solid transparent",
                        transition: "all 0.2s"
                    }}>
                        {tab}
                        {tab === "Unread" && totalUnreadConvs > 0 && (
                            <span style={{
                                marginLeft: 5, minWidth: 16, height: 16, padding: "0 4px",
                                background: activeTab === "Unread" ? "#2563eb" : "#e5e7eb",
                                color: activeTab === "Unread" ? "white" : "#6b7280",
                                fontSize: 10, fontWeight: 700, borderRadius: 8,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                verticalAlign: "middle"
                            }}>
                                {totalUnreadConvs}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Conversation rows ── */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>
                            {searchQuery ? "🔍" : "💬"}
                        </div>
                        <p style={{ color: "#9ca3af", fontSize: 14, fontWeight: 500 }}>
                            {searchQuery
                                ? `No results for "${searchQuery}"`
                                : activeTab === "Unread"
                                ? "No unread messages 🎉"
                                : "No conversations yet"}
                        </p>
                        <p style={{ color: "#d1d5db", fontSize: 12, marginTop: 4 }}>
                            {!searchQuery && "Tap ✏️ to start a new chat!"}
                        </p>
                    </div>
                ) : (
                    filtered.map(conv => {
                        const unread    = parseInt(conv.unread_count) || 0;
                        const hasUnread = unread > 0;

                        return (
                            <button key={conv.thread_id} onClick={() => handleSelect(conv)}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                                    padding: "12px 16px", background: hasUnread ? "#f0f4ff" : "none",
                                    border: "none", borderBottom: "1px solid #f9fafb",
                                    cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                                    position: "relative"
                                }}
                                onMouseEnter={e => {
                                    setHoveredThreadId(conv.thread_id);
                                    e.currentTarget.style.background = hasUnread ? "#e8efff" : "#f9fafb";
                                }}
                                onMouseLeave={e => {
                                    setHoveredThreadId(null);
                                    e.currentTarget.style.background = hasUnread ? "#f0f4ff" : "none";
                                }}
                            >
                                {/* Avatar */}
                                <div style={{ position: "relative", flexShrink: 0 }}>
                                    {isGroupConversation(conv) ? (
                                        <div style={{
                                            width: 46, height: 46, borderRadius: "50%",
                                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                            display: "flex",
                                            alignItems: "center", justifyContent: "center",
                                            color: "white", fontSize: 16, fontWeight: 700
                                        }}>
                                            {conv.title?.charAt(0).toUpperCase() ?? "G"}
                                        </div>
                                    ) : (
                                        <>
                                            {conv.photo ? (
                                                <img
                                                    src={`http://localhost/mokapen/public/uploads/users/${conv.photo}`}
                                                    alt={conv.name}
                                                    style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }}
                                                    onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                                />
                                            ) : null}
                                            <div style={{
                                                width: 46, height: 46, borderRadius: "50%",
                                                background: "#6366f1",
                                                display: conv.photo ? "none" : "flex",
                                                alignItems: "center", justifyContent: "center",
                                                color: "white", fontSize: 16, fontWeight: 600
                                            }}>
                                                {conv.name ? conv.name.charAt(0).toUpperCase() : "?"}
                                            </div>
                                        </>
                                    )}
                                    {isOnline(conv.user_id) && (
                                        <span style={{
                                            position: "absolute", bottom: 1, right: 1,
                                            width: 11, height: 11, background: "#22c55e",
                                            border: "2px solid white", borderRadius: "50%"
                                        }} />
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                        <span style={{ fontSize: 14, fontWeight: hasUnread ? 700 : 500, color: "#111827" }}>
                                            {isGroupConversation(conv) ? conv.title : `${conv.name} ${conv.surname ?? ""}`}
                                        </span>
                                        <span style={{
                                            fontSize: 11, flexShrink: 0, marginLeft: 8,
                                            color: hasUnread ? "#2563eb" : "#9ca3af",
                                            fontWeight: hasUnread ? 600 : 400
                                        }}>
                                            {conv.last_message && conv.last_message_time
                                                ? new Date(conv.last_message_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                                : ""}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <p style={{
                                            fontSize: 12, margin: 0,
                                            color: hasUnread ? "#374151" : "#9ca3af",
                                            fontWeight: hasUnread ? 500 : 400,
                                            overflow: "hidden", textOverflow: "ellipsis",
                                            whiteSpace: "nowrap", maxWidth: "80%"
                                        }}>
                                            {conv.last_message
                                                ? conv.last_message.length > 35
                                                    ? conv.last_message.substring(0, 35) + "..."
                                                    : conv.last_message
                                                : "Start a conversation..."}
                                        </p>

                                        {/* ── Per-conversation unread badge ── */}
                                        {hasUnread && (
                                            <span style={{
                                                flexShrink: 0, minWidth: 20, height: 20, padding: "0 5px",
                                                background: "#2563eb", color: "white",
                                                fontSize: 11, fontWeight: 700, borderRadius: 10,
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                animation: "badgePop 0.3s ease"
                                            }}>
                                                {unread > 99 ? "99+" : unread}
                                            </span>
                                        )}
                                    </div>
                                </div>


                                  {/* Delete conversation button */}
                                    <div
                                        className="conv-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteConversation(conv.thread_id);
                                        }}
                                        style={{
                                            position: "absolute", right: 12, top: "50%",
                                            transform: "translateY(-50%)",
                                            opacity: String(hoveredThreadId) === String(conv.thread_id) ? 1 : 0,
                                            transition: "opacity 0.2s",
                                            background: "#fef2f2", borderRadius: 8,
                                            padding: "4px 8px", cursor: "pointer",
                                            display: "flex", alignItems: "center", gap: 4
                                        }}
                                    >
                                        <svg width="13" height="13" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                        </svg>
                                        <span style={{ fontSize:11, color:"#ef4444", fontWeight:500 }}>Delete</span>
                                    </div>
                            </button>
                        );
                    })
                )}
            </div>

            <style>{`
                @keyframes badgePop {
                    0%   { transform: scale(0); opacity: 0; }
                    70%  { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
