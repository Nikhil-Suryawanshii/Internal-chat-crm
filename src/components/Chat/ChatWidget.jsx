import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatWindow from "./ChatWindow";
import ChatService from "../../services/chatService";
import { getEcho } from "../../config/echo";

export default function ChatWidget() {
    const { user }                          = useAuth();
    const [open, setOpen]                   = useState(false);
    const [totalUnread, setTotalUnread]     = useState(0);
    const [pulse, setPulse]                 = useState(false);
    const prevUnreadRef                     = useRef(0);

    // Load initial unread count
    useEffect(() => {
        if (!user) return;
        const fetchUnread = async () => {
            try {
                const res = await ChatService.getConversations(user.id, user.org_id);
                if (res.data.success) {
                    const count = res.data.data.reduce((sum, c) => sum + (parseInt(c.unread_count) || 0), 0);
                    setTotalUnread(count);
                    prevUnreadRef.current = count;
                }
            } catch (err) {
                console.error("Error fetching unread count:", err);
            }
        };
        fetchUnread();
    }, [user]);

    // Real-time unread via Echo
    useEffect(() => {
        if (!user) return;
        const echo = getEcho();
        const channel = echo.channel(`conv.${user.id}`);
        const handler = (data) => {
            if (String(data.sender_id) !== String(user.id) && !open) {
                setTotalUnread(prev => {
                    const next = prev + 1;
                    if (next > prevUnreadRef.current) {
                        setPulse(true);
                        setTimeout(() => setPulse(false), 600);
                    }
                    prevUnreadRef.current = next;
                    return next;
                });
            }
        };
        channel.listen(".message.sent", handler);
        // stopListening removes only THIS handler — preserves ConversationList's listener
        return () => channel.stopListening(".message.sent", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, open]);

    const handleThreadRead = (unreadCleared) => {
        setTotalUnread(prev => Math.max(0, prev - unreadCleared));
        prevUnreadRef.current = Math.max(0, prevUnreadRef.current - unreadCleared);
    };

    const CHAT_GRADIENT = "linear-gradient(0deg, #01ddff, #006ede)";
    const CHAT_GRADIENT_WEBKIT = "-webkit-linear-gradient(0deg, #01ddff, #006ede)";

    return (
        <>
            <style>{`
                @keyframes wa-badge-pop {
                    0%   { transform: scale(0); opacity: 0; }
                    70%  { transform: scale(1.25); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes wa-pulse-ring {
                    0%   { transform: scale(1);   opacity: 0.7; }
                    100% { transform: scale(1.55); opacity: 0; }
                }
                @keyframes wa-btn-bounce {
                    0%, 100% { transform: translateY(0) scale(1); }
                    40%      { transform: translateY(-6px) scale(1.06); }
                    60%      { transform: translateY(-2px) scale(0.98); }
                }
                @keyframes wa-slide-up {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                .wa-fab:hover {
                    transform: scale(1.08) !important;
                }
                .wa-fab:active {
                    transform: scale(0.95) !important;
                }
            `}</style>

            {/* Chat window */}
            {open && (
                <div style={{
                    position: "fixed",
                    bottom: 90,
                    right: 24,
                    zIndex: 9999,
                    animation: "wa-slide-up 0.22s cubic-bezier(0.16,1,0.3,1)",
                }}>
                    <ChatWindow
                        onClose={() => setOpen(false)}
                        onThreadRead={handleThreadRead}
                    />
                </div>
            )}

            {/* FAB */}
            <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Pulse ring when new message arrives */}
                {pulse && (
                    <div style={{
                        position: "absolute",
                        width: 60, height: 60,
                        borderRadius: "50%",
                        background: CHAT_GRADIENT,
                        backgroundImage: CHAT_GRADIENT_WEBKIT,
                        animation: "wa-pulse-ring 0.6s ease-out forwards",
                        pointerEvents: "none",
                    }} />
                )}

                {/* Unread badge */}
                {totalUnread > 0 && !open && (
                    <div style={{
                        position: "absolute",
                        top: -6, right: -6,
                        minWidth: 20, height: 20, padding: "0 5px",
                        background: "#ef4444",
                        color: "white",
                        fontSize: 11, fontWeight: 700,
                        borderRadius: 10,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        zIndex: 1,
                        border: "2px solid white",
                        boxShadow: "0 2px 6px rgba(239,68,68,0.5)",
                        animation: "wa-badge-pop 0.3s cubic-bezier(0.16,1,0.3,1)",
                        pointerEvents: "none",
                    }}>
                        {totalUnread > 99 ? "99+" : totalUnread}
                    </div>
                )}

                {/* FAB button */}
                <button
                    className="wa-fab"
                    onClick={() => setOpen(o => !o)}
                    title={open ? "Close chat" : "Open chat"}
                    style={{
                        position: "relative",
                        width: 60, height: 60,
                        borderRadius: "50%", border: "none", cursor: "pointer",
                        background: CHAT_GRADIENT,
                        backgroundImage: CHAT_GRADIENT_WEBKIT,
                        boxShadow: "0 8px 32px rgba(0,102,255,0.4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        transition: "transform 0.2s",
                        animation: pulse ? "wa-btn-bounce 0.5s ease" : "none",
                        outline: "none",
                    }}
                >
                    {open ? (
                        /* X icon when open */
                        <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    ) : (
                        <span style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}>
                            <img
                                src="/mk-chat.svg"
                                alt="Mokapen Chat"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    transform: "scale(1.15)",
                                    filter: "brightness(0) invert(1)",
                                }}
                            />
                        </span>
                    )}
                </button>

                {/* Tooltip label */}
                {!open && (
                    <div style={{
                        position: "absolute",
                        bottom: 68,
                        right: 0,
                        background: "rgba(0,0,0,0.75)",
                        color: "white",
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "4px 10px",
                        borderRadius: 8,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        opacity: 0,
                        transition: "opacity 0.2s",
                    }}
                        className="wa-fab-tooltip"
                    >
                        Chat with us
                    </div>
                )}
            </div>
        </>
    );
}
