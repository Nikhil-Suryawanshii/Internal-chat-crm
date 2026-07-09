import { useState, useEffect } from "react";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import NewChatView from "./NewChatView";
import NewGroupView from "./NewGroupView";
import GroupInfoView from "./GroupInfoView";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import { getAvatarUrl } from "../../config/urls";
import { useTranslation } from "react-i18next";

// view: "conversations" | "newChat" | "thread"
export default function ChatWindow({ onClose, onThreadRead }) {
    const { user } = useAuth();
    const { t } = useTranslation();
    const { isOnline } = useOnlineStatus(user?.id);
    const [view, setView] = useState("conversations");
    const [activeConversation, setActiveConversation] = useState(null);
    const [convSearch, setConvSearch] = useState("");
    const [listVersion, setListVersion] = useState(0);
    const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false);
    const [confirmClearChat, setConfirmClearChat] = useState(false);

    // Reset confirmation if conversation changes
    useEffect(() => {
        setConfirmDeleteConversation(false);
        setConfirmClearChat(false);
    }, [activeConversation?.thread_id]);

    const handleSelectConversation = (conv) => {
        setActiveConversation(conv);
        setView("thread");
    };
    const handleThreadCreated = (conversation) => {
        setActiveConversation(conversation);
        setListVersion(prev => prev + 1);
        setView("thread");
    };
    const handleGroupCreated = (conversation) => {
        setActiveConversation(conversation);
        setListVersion(prev => prev + 1);
        setView("thread");
    };
    const handleConversationUpdate = (updates) => {
        setActiveConversation(prev => prev ? { ...prev, ...updates } : prev);
    };
    const handleGroupInfoUpdated = (updates) => {
        setActiveConversation(prev => prev ? { ...prev, ...updates } : prev);
        setListVersion(prev => prev + 1);
        setView("thread");
    };
    const handleGroupDeleted = () => {
        setActiveConversation(null);
        setListVersion(prev => prev + 1);
        setView("conversations");
    };
    const handleMarkRead = (unreadCleared) => {
        if (onThreadRead && unreadCleared > 0) onThreadRead(unreadCleared);
    };
    const isGroupConversation = (conversation) => {
        const sourceType = String(conversation?.source_type || conversation?.type || conversation?.thread_type || "").toLowerCase();
        return (
            sourceType === "group" ||
            conversation?.is_group === true ||
            conversation?.is_group === 1 ||
            conversation?.is_group === "1" ||
            Boolean(conversation?.group_name || conversation?.title)
        );
    };
    const handleBack = () => {
        if (view === "groupInfo") {
            setView("thread");
            return;
        }
        if (view !== "conversations") {
            setView("conversations");
            setActiveConversation(null);
        }
    };
    const handleDeleteActiveConversation = () => {
        if (!activeConversation?.thread_id) return;
        setConfirmDeleteConversation(true);
    };
    const executeDeleteConversation = async () => {
        setConfirmDeleteConversation(false);
        try {
            await ChatService.deleteConversation(activeConversation.thread_id, user.id);
            setActiveConversation(null);
            setView("conversations");
            setListVersion(prev => prev + 1);
        } catch (err) {
            console.error("Error deleting conversation:", err);
        }
    };
    const handleClearChat = () => {
        if (!activeConversation?.thread_id) return;
        setConfirmClearChat(true);
    };
    const executeClearChat = async () => {
        setConfirmClearChat(false);
        try {
            await ChatService.clearChat(activeConversation.thread_id, user.id);
            // Re-select to trigger a re-fetch of messages (which will now be empty)
            setActiveConversation({ ...activeConversation });
            setListVersion(prev => prev + 1);
        } catch (err) {
            console.error("Error clearing chat:", err);
        }
    };
    const headerTitle = () => {
        if (view === "newChat") return t("new_conversation");
        if (view === "newGroup") return t("new_group");
        if (view === "groupInfo") return t("group_info");
        if (view === "thread") {
            if (isGroupConversation(activeConversation)) {
                return activeConversation?.title || activeConversation?.name || activeConversation?.group_name || t("group");
            }
            return `${activeConversation?.other_user_name ?? activeConversation?.name ?? ""} ${activeConversation?.other_user_surname ?? activeConversation?.surname ?? ""}`.trim();
        }
        return t("messages");
    };

    const showBack = view !== "conversations";
    const isSplitThread = (view === "thread" || view === "groupInfo") && activeConversation;

    // ── Shared styles ──────────────────────────────────────────────────────
    const BRAND_PRIMARY = "#006ede";
    const BRAND_CYAN = "#01ddff";
    const BRAND_SELECTED = "#e4f7ff";
    const HEADER_BG = "#f0f2f5";
    const SIDEBAR_BG = "#ffffff";
    const THREAD_BG = "#efeae2";
    const navIconButtonStyle = {
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: "#54656f",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s, color 0.15s",
    };
    const setDeleteHover = (target, active) => {
        target.style.background = active ? "#fef2f2" : "transparent";
        target.style.color = active ? "#ef4444" : "#54656f";
    };

    // ── SPLIT VIEW (thread open) ───────────────────────────────────────────
    if (isSplitThread) {
        const title = headerTitle();
        const isGroup = isGroupConversation(activeConversation);
        const isOnlineNow = !isGroup && isOnline(activeConversation.other_user_id ?? activeConversation.user_id);
        // Real group/user name — used for avatar & subtitle regardless of current view
        const displayName = isGroup
            ? (activeConversation?.title || activeConversation?.name || activeConversation?.group_name || t("group"))
            : title;
        const headerPhotoUrl = isGroup ? null : (
            activeConversation.other_user_photo_url ??
            activeConversation.photo_url ??
            (activeConversation.photo ? getAvatarUrl(activeConversation.photo, activeConversation.other_user_id ?? activeConversation.user_id) : null)
        );

        return (
            <div style={{
                width: 900, height: 600,
                borderRadius: 12,
                boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
                display: "grid",
                gridTemplateColumns: "320px 1fr",
                overflow: "hidden",
                background: SIDEBAR_BG,
                animation: "slideUp 0.22s cubic-bezier(0.16,1,0.3,1)",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                fontSize: 14,
            }}>
                <style>{`
                    @keyframes slideUp { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                    @keyframes spin { to{transform:rotate(360deg)} }
                    @keyframes badgePop { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
                    @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
                    @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
                    .chat_conv-item:hover { background: #f5f6f6 !important; }
                    .chat_conv-active { background: ${BRAND_SELECTED} !important; }
                    .chat_msg-row { animation: fadeIn 0.18s ease; }
                    ::-webkit-scrollbar { width: 5px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
                `}</style>

                {/* ── LEFT: Sidebar ── */}
                <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #e9edef", background: SIDEBAR_BG }}>
                    {/* Sidebar header */}
                    <div style={{ background: HEADER_BG, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, height: 60 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "#111b21" }}>{t("messages")}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setView("newGroup")} title={t("new_group")}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e9edef"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}>
                                <svg width="18" height="18" fill="none" stroke="#54656f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                    <circle cx="12" cy="8" r="3.5" />
                                    <path d="M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" />
                                    <circle cx="4.5" cy="10.5" r="2.5" />
                                    <path d="M1 21v-2a3 3 0 0 1 3-3h2" />
                                    <circle cx="19.5" cy="10.5" r="2.5" />
                                    <path d="M23 21v-2a3 3 0 0 0-3-3h-2" />
                                </svg>
                            </button>
                            <button onClick={() => setView("newChat")} title={t("new_chat")}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e9edef"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}>
                                <svg width="18" height="18" fill="none" stroke="#54656f" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M20 8v6M17 11h6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <button onClick={onClose} title={t("close")}
                                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = "#e9edef";
                                    e.currentTarget.querySelector("svg").style.transform = "rotate(90deg)";
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = "#ffffff";
                                    e.currentTarget.querySelector("svg").style.transform = "rotate(0deg)";
                                }}>
                                <svg width="16" height="16" fill="none" stroke="#54656f" strokeWidth="2.4" viewBox="0 0 24 24"
                                    style={{ transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)", transform: "rotate(0deg)" }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {/* Search */}
                    <div style={{ padding: "8px 12px", background: SIDEBAR_BG, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: HEADER_BG, borderRadius: 8, padding: "7px 12px" }}>
                            <svg width="15" height="15" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input type="text" value={convSearch} onChange={e => setConvSearch(e.target.value)}
                                placeholder={t("search_or_start_new_chat")}
                                style={{ background: "transparent", border: "none", outline: "none", fontSize: 14, color: "#3b4a54", flex: 1 }}
                            />
                        </div>
                    </div>
                    <ConversationList
                        key={listVersion}
                        onSelect={handleSelectConversation}
                        searchQuery={convSearch}
                        onMarkRead={handleMarkRead}
                        isOnline={isOnline}
                        activeThreadId={activeConversation.thread_id}
                    />
                </div>

                {/* ── RIGHT: Thread ── */}
                <div style={{ display: "flex", flexDirection: "column", background: THREAD_BG, minHeight: 0, overflow: "hidden" }}>
                    {/* Thread header */}
                    <div style={{ height: 60, padding: "0 20px", background: HEADER_BG, borderBottom: "1px solid #e9edef", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <div style={{ position: "relative", flexShrink: 0 }}>
                            {headerPhotoUrl ? (
                                <img src={headerPhotoUrl} alt={title} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", border: "2px solid #ffffff" }} />
                            ) : (
                                <div style={{
                                    width: 42, height: 42, borderRadius: "50%",
                                    background: isGroup
                                        ? "#dfe5e7"
                                        : "#95cef0",
                                    border: "2px solid #ffffff",
                                    color: isGroup ? "#8696a0" : "#ffffff",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: 700, fontSize: 18, letterSpacing: 0
                                }}>
                                    {isGroup
                                        ? <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" /><circle cx="4.5" cy="10.5" r="2.5" /><path d="M1 21v-2a3 3 0 0 1 3-3h2" /><circle cx="19.5" cy="10.5" r="2.5" /><path d="M23 21v-2a3 3 0 0 0-3-3h-2" /></svg>
                                        : displayName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            {isOnlineNow && <span style={{ position: "absolute", right: 1, bottom: 1, width: 10, height: 10, borderRadius: "50%", background: "#25D366", border: "2px solid white" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111b21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                            <p style={{ margin: 0, fontSize: 12, color: isOnlineNow ? BRAND_PRIMARY : "#8696a0" }}>
                                {isGroupConversation(activeConversation)
                                    ? (activeConversation?.created_by_name
                                        ? `${t("created_by")} ${activeConversation.created_by_name}`
                                        : t("group"))
                                    : isOnlineNow ? t("online") : t("offline")}
                            </p>
                        </div>
                        {isGroup && (
                            <button
                                onClick={() => setView("groupInfo")}
                                title={t("group_info")}
                                style={navIconButtonStyle}
                                onMouseEnter={e => { e.currentTarget.style.background = "#e9edef"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4M12 8h.01" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={handleClearChat}
                            title={t("clear_chat", "Clear chat")}
                            style={navIconButtonStyle}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e9edef"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 3H5a2 2 0 0 0-2 2v14l4-4h7a2 2 0 0 0 2-2V8"></path>
                                <circle cx="19" cy="5" r="4"></circle>
                                <line x1="17" y1="3" x2="21" y2="7"></line>
                                <line x1="21" y1="3" x2="17" y2="7"></line>
                            </svg>
                        </button>
                        <button
                            onClick={handleDeleteActiveConversation}
                            title={t("delete_conversation")}
                            style={navIconButtonStyle}
                            onMouseEnter={e => setDeleteHover(e.currentTarget, true)}
                            onMouseLeave={e => setDeleteHover(e.currentTarget, false)}
                        >
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    {/* ── Inline Delete Confirmation Toast ── */}
                    {confirmDeleteConversation && (
                        <div style={{
                            flexShrink: 0,
                            margin: "12px 12px 4px",
                            background: "#ffffff",
                            borderRadius: 12,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                            border: "1px solid #fee2e2",
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            animation: "fadeIn 0.18s ease",
                            zIndex: 10,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: "#fef2f2",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                            }}>
                                <svg width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111b21" }}>
                                    {t("delete_conversation", "Delete conversation")}?
                                </p>
                                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8696a0" }}>
                                    {t("delete_conversation_confirm", "This cannot be undone.")}
                                </p>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button
                                    onClick={() => setConfirmDeleteConversation(false)}
                                    style={{
                                        padding: "6px 14px", borderRadius: 20,
                                        border: "1px solid #e9edef",
                                        background: "#f0f2f5", color: "#54656f",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                        transition: "background 0.15s",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#f0f2f5"}
                                >
                                    {t("cancel", "Cancel")}
                                </button>
                                <button
                                    onClick={executeDeleteConversation}
                                    style={{
                                        padding: "6px 14px", borderRadius: 20,
                                        border: "none",
                                        background: "#ef4444", color: "#ffffff",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                        transition: "background 0.15s",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}
                                >
                                    {t("delete", "Delete")}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Inline Clear Confirmation Toast ── */}
                    {confirmClearChat && (
                        <div style={{
                            flexShrink: 0,
                            margin: "12px 12px 4px",
                            background: "#ffffff",
                            borderRadius: 12,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                            border: "1px solid #fee2e2",
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            animation: "fadeIn 0.18s ease",
                            zIndex: 10,
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: "#fef2f2",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                            }}>
                                <svg width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 3H5a2 2 0 0 0-2 2v14l4-4h7a2 2 0 0 0 2-2V8"></path>
                                    <circle cx="19" cy="5" r="4"></circle>
                                    <line x1="17" y1="3" x2="21" y2="7"></line>
                                    <line x1="21" y1="3" x2="17" y2="7"></line>
                                </svg>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111b21" }}>
                                    {t("clear_chat", "Clear chat")}?
                                </p>
                                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8696a0" }}>
                                    {t("clear_chat_confirm", "All your messages will be hidden.")}
                                </p>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button
                                    onClick={() => setConfirmClearChat(false)}
                                    style={{
                                        padding: "6px 14px", borderRadius: 20,
                                        border: "1px solid #e9edef",
                                        background: "#f0f2f5", color: "#54656f",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                        transition: "background 0.15s",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#f0f2f5"}
                                >
                                    {t("cancel", "Cancel")}
                                </button>
                                <button
                                    onClick={executeClearChat}
                                    style={{
                                        padding: "6px 14px", borderRadius: 20,
                                        border: "none",
                                        background: "#ef4444", color: "#ffffff",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                        transition: "background 0.15s",
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
                                    onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}
                                >
                                    {t("clear", "Clear")}
                                </button>
                            </div>
                        </div>
                    )}
                    {view === "groupInfo" ? (
                        <GroupInfoView
                            conversation={activeConversation}
                            onCancel={() => setView("thread")}
                            onGroupUpdated={handleGroupInfoUpdated}
                            onGroupDeleted={handleGroupDeleted}
                            isOnline={isOnline}
                        />
                    ) : (
                        <MessageThread
                            key={`${activeConversation?.thread_id}-${listVersion}`}
                            conversation={activeConversation}
                            onMarkRead={handleMarkRead}
                            onConversationUpdate={handleConversationUpdate}
                            onGroupDeleted={handleGroupDeleted}
                        />
                    )}
                </div>
            </div>
        );
    }

    // ── SINGLE PANEL (conversations / newChat / newGroup / single thread) ──
    return (
        <div style={{
            width: 380, height: 600, borderRadius: 12,
            boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
            display: "flex", flexDirection: "column",
            overflow: "hidden", background: SIDEBAR_BG,
            animation: "slideUp 0.22s cubic-bezier(0.16,1,0.3,1)",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontSize: 14,
        }}>
            <style>{`
                @keyframes slideUp { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                @keyframes spin { to{transform:rotate(360deg)} }
                @keyframes badgePop { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
                .chat_conv-item:hover { background: #f5f6f6 !important; }
                .chat_conv-active { background: ${BRAND_SELECTED} !important; }
            `}</style>

            {/* Header */}
            <div style={{ background: HEADER_BG, padding: "0 16px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {showBack && (
                        <button onClick={handleBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: "#54656f" }}>
                            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <span style={{ fontSize: 17, fontWeight: 700, color: "#111b21" }}>{headerTitle()}</span>
                    {view === "thread" && activeConversation && !isGroupConversation(activeConversation) && (
                        <span style={{ fontSize: 11, color: isOnline(activeConversation.user_id) ? BRAND_PRIMARY : "#8696a0", marginLeft: 2 }}>
                            {isOnline(activeConversation.user_id) ? "● online" : "● offline"}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                    {view === "thread" && activeConversation && isGroupConversation(activeConversation) && (
                        <button
                            onClick={() => setView("groupInfo")}
                            title={t("group_info")}
                            style={{ ...navIconButtonStyle, width: 34, height: 34 }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#e9edef"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4M12 8h.01" />
                            </svg>
                        </button>
                    )}
                    {view === "thread" && activeConversation && (
                        <>
                            <button
                                onClick={handleClearChat}
                                title={t("clear_chat", "Clear chat")}
                                style={{ ...navIconButtonStyle, width: 34, height: 34 }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#e9edef"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 3H5a2 2 0 0 0-2 2v14l4-4h7a2 2 0 0 0 2-2V8"></path>
                                    <circle cx="19" cy="5" r="4"></circle>
                                    <line x1="17" y1="3" x2="21" y2="7"></line>
                                    <line x1="21" y1="3" x2="17" y2="7"></line>
                                </svg>
                            </button>
                            <button
                                onClick={handleDeleteActiveConversation}
                                title={t("delete_conversation")}
                                style={{ ...navIconButtonStyle, width: 34, height: 34 }}
                                onMouseEnter={e => setDeleteHover(e.currentTarget, true)}
                                onMouseLeave={e => setDeleteHover(e.currentTarget, false)}
                            >
                                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </>
                    )}
                    {view === "conversations" && (
                        <>
                            <button onClick={() => setView("newGroup")} title={t("new_group")}
                                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e9edef"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}>
                                <svg width="17" height="17" fill="none" stroke="#54656f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                    <circle cx="12" cy="8" r="3.5" />
                                    <path d="M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2" />
                                    <circle cx="4.5" cy="10.5" r="2.5" />
                                    <path d="M1 21v-2a3 3 0 0 1 3-3h2" />
                                    <circle cx="19.5" cy="10.5" r="2.5" />
                                    <path d="M23 21v-2a3 3 0 0 0-3-3h-2" />
                                </svg>
                            </button>
                            <button onClick={() => setView("newChat")} title={t("new_chat")}
                                style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e9edef"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}>
                                <svg width="17" height="17" fill="none" stroke="#54656f" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M20 8v6M17 11h6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </>
                    )}
                    <button onClick={onClose} title={t("close")}
                        style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = "#e9edef";
                            e.currentTarget.querySelector("svg").style.transform = "rotate(90deg)";
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = "#ffffff";
                            e.currentTarget.querySelector("svg").style.transform = "rotate(0deg)";
                        }}>
                        <svg width="15" height="15" fill="none" stroke="#54656f" strokeWidth="2.4" viewBox="0 0 24 24"
                            style={{ transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)", transform: "rotate(0deg)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Search bar */}
            {view === "conversations" && (
                <div style={{ padding: "8px 12px", background: SIDEBAR_BG, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: HEADER_BG, borderRadius: 8, padding: "7px 12px" }}>
                        <svg width="14" height="14" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" value={convSearch} onChange={e => setConvSearch(e.target.value)}
                            placeholder={t("search_or_start_new_chat")}
                            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#3b4a54", flex: 1 }}
                        />
                        {convSearch && (
                            <button onClick={() => setConvSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", display: "flex", padding: 0 }}>
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: (view === "thread" || view === "groupInfo") ? THREAD_BG : SIDEBAR_BG }}>
                
                {/* ── Inline Delete Confirmation Toast ── */}
                {confirmDeleteConversation && (
                    <div style={{
                        flexShrink: 0,
                        margin: "12px 12px 4px",
                        background: "#ffffff",
                        borderRadius: 12,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                        border: "1px solid #fee2e2",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        animation: "fadeIn 0.18s ease",
                        zIndex: 10,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: "#fef2f2",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                        }}>
                            <svg width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111b21" }}>
                                {t("delete_conversation", "Delete conversation")}?
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8696a0" }}>
                                {t("delete_conversation_confirm", "This cannot be undone.")}
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            <button
                                onClick={() => setConfirmDeleteConversation(false)}
                                style={{
                                    padding: "6px 14px", borderRadius: 20,
                                    border: "1px solid #e9edef",
                                    background: "#f0f2f5", color: "#54656f",
                                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                                onMouseLeave={e => e.currentTarget.style.background = "#f0f2f5"}
                            >
                                {t("cancel", "Cancel")}
                            </button>
                            <button
                                onClick={executeDeleteConversation}
                                style={{
                                    padding: "6px 14px", borderRadius: 20,
                                    border: "none",
                                    background: "#ef4444", color: "#ffffff",
                                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}
                            >
                                {t("delete", "Delete")}
                            </button>
                        </div>
                    </div>
                )}
                
                {/* ── Inline Clear Confirmation Toast ── */}
                {confirmClearChat && (
                    <div style={{
                        flexShrink: 0,
                        margin: "12px 12px 4px",
                        background: "#ffffff",
                        borderRadius: 12,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                        border: "1px solid #fee2e2",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        animation: "fadeIn 0.18s ease",
                        zIndex: 10,
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: "#fef2f2",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                        }}>
                            <svg width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 3H5a2 2 0 0 0-2 2v14l4-4h7a2 2 0 0 0 2-2V8"></path>
                                <circle cx="19" cy="5" r="4"></circle>
                                <line x1="17" y1="3" x2="21" y2="7"></line>
                                <line x1="21" y1="3" x2="17" y2="7"></line>
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#111b21" }}>
                                {t("clear_chat", "Clear chat")}?
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8696a0" }}>
                                {t("clear_chat_confirm", "All your messages will be hidden.")}
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            <button
                                onClick={() => setConfirmClearChat(false)}
                                style={{
                                    padding: "6px 14px", borderRadius: 20,
                                    border: "1px solid #e9edef",
                                    background: "#f0f2f5", color: "#54656f",
                                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                                onMouseLeave={e => e.currentTarget.style.background = "#f0f2f5"}
                            >
                                {t("cancel", "Cancel")}
                            </button>
                            <button
                                onClick={executeClearChat}
                                style={{
                                    padding: "6px 14px", borderRadius: 20,
                                    border: "none",
                                    background: "#ef4444", color: "#ffffff",
                                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
                                onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}
                            >
                                {t("clear", "Clear")}
                            </button>
                        </div>
                    </div>
                )}
                {view === "conversations" && (
                    <ConversationList
                        key={listVersion}
                        onSelect={handleSelectConversation}
                        searchQuery={convSearch}
                        onMarkRead={handleMarkRead}
                        isOnline={isOnline}
                    />
                )}
                {view === "newChat" && (
                    <NewChatView onThreadCreated={handleThreadCreated} onCancel={() => setView("conversations")} isOnline={isOnline} />
                )}
                {view === "newGroup" && (
                    <NewGroupView onGroupCreated={handleGroupCreated} onCancel={() => setView("conversations")} isOnline={isOnline} />
                )}
                {view === "groupInfo" && activeConversation && (
                    <GroupInfoView
                        conversation={activeConversation}
                        onCancel={() => setView("thread")}
                        onGroupUpdated={handleGroupInfoUpdated}
                        onGroupDeleted={handleGroupDeleted}
                        isOnline={isOnline}
                    />
                )}
                {view === "thread" && activeConversation && (
                    <MessageThread
                        key={`${activeConversation?.thread_id}-${listVersion}`}
                        conversation={activeConversation}
                        onMarkRead={handleMarkRead}
                        onConversationUpdate={handleConversationUpdate}
                        onGroupDeleted={handleGroupDeleted}
                    />
                )}
            </div>
        </div>
    );
}
