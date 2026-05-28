import echo from "../../config/echo";
import { useState, useEffect, useCallback } from "react";
import ChatWindow from "./ChatWindow";
import mkChatIcon from "../../assets/mk-chats.png";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";

export default function ChatWidget() {
    const { user } = useAuth();
    const [isOpen, setIsOpen]           = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);
    const [pulse, setPulse]             = useState(false);

    // ── 1. Load real unread count from API on mount ──────────────────────────
    const fetchUnreadCount = useCallback(async () => {
        if (!user) return;
        try {
            const res = await ChatService.getConversations(user.id);
            if (res.data.success) {
                const total = (res.data.data || []).reduce(
                    (sum, c) => sum + (parseInt(c.unread_count) || 0), 0
                );
                setTotalUnread(total);
            }
        } catch (err) {
            console.error("Error fetching unread count:", err);
        }
    }, [user]);

    useEffect(() => {
        fetchUnreadCount();
    }, [fetchUnreadCount]);

    // ── 2. WebSocket: listen for new incoming messages globally ───────────────
    useEffect(() => {
        if (!user) return;

        const channel = echo.channel(`user.${user.id}`);

        channel.listen(".message.sent", (data) => {
            // Only increment if widget is closed OR this isn't the active thread
            // (MessageThread handles its own mark-as-read when open)
            if (!isOpen) {
                setTotalUnread(prev => prev + 1);
                // Trigger pulse animation on badge
                setPulse(true);
                setTimeout(() => setPulse(false), 600);
            }
        });

        return () => {
            echo.leaveChannel(`user.${user.id}`);
        };
    }, [user, isOpen]);

    // ── 3. When widget opens: re-fetch to get accurate count ─────────────────
    const handleOpen = () => {
        setIsOpen(true);
        fetchUnreadCount(); // refresh from server on open
    };

    // ── 4. Called by ConversationList/MessageThread when a thread is read ─────
    const handleThreadRead = useCallback((unreadWasCleared) => {
        setTotalUnread(prev => Math.max(0, prev - (unreadWasCleared || 0)));
    }, []);

    return (
        <div style={{ position: "fixed", bottom: 36, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>

            <style>{`
                @keyframes badgePulse {
                    0%   { transform: scale(1); }
                    50%  { transform: scale(1.35); }
                    100% { transform: scale(1); }
                }
                @keyframes badgePop {
                    0%   { transform: scale(0); opacity: 0; }
                    70%  { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>

            {isOpen && (
                <ChatWindow
                    onClose={() => setIsOpen(false)}
                    onThreadRead={handleThreadRead}
                />
            )}

            <button
                onClick={isOpen ? () => setIsOpen(false) : handleOpen}
                style={{
                    position: "relative",
                    width: 60, height: 60,
                    borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "linear-gradient(0deg, #01ddff, #006ede)",
                    backgroundImage: "-webkit-linear-gradient(0deg, #01ddff, #006ede)",
                    boxShadow: "0 8px 32px rgba(0,102,255,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0, transition: "transform 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            >
                {/* Icon */}
                {!isOpen ? (
                    <span style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                            src={mkChatIcon}
                            alt="Mokapen Chat"
                            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.15)", filter: "brightness(0) invert(1)" }}
                        />
                    </span>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                )}

                {/* ── Unread Badge on widget button ── */}
                {!isOpen && totalUnread > 0 && (
                    <span style={{
                        position: "absolute", top: -4, right: -4,
                        minWidth: 22, height: 22, padding: "0 5px",
                        background: "#ef4444", color: "white",
                        fontSize: 11, fontWeight: 700,
                        borderRadius: 11,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2.5px solid white",
                        animation: pulse ? "badgePulse 0.6s ease" : "badgePop 0.3s ease",
                        boxShadow: "0 2px 8px rgba(239,68,68,0.5)"
                    }}>
                        {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                )}
            </button>
        </div>
    );
}
