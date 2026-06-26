import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import { getEcho } from "../../config/echo";
import { getAvatarUrl } from "../../config/urls";

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
    const [menuOpenUpward, setMenuOpenUpward] = useState(true);
    const [reactions, setReactions] = useState({});
    const [showAttach, setShowAttach] = useState(false);

    const docInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const videoInputRef = useRef(null);

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
        const echo = getEcho();
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
                        reply_sender_photo_url: data.reply_sender_photo_url ?? null,
                        sender_name: data.sender_name,
                        sender_photo_url: data.sender_avatar,
                        created_at: data.created_at,
                        is_deleted: false,
                        is_edited: false,
                        is_read: data.is_read ?? 0,
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
        channel.listen(".message.read", (data) => {
            if (String(data.thread_id) !== String(conversation.thread_id)) return;
            if (String(data.read_by) !== String(user.id)) {
                const sourceType = String(conversation?.source_type || conversation?.type || conversation?.thread_type || "").toLowerCase();
                if (sourceType === 'group') {
                    ChatService.getMessages(conversation.thread_id, user.id).then(res => {
                        if (res.data.success) {
                            setMessages(prev => prev.map(msg => {
                                const updatedMsg = res.data.data.find(m => String(m.message_id) === String(msg.message_id));
                                return updatedMsg ? { ...msg, is_read: updatedMsg.is_read } : msg;
                            }));
                        }
                    }).catch(() => {});
                } else {
                    setMessages(prev => prev.map(msg => ({ ...msg, is_read: 1 })));
                }
            }
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
            is_read: 0,
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

                        if (msg.message_type === "system") {
                            return (
                                <div key={msg.message_id} style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                                    <span style={{ background: "#f0f2f5", color: "#54656f", fontSize: 12, padding: "5px 12px", borderRadius: 8, textAlign: "center", boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}>
                                        {msg.message}
                                    </span>
                                </div>
                            );
                        }

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
                                style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 6, marginTop: 2 }}
                            >
                                {/* Avatar — group only, received messages */}
                                {!isMe && isGroup && (() => {
                                    // Build full photo URL: handle plain filename vs full URL
                                    const rawPhoto = msg.sender_photo ?? msg.sender_photo_url ?? msg.sender_avatar ?? msg.avatar ?? msg.photo_url ?? memberPhoto ?? ownPhoto ?? null;
                                    const senderId = msg.sender_id;
                                    const avatarUrl = rawPhoto ? getAvatarUrl(rawPhoto, senderId) : null;
                                    return (
                                        <div style={{ flexShrink: 0, position: "relative", width: 30, height: 30 }}>
                                            {avatarUrl && (
                                                <img
                                                    src={avatarUrl}
                                                    alt={senderName}
                                                    style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", display: "block" }}
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
                                                width: 30, height: 30,
                                                borderRadius: "50%",
                                                background: getColor(senderName),
                                                display: avatarUrl ? "none" : "flex",
                                                alignItems: "center", justifyContent: "center",
                                                color: "white", fontSize: 13, fontWeight: 600,
                                            }}>
                                                {senderName?.charAt(0)?.toUpperCase() ?? "?"}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "68%" }}>
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
                                                padding: "7px 12px",
                                                borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                                background: isMe ? "linear-gradient(135deg,#0066FF,#0044CC)" : "#ffffff",
                                                color: isMe ? "white" : "#111b21",
                                                fontSize: 14.5,
                                                lineHeight: 1.5,
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                                minWidth: 70,
                                                wordBreak: "break-word",
                                            }}>
                                                {/* Group sender name — always visible */}
                                                {!isMe && isGroup && (
                                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: getColor(senderName), marginBottom: 3, lineHeight: 1.2 }}>
                                                        {senderName}
                                                    </div>
                                                )}
                                                {/* Reply preview — attractive sender avatar + name + quote */}
                                                {msg.reply_to_id && msg.reply_message && (() => {
                                                    const rName    = msg.reply_sender_name ?? "User";
                                                    const rInitial = rName.charAt(0).toUpperCase();
                                                    const rColor   = avatarColors[(rName.charCodeAt(0) || 0) % avatarColors.length];
                                                    const rIsMe    = rName === (user?.name ?? "");
                                                    // Resolve photo: from API load OR from real-time event
                                                    const rPhoto   = msg.reply_sender_photo_url ?? null;
                                                    return (
                                                        <div style={{
                                                            display: "flex",
                                                            alignItems: "stretch",
                                                            background: isMe ? "rgba(255,255,255,0.14)" : "#f0f4ff",
                                                            borderLeft: `3.5px solid ${rColor}`,
                                                            borderRadius: "0 8px 8px 0",
                                                            marginBottom: 7,
                                                            overflow: "hidden",
                                                            cursor: "default",
                                                        }}>
                                                            {/* Sender Avatar — real photo or initial fallback */}
                                                            <div style={{
                                                                width: 44,
                                                                flexShrink: 0,
                                                                position: "relative",
                                                                overflow: "hidden",
                                                            }}>
                                                                {rPhoto ? (
                                                                    <img
                                                                        src={rPhoto}
                                                                        alt={rName}
                                                                        style={{
                                                                            width: "100%",
                                                                            height: "100%",
                                                                            objectFit: "cover",
                                                                            display: "block",
                                                                        }}
                                                                        onError={e => {
                                                                            // If image fails, swap to initial letter fallback
                                                                            e.target.style.display = "none";
                                                                            const fb = e.target.parentElement?.querySelector(".rply-av-fb");
                                                                            if (fb) fb.style.display = "flex";
                                                                        }}
                                                                    />
                                                                ) : null}
                                                                <div className="rply-av-fb" style={{
                                                                    position: rPhoto ? "absolute" : "relative",
                                                                    inset: 0,
                                                                    display: rPhoto ? "none" : "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    background: rColor,
                                                                    opacity: 0.92,
                                                                    width: "100%",
                                                                    height: "100%",
                                                                }}>
                                                                    <span style={{
                                                                        color: "#fff",
                                                                        fontWeight: 700,
                                                                        fontSize: 14,
                                                                        letterSpacing: 0.3,
                                                                        userSelect: "none",
                                                                    }}>{rInitial}</span>
                                                                </div>
                                                            </div>
                                                            {/* Text Content */}
                                                            <div style={{ padding: "5px 8px 5px 7px", minWidth: 0, flex: 1 }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                                                                    {/* Reply arrow icon */}
                                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                                                                        <path d="M9 14L4 9l5-5" stroke={rColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                                        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" stroke={rColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                                    </svg>
                                                                    <span style={{
                                                                        fontWeight: 700,
                                                                        fontSize: 11.5,
                                                                        color: rColor,
                                                                        whiteSpace: "nowrap",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                    }}>
                                                                        {rIsMe ? "You" : rName}
                                                                    </span>
                                                                </div>
                                                                <p style={{
                                                                    margin: 0,
                                                                    fontSize: 12,
                                                                    color: isMe ? "rgba(255,255,255,0.72)" : "#636e72",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    whiteSpace: "nowrap",
                                                                    lineHeight: 1.35,
                                                                }}>
                                                                    {msg.reply_message}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {msg.message}

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

                                            </div>

                                            {/* Timestamp + tick */}
                                            <span style={{ fontSize: 11, color: "#8696a0", marginTop: 3, padding: "0 4px", display: "flex", gap: 4, alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                                                {isEdited && (
                                                    <span style={{ color: "#b0b8c8", fontStyle: "italic" }}>edited</span>
                                                )}
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                {isMe && (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 2 }}>
                                                        {!msg.is_read ? (
                                                            /* Single Gray Tick for Sent/Delivered (since we don't have separate delivered status) */
                                                            <path d="M5 13l4 4L19 7" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                        ) : (
                                                            /* Double Blue Tick for Read */
                                                            <>
                                                                <path d="M2 13l4 4L16 7" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                                <path d="M8 13l4 4L22 7" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                            </>
                                                        )}
                                                    </svg>
                                                )}
                                            </span>

                                            {/* Dropdown Menu removed */}
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

                    {/* ── Attachment button + popup ───────────────────── */}
                    <div style={{ position: "relative", flexShrink: 0 }}>
                        {/* Hidden file inputs */}
                        <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" style={{ display: "none" }}
                            onChange={e => { if (e.target.files[0]) { alert(`Doc selected: ${e.target.files[0].name}\n(Upload handling coming soon)`); } setShowAttach(false); }} />
                        <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }}
                            onChange={e => { if (e.target.files[0]) { alert(`Photo selected: ${e.target.files[0].name}\n(Upload handling coming soon)`); } setShowAttach(false); }} />
                        <input ref={videoInputRef} type="file" accept="video/*" style={{ display: "none" }}
                            onChange={e => { if (e.target.files[0]) { alert(`Video selected: ${e.target.files[0].name}\n(Upload handling coming soon)`); } setShowAttach(false); }} />

                        {/* Backdrop */}
                        {showAttach && (
                            <div onClick={() => setShowAttach(false)}
                                style={{ position: "fixed", inset: 0, zIndex: 199, cursor: "default" }} />
                        )}

                        {/* Popup menu */}
                        {showAttach && (
                            <div style={{
                                position: "absolute",
                                bottom: "calc(100% + 10px)",
                                left: 0,
                                background: "#ffffff",
                                borderRadius: 14,
                                boxShadow: "0 6px 28px rgba(0,0,0,0.16)",
                                padding: "8px 0",
                                zIndex: 200,
                                minWidth: 175,
                                animation: "fadeIn 0.12s ease",
                            }}>
                                {/* Document */}
                                <button onClick={() => docInputRef.current?.click()}
                                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#3b4a54", fontSize: 14 }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f5f6f6"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <svg width="17" height="17" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                                            <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    Document
                                </button>

                                {/* Photo */}
                                <button onClick={() => photoInputRef.current?.click()}
                                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#3b4a54", fontSize: 14 }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f5f6f6"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <svg width="17" height="17" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <circle cx="8.5" cy="8.5" r="1.5" fill="white" stroke="none" />
                                            <polyline points="21 15 16 10 5 21" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    Photo
                                </button>

                                {/* Video */}
                                <button onClick={() => videoInputRef.current?.click()}
                                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", color: "#3b4a54", fontSize: 14 }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f5f6f6"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                    <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <svg width="17" height="17" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                            <polygon points="23 7 16 12 23 17 23 7" strokeLinecap="round" strokeLinejoin="round" />
                                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </span>
                                    Video
                                </button>
                            </div>
                        )}

                        {/* Attach trigger button */}
                        <button
                            onClick={() => setShowAttach(p => !p)}
                            title="Attach"
                            style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: showAttach ? "#e9edef" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="22" height="22" fill="none" stroke="#8696a0" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>

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
