import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import ChatService from "../../services/chatService";
import { getEcho } from "../../config/echo";

export default function ConversationList({ onSelect, searchQuery = "", onMarkRead, activeThreadId = null, isOnline }) {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("All");
    const tabs = ["All", "Unread", "Groups"];

    const checkIfGroup = (conv) => {
        const sourceType = String(conv.source_type || conv.type || conv.thread_type || "").toLowerCase();
        const membersCount = Array.isArray(conv.members) ? conv.members.length : 0;
        return (
            sourceType === "group" ||
            sourceType === "groupchat" ||
            sourceType === "group_chat" ||
            conv?.is_group === true ||
            conv?.is_group === 1 ||
            conv?.is_group === "1" ||
            conv?.is_group === "true" ||
            Boolean(conv?.group_name || conv?.title || conv?.name || conv?.group_id) ||
            membersCount > 1
        );
    };

    const activeThreadRef = useRef(activeThreadId);
    const seenMessageIds = useRef(new Set());
    useEffect(() => {
        activeThreadRef.current = activeThreadId;
    }, [activeThreadId]);

    const loadConversations = useCallback(async () => {
        try {
            setLoading(true);
            const res = await ChatService.getConversations(user.id, user.org_id);
            if (res.data.success) setConversations(res.data.data);
        } catch (err) {
            console.error("Error loading conversations:", err);
        } finally {
            setLoading(false);
        }
    }, [user.id, user.org_id]);

    useEffect(() => { loadConversations(); }, [loadConversations]);

    useEffect(() => {
        if (!user) return;
        const echo = getEcho();
        const channel = echo.channel(`conv.${user.id}`);

        const handler = (data) => {
            // Filter by organization: ignore messages belonging to a different org
            if (data.org_id && String(data.org_id) !== String(user.org_id)) return;

            // Deduplicate: ignore events we've already processed
            if (data.message_id && seenMessageIds.current.has(String(data.message_id))) return;
            if (data.message_id) seenMessageIds.current.add(String(data.message_id));

            setConversations(prev => {
                let found = false;
                let updated = prev.map(c => {
                    if (String(c.thread_id) === String(data.thread_id)) {
                        found = true;
                        return {
                            ...c,
                            last_message: data.message,
                            last_message_time: data.created_at,
                            unread_count: String(data.sender_id) !== String(user.id)
                                ? (String(c.thread_id) === String(activeThreadRef.current) ? 0 : (parseInt(c.unread_count) || 0) + 1)
                                : c.unread_count,
                        };
                    }
                    return c;
                });

                if (!found && String(data.sender_id) !== String(user.id)) {
                    updated.unshift({
                        thread_id: data.thread_id,
                        type: data.message_type === 'system' ? 'group' : 'direct',
                        other_user_id: data.sender_id,
                        other_user_name: data.sender_name ? data.sender_name.split(' ')[0] : "User",
                        other_user_surname: data.sender_name ? data.sender_name.split(' ').slice(1).join(' ') : "",
                        other_user_photo_url: data.sender_avatar,
                        last_message: data.message,
                        last_message_time: data.created_at,
                        unread_count: String(data.thread_id) === String(activeThreadRef.current) ? 0 : 1,
                    });
                }

                updated.sort((a, b) => {
                    const timeA = new Date(a.last_message_time || a.created_at).getTime();
                    const timeB = new Date(b.last_message_time || b.created_at).getTime();
                    return timeB - timeA;
                });

                return updated;
            });
        };

        channel.listen(".message.sent", handler);

        // stopListening removes ONLY this handler — does not destroy the shared channel
        // (so ChatWidget's listener on the same channel stays intact)
        return () => { channel.stopListening(".message.sent", handler); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleSelect = async (conv) => {
        const previousUnread = parseInt(conv.unread_count) || 0;
        if (previousUnread > 0) {
            setConversations(prev => prev.map(c =>
                c.thread_id === conv.thread_id ? { ...c, unread_count: 0 } : c
            ));
        }
        if (onMarkRead && previousUnread > 0) onMarkRead(previousUnread);
        try {
            await ChatService.markAsRead(conv.thread_id, user?.id, user?.org_id);
        } catch (err) {
            console.error("Error marking as read:", err);
        }
        onSelect(conv);
    };

    const totalUnreadConvs = conversations.filter(c => c.unread_count > 0).length;

    const filtered = conversations.filter(c => {
        if (activeTab === "Unread" && !(c.unread_count > 0)) return false;
        if (activeTab === "Groups" && !checkIfGroup(c)) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const fullName = `${c.other_user_name ?? ""} ${c.other_user_surname ?? ""}`.toLowerCase();
            const lastMsg = (c.last_message ?? "").toLowerCase();
            if (!fullName.includes(q) && !lastMsg.includes(q)) return false;
        }
        return true;
    });

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    const BRAND_PRIMARY = "#006ede";
    const BRAND_CYAN = "#01ddff";
    const BRAND_SELECTED = "#e4f7ff";
    const BRAND_BADGE = "linear-gradient(0deg, #01ddff, #006ede)";

    if (loading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10 }}>
                <div style={{ width: 28, height: 28, border: "3px solid #e9edef", borderTop: `3px solid ${BRAND_PRIMARY}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: "#8696a0", fontSize: 13, margin: 0 }}>{t("loading_chats")}</p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes badgePop { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
                .chat_conv-item { transition: background 0.1s; }
                .chat_conv-item:hover { background: #f5f6f6 !important; }
            `}</style>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #e9edef", flexShrink: 0, background: "#fff" }}>
                {tabs.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                        flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600,
                        background: "none", border: "none", cursor: "pointer",
                        color: activeTab === tab ? BRAND_PRIMARY : "#8696a0",
                        borderBottom: activeTab === tab ? `2px solid ${BRAND_CYAN}` : "2px solid transparent",
                        transition: "all 0.18s"
                    }}>
                        {t(tab.toLowerCase())}
                        {tab === "Unread" && totalUnreadConvs > 0 && (
                            <span style={{
                                marginLeft: 5, minWidth: 17, height: 17, padding: "0 4px",
                                background: activeTab === "Unread" ? BRAND_BADGE : "#e9edef",
                                color: activeTab === "Unread" ? "#fff" : "#8696a0",
                                fontSize: 10, fontWeight: 700, borderRadius: 9,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                verticalAlign: "middle"
                            }}>
                                {totalUnreadConvs}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Conversation list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "44px 20px" }}>
                        <div style={{ fontSize: 44, marginBottom: 12 }}>{searchQuery ? "🔍" : "💬"}</div>
                        <p style={{ color: "#8696a0", fontSize: 14, fontWeight: 500, margin: 0 }}>
                            {searchQuery
                                ? `${t("no_results_for")} "${searchQuery}"`
                                : activeTab === "Unread"
                                    ? t("no_unread_messages")
                                    : t("no_conversations_yet")}
                        </p>
                        {!searchQuery && (
                            <p style={{ color: "#d1d5db", fontSize: 12, marginTop: 6 }}>{t("tap_to_start_new_chat")}</p>
                        )}
                    </div>
                ) : (
                    filtered.map(conv => {
                        const unread = parseInt(conv.unread_count) || 0;
                        const hasUnread = unread > 0;
                        const isSelected = String(activeThreadId) === String(conv.thread_id);
                        const isGroup = checkIfGroup(conv);
                        const name = isGroup
                            ? (conv.title ?? conv.name ?? conv.group_name ?? conv.other_user_name ?? "")
                            : (conv.other_user_name ?? conv.name ?? "");
                        const surname = isGroup ? "" : (conv.other_user_surname ?? conv.surname ?? "");
                        const photoUrl = isGroup ? null : (conv.other_user_photo_url ?? conv.photo_url ?? null);
                        const userId = isGroup ? null : (conv.other_user_id ?? conv.user_id);
                        const color = avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];
                        const online = !isGroup && isOnline && isOnline(userId);

                        const timeStr = conv.last_message_time
                            ? (() => {
                                const d = new Date(conv.last_message_time);
                                const now = new Date();
                                if (d.toDateString() === now.toDateString()) {
                                    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                }
                                return d.toLocaleDateString([], { day: "2-digit", month: "short" });
                            })()
                            : "";

                        return (
                            <div key={conv.thread_id} className="chat_conv-item"
                                style={{ position: "relative", background: isSelected ? BRAND_SELECTED : "transparent" }}
                            >
                                <button onClick={() => handleSelect(conv)}
                                    style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                                        padding: "10px 16px",
                                        background: "none", border: "none", borderBottom: "1px solid #f0f2f5",
                                        cursor: "pointer", textAlign: "left"
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{ position: "relative", flexShrink: 0 }}>
                                        {isGroup ? null : (photoUrl ? (
                                            <img src={photoUrl} alt={name}
                                                style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "2px solid #ffffff" }}
                                                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                            />
                                        ) : null)}
                                        <div style={{
                                            width: 48, height: 48, borderRadius: "50%",
                                            background: isGroup ? "#dfe5e7" : color,
                                            border: "2px solid #ffffff",
                                            display: (isGroup || !photoUrl) ? "flex" : "none",
                                            alignItems: "center", justifyContent: "center",
                                            color: isGroup ? "#8696a0" : "white", fontSize: 18, fontWeight: 600
                                        }}>
                                            {isGroup
                                                ? <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" /><circle cx="4.5" cy="10.5" r="2.5" /><path d="M1 21v-2a3 3 0 0 1 3-3h2" /><circle cx="19.5" cy="10.5" r="2.5" /><path d="M23 21v-2a3 3 0 0 0-3-3h-2" /></svg>
                                                : (name ? name.charAt(0).toUpperCase() : "?")}
                                        </div>
                                        {online && (
                                            <span style={{ position: "absolute", right: 1, bottom: 1, width: 11, height: 11, borderRadius: "50%", background: "#25D366", border: "2px solid white" }} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                            <span style={{ fontSize: 15, fontWeight: hasUnread ? 600 : 500, color: "#111b21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {isGroup ? (name || t("group")) : `${name} ${surname}`.trim() || "Unknown"}
                                            </span>
                                            <span style={{
                                                fontSize: 11, flexShrink: 0, marginLeft: 6,
                                                color: hasUnread ? BRAND_PRIMARY : "#8696a0",
                                                fontWeight: hasUnread ? 600 : 400
                                            }}>
                                                {timeStr}
                                            </span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <p style={{
                                                fontSize: 13, margin: 0,
                                                color: hasUnread ? "#3b4a54" : "#8696a0",
                                                fontWeight: hasUnread ? 500 : 400,
                                                overflow: "hidden", textOverflow: "ellipsis",
                                                whiteSpace: "nowrap", maxWidth: "78%"
                                            }}>
                                                {(() => {
                                                    let msg = conv.last_message;
                                                    if (!msg) return t("start_a_conversation", "Start a conversation...");
                                                    if (msg.startsWith("Group created by ")) {
                                                        const creator = msg.replace("Group created by ", "");
                                                        msg = `${t("group", "Group")} ${t("created_by", "created by")} ${creator}`;
                                                    }
                                                    return msg.length > 38 ? msg.substring(0, 38) + "..." : msg;
                                                })()}
                                            </p>
                                            {hasUnread && (
                                                <span style={{
                                                    flexShrink: 0, minWidth: 20, height: 20, padding: "0 5px",
                                                    background: BRAND_BADGE, color: "white",
                                                    fontSize: 11, fontWeight: 700, borderRadius: 10,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    animation: "badgePop 0.3s ease"
                                                }}>
                                                    {unread > 99 ? "99+" : unread}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </button>

                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
