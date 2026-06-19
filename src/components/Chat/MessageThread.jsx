import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import echo from "../../config/echo";

export default function MessageThread({ conversation, onMarkRead, onConversationUpdate }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [typingUser, setTypingUser] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [editingMsg, setEditingMsg] = useState(null);
    const [editText, setEditText] = useState("");

    // Key fix: ref the SCROLL CONTAINER, not a bottom sentinel
    const scrollContainerRef = useRef(null);
    const typingTimerRef = useRef(null);
    const inputRef = useRef(null);
    const isInitialLoad = useRef(true);

    const loadMessages = useCallback(async () => {
        try {
            const res = await ChatService.getMessages(conversation.thread_id, user.id);
            if (res.data.success) setMessages(res.data.data);
        } catch (err) {
            console.error("Error loading messages:", err);
        } finally {
            setLoading(false);
        }
    }, [conversation.thread_id, user.id]);

    // ── Scroll helpers ──────────────────────────────────────────────────────
    const scrollToBottom = (behavior = "smooth") => {
        const el = scrollContainerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    };

    // Instant scroll on first load (before paint so user never sees top)
    useLayoutEffect(() => {
        if (!loading && isInitialLoad.current) {
            scrollToBottom("instant");
            isInitialLoad.current = false;
        }
    }, [loading]);

    // Smooth scroll whenever messages or typing changes (new message arrived)
    useEffect(() => {
        if (!isInitialLoad.current) {
            scrollToBottom("smooth");
        }
    }, [messages, typingUser]);

    // Reset on conversation change
    useEffect(() => {
        isInitialLoad.current = true;
        setMessages([]);
        setLoading(true);
        loadMessages();
    }, [conversation.thread_id, loadMessages]);

    useEffect(() => {
        const previousUnread = parseInt(conversation.unread_count) || 0;
        if (previousUnread > 0) {
            if (onMarkRead) onMarkRead(previousUnread);
            ChatService.markAsRead(conversation.thread_id, user?.id, user?.org_id).catch(() => { });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    useEffect(() => {
        const channel = echo.channel(`chat.${conversation.thread_id}`);
        channel.listen(".message.sent", (data) => {
            if (String(data.sender_id) !== String(user.id)) {
                setMessages(p => [...p, {
                    message_id: data.message_id,
                    sender_id: data.sender_id,
                    message: data.message,
                    message_type: data.message_type,
                    reply_to_id: data.reply_to_id,
                    reply_message: data.reply_message,
                    reply_sender_name: data.reply_sender_name,
                    sender_name: data.sender_name,
                    sender_photo_url: data.sender_avatar,
                    created_at: data.created_at,
                    is_deleted: false,
                    is_edited: false,
                }]);
                setTypingUser(null);
                ChatService.markAsRead(conversation.thread_id, user?.id, user?.org_id).catch(() => { });
            }
        });
        channel.listen(".message.deleted", (data) => {
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(data.message_id)
                    ? { ...msg, is_deleted: true, message: null }
                    : msg
            ));
        });
        channel.listen(".message.edited", (data) => {
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(data.message_id)
                    ? { ...msg, message: data.new_message, is_edited: true }
                    : msg
            ));
        });
        channel.listen(".user.typing", (data) => {
            if (String(data.user_id) !== String(user.id)) {
                if (data.is_typing) {
                    setTypingUser(data.user_name);
                    clearTimeout(typingTimerRef.current);
                    typingTimerRef.current = setTimeout(() => setTypingUser(null), 3000);
                } else {
                    setTypingUser(null);
                }
            }
        });
        return () => {
            echo.leaveChannel(`chat.${conversation.thread_id}`);
            clearTimeout(typingTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        ChatService.typingIndicator(conversation.thread_id, user.id, true).catch(() => { });
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            ChatService.typingIndicator(conversation.thread_id, user.id, false).catch(() => { });
        }, 1500);
    };

    const send = async () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput(""); setReplyTo(null); setSending(true);
        ChatService.typingIndicator(conversation.thread_id, user.id, false).catch(() => { });
        const tempMsg = {
            message_id: `temp-${Date.now()}`,
            sender_id: user.id,
            message: text,
            reply_to_id: replyTo?.message_id ?? null,
            reply_message: replyTo?.message ?? null,
            reply_sender_name: replyTo ? (replyTo.sender_name ?? "You") : null,
            created_at: new Date().toISOString(),
            is_deleted: false,
            is_edited: false,
        };
        setMessages(p => [...p, tempMsg]);
        try {
            const res = await ChatService.sendMessage(
                conversation.thread_id, text, user.id, user.org_id, replyTo?.message_id ?? null
            );
            if (res.data.success && res.data.data) {
                setMessages(prev => prev.map(msg =>
                    msg.message_id === tempMsg.message_id ? { ...msg, ...res.data.data } : msg
                ));
            }
        } catch (err) {
            console.error("Error sending message:", err);
            setMessages(prev => prev.filter(m => m.message_id !== tempMsg.message_id));
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (messageId) => {
        if (!window.confirm("Delete this message?")) return;
        try {
            await ChatService.deleteMessage(messageId, user.id);
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(messageId)
                    ? { ...msg, is_deleted: true, message: null }
                    : msg
            ));
        } catch (err) { console.error("Error deleting message:", err); }
    };

    const handleEditSave = async () => {
        if (!editText.trim() || !editingMsg) return;
        try {
            await ChatService.editMessage(editingMsg.message_id, user.id, editText.trim());
            setMessages(prev => prev.map(msg =>
                String(msg.message_id) === String(editingMsg.message_id)
                    ? { ...msg, message: editText.trim(), is_edited: true }
                    : msg
            ));
            setEditingMsg(null); setEditText("");
        } catch (err) { console.error("Error editing message:", err); }
    };

    const startEdit = (msg) => { setEditingMsg(msg); setEditText(msg.message); setReplyTo(null); setTimeout(() => inputRef.current?.focus(), 50); };
    const cancelEdit = () => { setEditingMsg(null); setEditText(""); };
    const startReply = (msg) => { setReplyTo(msg); setEditingMsg(null); setTimeout(() => inputRef.current?.focus(), 50); };
    const cancelReply = () => setReplyTo(null);

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const getColor = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

    const BRAND_PRIMARY = "#006ede";
    const BRAND_CYAN = "#01ddff";
    const BRAND_GRADIENT = "linear-gradient(0deg, #01ddff, #006ede)";
    const THREAD_BG = "#efeae2";

    // Group messages by date
    const groupedMessages = [];
    let lastDateStr = null;
    messages.forEach(msg => {
        const d = new Date(msg.created_at);
        const now = new Date();
        let dateStr;
        if (d.toDateString() === now.toDateString()) {
            dateStr = "Today";
        } else {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            dateStr = d.toDateString() === yesterday.toDateString()
                ? "Yesterday"
                : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
        }
        if (dateStr !== lastDateStr) {
            groupedMessages.push({ type: "divider", label: dateStr });
            lastDateStr = dateStr;
        }
        groupedMessages.push({ type: "msg", msg });
    });

    const otherName = conversation.other_user_name ?? conversation.name ?? "";
    const sourceType = String(conversation?.source_type || conversation?.type || conversation?.thread_type || "").toLowerCase();
    const membersCount = Array.isArray(conversation?.members) ? conversation.members.length : 0;
    const isGroup =
        sourceType === "group" ||
        sourceType === "groupchat" ||
        sourceType === "group_chat" ||
        conversation?.is_group === true ||
        conversation?.is_group === 1 ||
        conversation?.is_group === "1" ||
        conversation?.is_group === "true" ||
        Boolean(conversation?.group_name || conversation?.title || conversation?.name || conversation?.group_id) ||
        membersCount > 1;

    return (
        /*
         * KEY FIX: The outer wrapper uses display:flex + flexDirection:column.
         * The scroll container gets flex:1 AND min-height:0.
         * Without min-height:0, flex children ignore overflow and expand to
         * fit content — making the whole page scroll instead of just this div.
         */
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",       /* fill whatever parent gives */
            minHeight: 0,            /* allow shrinking inside flex parent */
            background: THREAD_BG,
            overflow: "hidden",     /* nothing bleeds out */
        }}>
            <style>{`
                @keyframes spin   { to { transform: rotate(360deg); } }
                @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
                @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
                .wa-msg-row { animation: fadeIn 0.18s ease; }
                .wa-msg-row .wa-action-btn { opacity: 0; transition: opacity 0.12s; }
                .wa-msg-row:hover .wa-action-btn { opacity: 1; }
                .wa-thread-scroll::-webkit-scrollbar { width: 5px; }
                .wa-thread-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
            `}</style>

            {/* ── SCROLL CONTAINER ── */}
            <div
                ref={scrollContainerRef}
                className="wa-thread-scroll"
                style={{
                    flex: 1,
                    minHeight: 0,        /* THE critical fix — without this flex ignores overflow */
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: "12px 16px 8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                }}
            >
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 10 }}>
                        <div style={{ width: 28, height: 28, border: "3px solid rgba(0,0,0,0.1)", borderTop: `3px solid ${BRAND_PRIMARY}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <p style={{ color: "#8696a0", fontSize: 13, margin: 0 }}>Loading messages...</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 36 }}>👋</div>
                        <p style={{ color: "#8696a0", fontSize: 14, margin: 0 }}>No messages yet. Say hello!</p>
                    </div>
                ) : (
                    groupedMessages.map((item, idx) => {
                        if (item.type === "divider") {
                            return (
                                <div key={`div-${idx}`} style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                                    <span style={{ background: "#e1f3fb", color: "#54656f", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 7 }}>
                                        {item.label}
                                    </span>
                                </div>
                            );
                        }

                        const { msg } = item;
                        const isMe = String(msg.sender_id) === String(user.id);
                        const isDeleted = msg.is_deleted || msg.deleted_at;
                        const isEdited = msg.is_edited || msg.status === "edited";

                        const createdByMatch = typeof msg.message === "string"
                            ? msg.message.match(/created by\s+(\S+)/i)
                            : null;
                        const senderName =
                            msg.sender_name ??
                            msg.sender?.name ??
                            msg.name ??
                            (isMe
                                ? (user?.name ?? "You")
                                : (createdByMatch?.[1] || conversation?.group_name || conversation?.title || conversation?.name || otherName || "Unknown"));
                        const senderPhoto =
                            msg.sender_photo_url ??
                            msg.sender_avatar ??
                            msg.avatar ??
                            msg.photo_url ??
                            null;

                        return (
                            <div key={msg.message_id} className="wa-msg-row"
                                style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, marginTop: 2 }}
                            >
                                {/* Avatar — group only, received messages */}
                                {!isMe && isGroup && (
                                    <div style={{ flexShrink: 0 }}>
                                        {senderPhoto ? (
                                            <img src={senderPhoto} alt={senderName} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
                                        ) : (
                                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: getColor(senderName), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 600 }}>
                                                {senderName?.charAt(0)?.toUpperCase() ?? "?"}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "68%" }}>
                                    {/* Group sender name */}
                                    {!isMe && isGroup && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: getColor(senderName), marginBottom: 2, paddingLeft: 12 }}>
                                            {senderName}
                                        </span>
                                    )}

                                    {/* Hover action buttons */}
                                    {!isDeleted && (
                                        <div className="wa-action-btn" style={{ display: "flex", gap: 3, marginBottom: 3, alignSelf: isMe ? "flex-end" : "flex-start" }}>
                                            <button onClick={() => startReply(msg)}
                                                style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #e9edef", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 11, color: "#54656f" }}>
                                                ↩ Reply
                                            </button>
                                            {isMe && (
                                                <button onClick={() => startEdit(msg)}
                                                    style={{ background: "rgba(255,255,255,0.9)", border: "1px solid #e9edef", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 11, color: "#2563eb" }}>
                                                    ✏️ Edit
                                                </button>
                                            )}
                                            {isMe && (
                                                <button onClick={() => handleDelete(msg.message_id)}
                                                    style={{ background: "rgba(255,240,240,0.95)", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 11, color: "#ef4444" }}>
                                                    🗑
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Bubble */}
                                    <div style={{
                                        position: "relative",
                                        padding: "7px 12px",
                                        borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                        background: isDeleted ? "rgba(255,255,255,0.6)" : isMe ? "linear-gradient(135deg,#0066FF,#0044CC)" : "#ffffff",
                                        color: isDeleted ? "#8696a0" : isMe ? "white" : "#111b21",
                                        fontSize: 14,
                                        lineHeight: 1.5,
                                        fontStyle: isDeleted ? "italic" : "normal",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                        minWidth: 60,
                                        wordBreak: "break-word",
                                    }}>
                                        {/* Reply preview */}
                                        {msg.reply_to_id && msg.reply_message && (
                                            <div style={{
                                                background: isMe ? "rgba(255,255,255,0.18)" : "#f0f2f5",
                                                borderLeft: `3px solid ${isMe ? "rgba(255,255,255,0.7)" : BRAND_CYAN}`,
                                                padding: "4px 8px",
                                                borderRadius: 6,
                                                marginBottom: 6,
                                                fontSize: 12,
                                            }}>
                                                <span style={{ fontWeight: 600, fontSize: 11, color: isMe ? "rgba(255,255,255,0.85)" : BRAND_PRIMARY }}>
                                                    {msg.reply_sender_name ?? "User"}
                                                </span>
                                                <p style={{ margin: "1px 0 0", color: isMe ? "rgba(255,255,255,0.75)" : "#8696a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {msg.reply_message}
                                                </p>
                                            </div>
                                        )}

                                        {isDeleted ? "🚫 This message was deleted" : msg.message}

                                        {/* Bubble tail */}
                                        <div style={{
                                            position: "absolute",
                                            top: 0,
                                            [isMe ? "right" : "left"]: -7,
                                            width: 0,
                                            height: 0,
                                            borderTop: `8px solid ${isMe ? "#0044CC" : "#ffffff"}`,
                                            [isMe ? "borderLeft" : "borderRight"]: "8px solid transparent",
                                        }} />
                                    </div>

                                    {/* Timestamp + tick */}
                                    <span style={{ fontSize: 11, color: "#8696a0", marginTop: 3, padding: "0 4px", display: "flex", gap: 4, alignItems: "center" }}>
                                        {isEdited && !isDeleted && (
                                            <span style={{ color: "#b0b8c8", fontStyle: "italic" }}>edited</span>
                                        )}
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        {isMe && !isDeleted && (
                                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ marginLeft: 1 }}>
                                                <path d="M5 12l5 5L20 7" stroke="#8696a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d="M12 12l5 5" stroke="#8696a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Typing dots */}
                {typingUser && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: getColor(otherName), display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                            {otherName?.charAt(0)?.toUpperCase() ?? "?"}
                        </div>
                        <div style={{ background: "#ffffff", padding: "10px 14px", borderRadius: "0 12px 12px 12px", display: "flex", gap: 4, alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.13)" }}>
                            {[0, 150, 300].map(d => (
                                <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: "#8696a0", display: "inline-block", animation: "bounce 1s infinite", animationDelay: d + "ms" }} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* ── END SCROLL CONTAINER ── */}

            {/* Reply bar */}
            {replyTo && (
                <div style={{ padding: "8px 14px", background: "#f0f2f5", borderTop: "1px solid #e9edef", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div style={{ borderLeft: `3px solid ${BRAND_CYAN}`, paddingLeft: 8 }}>
                        <p style={{ margin: 0, fontSize: 12, color: BRAND_PRIMARY, fontWeight: 600 }}>
                            Replying to {replyTo.sender_name ?? "message"}
                        </p>
                        <p style={{ margin: "1px 0 0", fontSize: 12, color: "#8696a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                            {replyTo.message}
                        </p>
                    </div>
                    <button onClick={cancelReply} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", fontSize: 16, padding: "0 4px" }}>✕</button>
                </div>
            )}

            {/* Edit bar */}
            {editingMsg && (
                <div style={{ padding: "8px 14px", background: "#fffbeb", borderTop: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#92400e", fontWeight: 600 }}>✏️ Editing message</p>
                    <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", fontSize: 16, padding: "0 4px" }}>✕</button>
                </div>
            )}

            {/* Input bar */}
            <div style={{ padding: "8px 12px", background: "#f0f2f5", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <button style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="22" height="22" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 13s1.5 2 4 2 4-2 4-2" />
                            <circle cx="9" cy="10" r="1" fill="#8696a0" />
                            <circle cx="15" cy="10" r="1" fill="#8696a0" />
                        </svg>
                    </button>

                    <div style={{ flex: 1, background: "#ffffff", borderRadius: 20, display: "flex", alignItems: "flex-end", padding: "8px 14px", minHeight: 40, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                        <textarea
                            ref={inputRef}
                            rows={1}
                            value={editingMsg ? editText : input}
                            onChange={editingMsg ? e => setEditText(e.target.value) : handleInputChange}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    editingMsg ? handleEditSave() : send();
                                }
                                if (e.key === "Escape") { cancelEdit(); cancelReply(); }
                            }}
                            placeholder={editingMsg ? "Edit message..." : "Type a message"}
                            style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 15, color: "#3b4a54", lineHeight: 1.5, maxHeight: 80, padding: 0, fontFamily: "inherit" }}
                        />
                    </div>

                    <button
                        onClick={editingMsg ? handleEditSave : send}
                        disabled={editingMsg ? !editText.trim() : (!input.trim() || sending)}
                        style={{
                            width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0,
                            cursor: (editingMsg ? editText.trim() : (input.trim() && !sending)) ? "pointer" : "default",
                            background: (editingMsg ? editText.trim() : (input.trim() && !sending))
                                ? (editingMsg ? "linear-gradient(135deg,#f59e0b,#d97706)" : BRAND_GRADIENT)
                                : "#aebac1",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.18s", boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                        }}
                    >
                        {sending ? (
                            <div style={{ width: 16, height: 16, border: "2.5px solid rgba(255,255,255,0.4)", borderTop: "2.5px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        ) : editingMsg ? (
                            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        ) : input.trim() ? (
                            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        ) : (
                            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
