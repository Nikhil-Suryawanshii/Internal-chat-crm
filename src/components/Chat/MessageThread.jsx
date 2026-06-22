import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import echo from "../../config/echo";

export default function MessageThread({ conversation, onMarkRead, onConversationUpdate, onGroupDeleted }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [typingUser, setTypingUser] = useState(null);
    const [replyTo, setReplyTo] = useState(null);
    const [editingMsg, setEditingMsg] = useState(null);
    const [editText, setEditText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [activeMenuMsgId, setActiveMenuMsgId] = useState(null);
    const [reactions, setReactions] = useState({});

    // Key fix: ref the SCROLL CONTAINER, not a bottom sentinel
    const scrollContainerRef = useRef(null);
    const typingTimerRef = useRef(null);
    const inputRef = useRef(null);
    const isInitialLoad = useRef(true);
    const recognitionRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const inputBarRef = useRef(null);
    const isRecordingRef = useRef(false);  // ref so onend closure always sees latest value
    const lastTypingSentRef = useRef(0); // tracks when the last typing indicator request was sent
    const [emojiPickerPos, setEmojiPickerPos] = useState({ top: 0, left: 0, width: 320 });

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

    const handleReact = (msgId, emoji) => {
        setReactions(prev => {
            const current = prev[msgId] || [];
            if (current.includes(emoji)) {
                return { ...prev, [msgId]: current.filter(e => e !== emoji) };
            } else {
                const updated = [...current, emoji];
                const unique = Array.from(new Set(updated)).slice(-3); // limit to last 3 unique reactions
                return { ...prev, [msgId]: unique };
            }
        });
    };

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
                setMessages(p => {
                    if (p.some(m => String(m.message_id) === String(data.message_id))) return p;
                    return [...p, {
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
                }];
            });
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
        channel.listen(".group.deleted", (data) => {
            // The admin deleted this group — close out of the thread for everyone
            // currently viewing it, rather than letting them keep typing into a
            // conversation that no longer exists server-side.
            if (onGroupDeleted) onGroupDeleted(data.thread_id);
        });
        channel.listen(".member.added", () => {
            // Membership changed — let the parent refresh conversation metadata
            // (e.g. member count shown in the header) without a full reload.
            if (onConversationUpdate) onConversationUpdate({});
        });
        channel.listen(".member.removed", (data) => {
            if (String(data.member_id) === String(user.id)) {
                // I was removed from this group — leave the thread view.
                if (onGroupDeleted) onGroupDeleted(data.thread_id);
                return;
            }
            if (onConversationUpdate) onConversationUpdate({});
        });
        return () => {
            echo.leaveChannel(`chat.${conversation.thread_id}`);
            clearTimeout(typingTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversation.thread_id]);

    const handleInputChange = (e) => {
        setInput(e.target.value);
        
        const now = Date.now();
        // Throttle: only send typing=true indicator to backend if we haven't sent one in the last 4 seconds
        if (now - lastTypingSentRef.current > 4000) {
            ChatService.typingIndicator(conversation.thread_id, user.id, true).catch(() => { });
            lastTypingSentRef.current = now;
        }
        
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            ChatService.typingIndicator(conversation.thread_id, user.id, false).catch(() => { });
            lastTypingSentRef.current = 0; // reset so next keypress sends immediately
        }, 1500);
    };

    const send = async () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput(""); setReplyTo(null); setSending(true);
        ChatService.typingIndicator(conversation.thread_id, user.id, false).catch(() => { });
        lastTypingSentRef.current = 0; // reset so next keypress sends immediately
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

    const startEdit = (msg) => { setEditingMsg(msg); setEditText(msg.message); setReplyTo(null); setShowEmoji(false); setTimeout(() => inputRef.current?.focus(), 50); };
    const cancelEdit = () => { setEditingMsg(null); setEditText(""); };
    const startReply = (msg) => { setReplyTo(msg); setEditingMsg(null); setShowEmoji(false); setTimeout(() => inputRef.current?.focus(), 50); };
    const cancelReply = () => setReplyTo(null);

    // ── Emoji list ───────────────────────────────────────────
    const EMOJIS = [
        "😀", "😂", "😍", "🥰", "😎", "😭", "😅", "🤣", "😊", "😇",
        "🥳", "😴", "🤔", "😏", "😒", "😞", "😔", "😟", "😕", "🙁",
        "😣", "😖", "😫", "😩", "🥺", "😢", "😤", "😠", "😡", "🤬",
        "👍", "👎", "👏", "🙌", "🤝", "🙏", "❤️", "🔥", "✅", "🎉",
        "💯", "🚀", "⭐", "🌟", "💡", "🎁", "🍕", "🍔", "☕", "🎶",
    ];
    const insertEmoji = (emoji) => {
        const el = inputRef.current;
        if (!el) { setInput(p => p + emoji); setShowEmoji(false); return; }
        const start = el.selectionStart ?? input.length;
        const end = el.selectionEnd ?? input.length;
        const newVal = input.slice(0, start) + emoji + input.slice(end);
        setInput(newVal);
        setShowEmoji(false);
        setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
    };

    const updateEmojiPos = () => {
        const btn = emojiButtonRef.current;
        const bar = inputBarRef.current;
        if (!btn) return;
        const btnRect = btn.getBoundingClientRect();
        // Use the input-bar container's right edge as the max boundary
        // so the picker never overflows the chat window at any zoom level
        const containerRight = bar ? bar.getBoundingClientRect().right : window.innerWidth;
        const PICKER_W = Math.min(320, containerRight - 8); // shrink if container is tiny
        const clampedLeft = Math.min(btnRect.left, containerRight - PICKER_W - 4);
        setEmojiPickerPos({
            top: btnRect.top - 8,
            left: Math.max(8, clampedLeft),
            width: PICKER_W,
        });
    };

    const openEmoji = () => {
        if (showEmoji) { setShowEmoji(false); return; }
        updateEmojiPos();
        setShowEmoji(true);
    };

    // Keep picker anchored on zoom / resize / scroll
    useEffect(() => {
        if (!showEmoji) return;
        window.addEventListener("resize", updateEmojiPos);
        window.addEventListener("scroll", updateEmojiPos, true);
        return () => {
            window.removeEventListener("resize", updateEmojiPos);
            window.removeEventListener("scroll", updateEmojiPos, true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showEmoji]);

    // ── Voice recording (continuous SpeechRecognition) ───────
    const toggleVoice = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert("Voice input is not supported in this browser. Please use Chrome."); return; }

        // ── STOP ──
        if (isRecordingRef.current) {
            isRecordingRef.current = false;  // signal onend NOT to restart
            recognitionRef.current?.stop();
            setIsRecording(false);
            return;
        }

        // ── START ──
        isRecordingRef.current = true;
        setIsRecording(true);

        const startSession = () => {
            if (!isRecordingRef.current) return;  // user stopped while restarting
            const recognition = new SR();
            recognitionRef.current = recognition;
            recognition.lang = "en-US";
            recognition.continuous = true;      // keep listening
            recognition.interimResults = false; // only append confirmed words

            recognition.onresult = (e) => {
                // Collect every new final result since last event
                let chunk = "";
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) chunk += e.results[i][0].transcript + " ";
                }
                if (chunk.trim()) {
                    setInput(p => (p ? p + " " : "") + chunk.trim());
                }
            };

            recognition.onerror = (e) => {
                // "no-speech" just means silence — restart silently
                if (e.error === "no-speech" || e.error === "audio-capture") {
                    recognitionRef.current = null;
                    if (isRecordingRef.current) startSession();
                    return;
                }
                // Real error — stop everything
                isRecordingRef.current = false;
                setIsRecording(false);
            };

            recognition.onend = () => {
                // Browser ended the session — restart automatically if user hasn't stopped
                if (isRecordingRef.current) {
                    startSession();
                }
            };

            try { recognition.start(); } catch (_) {
                // start() throws if already running; wait a tick and retry
                setTimeout(startSession, 200);
            }
        };

        startSession();
    };

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
                @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
                .wa-msg-row { animation: fadeIn 0.18s ease; }
                .wa-msg-bubble-container .wa-chevron-btn { opacity: 0; pointer-events: none; }
                .wa-msg-bubble-container:hover .wa-chevron-btn,
                .wa-msg-bubble-container-active .wa-chevron-btn { opacity: 1 !important; pointer-events: auto !important; }
                .reaction-emoji-btn { transition: transform 0.1s ease; }
                .reaction-emoji-btn:hover { transform: scale(1.22); }
                .wa-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    padding: 8px 16px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 13px;
                    color: #3b4a54;
                    text-align: left;
                    transition: background 0.1s;
                }
                .wa-menu-item:hover {
                    background: #f5f6f6;
                }
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
                        // Look up sender photo: message fields → members list → logged-in user photo
                        const memberMatch = Array.isArray(conversation?.members)
                            ? conversation.members.find(m => String(m.user_id) === String(msg.sender_id))
                            : null;
                        const memberPhoto = memberMatch?.photo ?? memberMatch?.photo_url ?? null;
                        const ownPhoto = String(msg.sender_id) === String(user.id)
                            ? (user?.photo ?? user?.photo_url ?? user?.avatar ?? null)
                            : null;

                        return (
                            <div key={msg.message_id} className="wa-msg-row"
                                style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, marginTop: 2 }}
                            >
                                {/* Avatar — group only, received messages */}
                                {!isMe && isGroup && (() => {
                                    // Build full photo URL: handle plain filename vs full URL
                                    const rawPhoto = msg.sender_photo_url ?? msg.sender_avatar ?? msg.avatar ?? msg.photo_url ?? null;
                                    const senderId = msg.sender_id;
                                    const avatarUrl = rawPhoto
                                        ? (rawPhoto.startsWith("http")
                                            ? rawPhoto
                                            : `http://localhost/mokapen/public/uploads/users/${senderId}/images/${rawPhoto}`)
                                        : null;
                                    return (
                                        <div style={{ flexShrink: 0, position: "relative", width: 26, height: 26 }}>
                                            {avatarUrl && (
                                                <img
                                                    src={avatarUrl}
                                                    alt={senderName}
                                                    style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", display: "block" }}
                                                    onError={e => {
                                                        e.target.style.display = "none";
                                                        const fb = e.target.parentElement?.querySelector(".av-fallback");
                                                        if (fb) fb.style.display = "flex";
                                                    }}
                                                />
                                            )}
                                            <div className="av-fallback" style={{
                                                position: avatarUrl ? "absolute" : "relative",
                                                inset: 0,
                                                width: 26, height: 26,
                                                borderRadius: "50%",
                                                background: getColor(senderName),
                                                display: avatarUrl ? "none" : "flex",
                                                alignItems: "center", justifyContent: "center",
                                                color: "white", fontSize: 10, fontWeight: 600,
                                            }}>
                                                {senderName?.charAt(0)?.toUpperCase() ?? "?"}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "68%" }}>
                                    {/* Group sender name — always visible */}
                                    {!isMe && isGroup && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: getColor(senderName), marginBottom: 2, paddingLeft: 12 }}>
                                            {senderName}
                                        </span>
                                    )}

                                    {/* Bubble wrapper — action buttons float above it on hover */}
                                    {/* Bubble wrapper — WhatsApp-style context menu dropdown */}
                                    {!isDeleted && (
                                        <div 
                                            className={`wa-msg-bubble-container ${activeMenuMsgId === msg.message_id ? "wa-msg-bubble-container-active" : ""}`}
                                            style={{ position: "relative" }}
                                        >
                                            {/* Bubble */}
                                            <div style={{
                                                position: "relative",
                                                padding: "7px 32px 7px 12px", // paddingRight: 32px to make room for chevron
                                                borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                                background: isMe ? "linear-gradient(135deg,#0066FF,#0044CC)" : "#ffffff",
                                                color: isMe ? "white" : "#111b21",
                                                fontSize: 14,
                                                lineHeight: 1.5,
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                                minWidth: 70,
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

                                                {msg.message}

                                                {/* Chevron trigger button inside bubble */}
                                                <button
                                                    className="wa-chevron-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveMenuMsgId(activeMenuMsgId === msg.message_id ? null : msg.message_id);
                                                    }}
                                                    style={{
                                                        position: "absolute",
                                                        top: 6,
                                                        right: 6,
                                                        background: isMe ? "rgba(0,85,238,0.95)" : "rgba(240,242,245,0.95)",
                                                        borderRadius: "50%",
                                                        width: 20,
                                                        height: 20,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        zIndex: 10,
                                                        color: isMe ? "#ffffff" : "#8696a0",
                                                        boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                                                    }}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="6 9 12 15 18 9"/>
                                                    </svg>
                                                </button>

                                                {/* Reactions badge */}
                                                {reactions[msg.message_id] && reactions[msg.message_id].length > 0 && (
                                                    <div style={{
                                                        position: "absolute",
                                                        bottom: -10,
                                                        [isMe ? "left" : "right"]: 8,
                                                        background: "#ffffff",
                                                        border: "1px solid #e9edef",
                                                        borderRadius: 12,
                                                        padding: "2px 6px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 2,
                                                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                                                        zIndex: 6,
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={() => handleReact(msg.message_id, reactions[msg.message_id][0])}
                                                    >
                                                        <span style={{ fontSize: 12, display: "flex", gap: 1 }}>
                                                            {reactions[msg.message_id].map((emoji, i) => (
                                                                <span key={i}>{emoji}</span>
                                                            ))}
                                                        </span>
                                                        {reactions[msg.message_id].length > 1 && (
                                                            <span style={{ fontSize: 10, color: "#8696a0", fontWeight: 600, marginLeft: 2 }}>
                                                                {reactions[msg.message_id].length}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

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
                                            <span style={{ fontSize: 11, color: "#8696a0", marginTop: 3, padding: "0 4px", display: "flex", gap: 4, alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                                {isEdited && (
                                                    <span style={{ color: "#b0b8c8", fontStyle: "italic" }}>edited</span>
                                                )}
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                {isMe && (
                                                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ marginLeft: 1 }}>
                                                        <path d="M5 12l5 5L20 7" stroke="#8696a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                        <path d="M12 12l5 5" stroke="#8696a0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </span>

                                            {/* Dropdown Menu (Outside bubble, inside container relative wrapper) */}
                                            {activeMenuMsgId === msg.message_id && (
                                                <>
                                                    {/* Backdrop to close on outside click */}
                                                    <div 
                                                        onClick={() => setActiveMenuMsgId(null)}
                                                        style={{
                                                            position: "fixed",
                                                            inset: 0,
                                                            zIndex: 999,
                                                            cursor: "default",
                                                        }}
                                                    />
                                                    <div style={{
                                                        position: "absolute",
                                                        bottom: "calc(100% + 4px)", // Opens upwards (on top side of message)
                                                        [isMe ? "right" : "left"]: 6,
                                                        background: "#ffffff",
                                                        borderRadius: "12px",
                                                        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
                                                        zIndex: 1000,
                                                        width: "190px",
                                                        padding: "6px 0",
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        animation: "fadeIn 0.12s ease",
                                                    }}>
                                                        {/* Reaction Bar */}
                                                        <div style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            padding: "4px 8px 8px",
                                                            borderBottom: "1px solid #f0f2f5",
                                                            gap: 2,
                                                        }}>
                                                            {["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => {
                                                                        handleReact(msg.message_id, emoji);
                                                                        setActiveMenuMsgId(null);
                                                                    }}
                                                                    style={{
                                                                        background: "none",
                                                                        border: "none",
                                                                        cursor: "pointer",
                                                                        fontSize: "18px",
                                                                        padding: "2px",
                                                                        borderRadius: "50%",
                                                                    }}
                                                                    className="reaction-emoji-btn"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#8696a0", fontSize: "16px", padding: "2px" }}>+</button>
                                                        </div>

                                                        {/* Menu Items */}
                                                        <button className="wa-menu-item" onClick={() => { setActiveMenuMsgId(null); }}>
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8696a0" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                                            <span style={{ flex: 1 }}>Message info</span>
                                                        </button>

                                                        <button className="wa-menu-item" onClick={() => { setActiveMenuMsgId(null); startReply(msg); }}>
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8696a0" }}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                                                            <span style={{ flex: 1 }}>Reply</span>
                                                        </button>

                                                        <button className="wa-menu-item" onClick={() => { setActiveMenuMsgId(null); navigator.clipboard.writeText(msg.message); }}>
                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8696a0" }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                                            <span style={{ flex: 1 }}>Copy</span>
                                                        </button>

                                                        {isMe && (
                                                            <button className="wa-menu-item" onClick={() => { setActiveMenuMsgId(null); startEdit(msg); }}>
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8696a0" }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                                                                <span style={{ flex: 1 }}>Edit</span>
                                                            </button>
                                                        )}

                                                        {isMe && (
                                                            <button className="wa-menu-item" onClick={() => { setActiveMenuMsgId(null); handleDelete(msg.message_id); }} style={{ color: "#ef4444", borderTop: "1px solid #f0f2f5", marginTop: 4, paddingTop: 8 }}>
                                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#ef4444" }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                                                <span style={{ flex: 1 }}>Delete</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Deleted bubble (shown outside wrapper) */}
                                    {isDeleted && (
                                        <>
                                            <div style={{
                                                position: "relative",
                                                padding: "7px 12px",
                                                borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                                background: "rgba(255,255,255,0.6)",
                                                color: "#8696a0",
                                                fontSize: 14,
                                                lineHeight: 1.5,
                                                fontStyle: "italic",
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                                minWidth: 60,
                                                wordBreak: "break-word",
                                            }}>
                                                🚫 This message was deleted
                                                <div style={{
                                                    position: "absolute", top: 0,
                                                    [isMe ? "right" : "left"]: -7,
                                                    width: 0, height: 0,
                                                    borderTop: `8px solid rgba(255,255,255,0.6)`,
                                                    [isMe ? "borderLeft" : "borderRight"]: "8px solid transparent",
                                                }} />
                                            </div>
                                            <span style={{ fontSize: 11, color: "#8696a0", marginTop: 3, padding: "0 4px", display: "flex", gap: 4, alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </>
                                    )}
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
            <div ref={inputBarRef} style={{ padding: "8px 12px", background: "#f0f2f5", flexShrink: 0, position: "relative" }}>

                {/* Emoji picker — rendered fixed so it escapes overflow:hidden parents */}
                {showEmoji && (
                    <>
                        {/* Backdrop to close on outside click */}
                        <div
                            onClick={() => setShowEmoji(false)}
                            style={{ position: "fixed", inset: 0, zIndex: 99 }}
                        />
                        <div style={{
                            position: "fixed",
                            top: emojiPickerPos.top,
                            left: emojiPickerPos.left,
                            transform: "translateY(-100%)",
                            background: "#fff",
                            border: "1px solid #e9edef",
                            borderRadius: 12,
                            padding: 10,
                            display: "grid",
                            width: emojiPickerPos.width ?? 320,
                            gridTemplateColumns: `repeat(auto-fill, minmax(28px, 1fr))`,
                            gap: 4,
                            zIndex: 100,
                            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                        }}>
                            {EMOJIS.map(em => (
                                <button key={em} onClick={() => insertEmoji(em)}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 3, borderRadius: 6, lineHeight: 1 }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f0f2f5"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                                >{em}</button>
                            ))}
                        </div>
                    </>
                )}

                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <button
                        ref={emojiButtonRef}
                        onClick={openEmoji}
                        title="Emoji"
                        style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: showEmoji ? "#e9edef" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                        onClick={editingMsg ? handleEditSave : (input.trim() ? send : toggleVoice)}
                        disabled={editingMsg ? !editText.trim() : (input.trim() && sending)}
                        title={isRecording ? "Stop recording" : (input.trim() ? "Send" : "Voice message")}
                        style={{
                            width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0,
                            cursor: "pointer",
                            background: isRecording
                                ? "linear-gradient(135deg,#ef4444,#dc2626)"
                                : (editingMsg ? (editText.trim() ? "linear-gradient(135deg,#f59e0b,#d97706)" : "#aebac1")
                                    : (input.trim() && !sending ? BRAND_GRADIENT : "#aebac1")),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.18s", boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                            animation: isRecording ? "pulse 1s ease infinite" : "none",
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
