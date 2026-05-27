import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import echo from "../../config/echo";

export default function MessageThread({ conversation, onMarkRead }) {
    const { user }                      = useAuth();
    const [messages, setMessages]       = useState([]);
    const [input, setInput]             = useState("");
    const [loading, setLoading]         = useState(true);
    const [sending, setSending]         = useState(false);
    const bottomRef                     = useRef(null);

    // ── Load messages ─────────────────────────────────────────────────────────
    useEffect(() => {
        loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

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
            await ChatService.sendMessage(conversation.thread_id, text, user.id);
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
                        <div key={msg.message_id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
                            {!isMe && (
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                                    {conversation.name ? conversation.name.charAt(0).toUpperCase() : "?"}
                                </div>
                            )}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                                <div style={{
                                    padding: "10px 14px",
                                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                                    background: isMe ? "linear-gradient(135deg,#0066FF,#0044CC)" : "#f3f4f6",
                                    color: isMe ? "white" : "#1f2937",
                                    fontSize: 14, lineHeight: 1.5
                                }}>
                                    {msg.message}
                                </div>
                                <span style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, padding: "0 4px" }}>
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
