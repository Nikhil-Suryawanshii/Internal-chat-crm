import { useState } from "react";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import NewChatView from "./NewChatView";

// view: "conversations" | "newChat" | "thread"
export default function ChatWindow({ onClose, onThreadRead }) {
    const [view, setView]                       = useState("conversations");
    const [activeConversation, setActiveConversation] = useState(null);
    const [convSearch, setConvSearch]           = useState("");

    // Called when user selects an existing conversation from the list
    const handleSelectConversation = (conv) => {
        setActiveConversation(conv);
        setView("thread");
    };

    // Called when NewChatView successfully creates/finds a thread
    const handleThreadCreated = (conversation) => {
        setActiveConversation(conversation);
        setView("thread");
    };

    // Called by ConversationList when it marks a thread read
    // unreadCleared = how many unread messages were cleared
    const handleMarkRead = (unreadCleared) => {
        if (onThreadRead && unreadCleared > 0) {
            onThreadRead(unreadCleared);
        }
    };

    const handleBack = () => {
        if (view === "thread" || view === "newChat") {
            setView("conversations");
            setActiveConversation(null);
        }
    };

    const headerTitle = () => {
        if (view === "newChat") return "New Conversation";
        if (view === "thread") return `${activeConversation?.name ?? ""} ${activeConversation?.surname ?? ""}`.trim();
        return "Messages";
    };

    const showBack = view !== "conversations";

    return (
        <div style={{
            width: 380, height: 580, borderRadius: 20,
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column",
            overflow: "hidden", background: "white",
            border: "1px solid #f0f0f0",
            animation: "slideUp 0.25s cubic-bezier(0.16,1,0.3,1)"
        }}>
            <style>{`
                @keyframes slideUp {
                    from { opacity:0; transform: translateY(20px) scale(0.96); }
                    to   { opacity:1; transform: translateY(0) scale(1); }
                }
            `}</style>

            {/* ── Header ── */}
            <div style={{
                background: "white", padding: "14px 16px",
                display: "flex", alignItems: "center",
                justifyContent: "space-between", flexShrink: 0,
                borderBottom: "1px solid #f3f4f6"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {showBack && (
                        <button onClick={handleBack}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0, display: "flex" }}
                            title="Back">
                            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}

                    <p style={{ fontSize: 17, fontWeight: 700, color: "#111827", margin: 0 }}>
                        {headerTitle()}
                    </p>

                    {view === "thread" && activeConversation && (
                        <span style={{ fontSize: 12, color: activeConversation.user_status === "1" ? "#22c55e" : "#9ca3af" }}>
                            {activeConversation.user_status === "1" ? "🟢 Online" : "⚫ Offline"}
                        </span>
                    )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {view === "conversations" && (
                        <button onClick={() => setView("newChat")} title="Start new conversation"
                            style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#eff6ff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
                            onMouseLeave={e => e.currentTarget.style.background = "#eff6ff"}>
                            <svg width="17" height="17" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    )}

                    <button onClick={onClose} title="Close"
                        style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#e5e7eb"}
                        onMouseLeave={e => e.currentTarget.style.background = "#f3f4f6"}>
                        <svg width="16" height="16" fill="none" stroke="#6b7280" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ── Search bar (conversations view only) ── */}
            {view === "conversations" && (
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f9fafb", borderRadius: 12, padding: "8px 12px" }}>
                        <svg width="15" height="15" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input type="text" value={convSearch} onChange={e => setConvSearch(e.target.value)}
                            placeholder="Search conversations..."
                            style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#6b7280", flex: 1 }}
                        />
                        {convSearch && (
                            <button onClick={() => setConvSearch("")}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}>
                                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Body ── */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                {view === "conversations" && (
                    <ConversationList
                        onSelect={handleSelectConversation}
                        searchQuery={convSearch}
                        onMarkRead={handleMarkRead}
                    />
                )}
                {view === "newChat" && (
                    <NewChatView
                        onThreadCreated={handleThreadCreated}
                        onCancel={() => setView("conversations")}
                    />
                )}
                {view === "thread" && activeConversation && (
                    <MessageThread
                        conversation={activeConversation}
                        onMarkRead={handleMarkRead}
                    />
                )}
            </div>
        </div>
    );
}
