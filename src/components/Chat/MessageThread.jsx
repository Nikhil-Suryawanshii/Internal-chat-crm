import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import ChatService from "../../services/chatService";
import { getEcho } from "../../config/echo";
import { getAvatarUrl } from "../../config/urls";

export default function MessageThread({ conversation, onMarkRead, onConversationUpdate, onGroupDeleted }) {
    const { user } = useAuth();
    const { t } = useTranslation();
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
    const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);
    const [menuOpenUpward, setMenuOpenUpward] = useState(true);
    const [reactions, setReactions] = useState({});
    const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState(null);
    // [PIN/ATTACH — skipped per client request]
    // const [showAttach, setShowAttach] = useState(false);

    // const docInputRef = useRef(null);
    // const photoInputRef = useRef(null);
    // const videoInputRef = useRef(null);

    // Key fix: ref the SCROLL CONTAINER, not a bottom sentinel
    const scrollContainerRef = useRef(null);
    const typingTimerRef = useRef(null);
    const inputRef = useRef(null);
    const isInitialLoad = useRef(true);
    const recognitionRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const inputBarRef = useRef(null);
    const isRecordingRef = useRef(false);  // ref so onend closure always sees latest value
    const waveContainerRef = useRef(null);
    const speakingTimerRef = useRef(null);
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
            // Filter by organization: ignore messages belonging to a different org
            if (data.org_id && String(data.org_id) !== String(user.org_id)) return;

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
                    }).catch(() => { });
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
        setConfirmDeleteMsgId(messageId);
    };

    const confirmDelete = async () => {
        const messageId = confirmDeleteMsgId;
        setConfirmDeleteMsgId(null);
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

    const scrollToMessage = (msgId) => {
        const el = document.getElementById(`chat-msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('chat_msg-highlight');
            setTimeout(() => el.classList.remove('chat_msg-highlight'), 2000);
        }
    };

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
            recognition.lang = window.navigator.language || "en-US";
            recognition.continuous = true;      // keep listening
            recognition.interimResults = true;  // enable interim to track active speech

            recognition.onresult = (e) => {
                // Activate wave animation while receiving results
                if (waveContainerRef.current) waveContainerRef.current.classList.add('active');
                clearTimeout(speakingTimerRef.current);
                speakingTimerRef.current = setTimeout(() => {
                    if (waveContainerRef.current) waveContainerRef.current.classList.remove('active');
                }, 600); // Stop wave if no voice for 600ms

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

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
    const getColor = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

    const BRAND_PRIMARY = "#006ede";
    const BRAND_CYAN = "#01ddff";
    const BRAND_GRADIENT = "rgb(71, 168, 224)";
    const THREAD_BG = "#efeae2";

    // Group messages by date
    const groupedMessages = [];
    let lastDateStr = null;
    messages.forEach(msg => {
        const d = new Date(msg.created_at);
        const now = new Date();
        let dateStr;
        if (d.toDateString() === now.toDateString()) {
            dateStr = t("today", "Today");
        } else {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            dateStr = d.toDateString() === yesterday.toDateString()
                ? t("yesterday", "Yesterday")
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
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontSize: 14,
        }}>
            <style>{`
                @keyframes spin   { to { transform: rotate(360deg); } }
                @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
                @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
                @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
                @keyframes chat_wave {
                    0%, 100% { height: 4px; }
                    50% { height: 16px; }
                }
                .chat_wave-bar {
                    width: 3px;
                    background: #aebac1;
                    border-radius: 2px;
                    height: 4px;
                    transition: height 0.2s;
                }
                .chat_wave-container.active .chat_wave-bar {
                    animation: chat_wave 1.2s ease-in-out infinite;
                }
                .chat_msg-row { animation: fadeIn 0.18s ease; transition: background-color 0.5s ease; }
                @keyframes highlightPulse {
                    0% { background-color: rgba(0, 168, 132, 0.25); }
                    100% { background-color: transparent; }
                }
                .chat_msg-highlight { animation: highlightPulse 2s ease-out; border-radius: 8px; }
                .chat_chevron-btn { opacity: 1; transition: background 0.15s; }
                .chat_chevron-btn:hover { background: rgba(0,0,0,0.18) !important; }
                .chat_reaction-emoji-btn { transition: transform 0.1s ease; }
                .chat_reaction-emoji-btn:hover { transform: scale(1.22); }
                .chat_menu-item {
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
                .chat_menu-item:hover {
                    background: #f5f6f6;
                }
                .chat_thread-scroll::-webkit-scrollbar { width: 5px; }
                .chat_thread-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
            `}</style>

            {/* ── SCROLL CONTAINER ── */}
            <div
                ref={scrollContainerRef}
                className="chat_thread-scroll"
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
                        <p style={{ color: "#8696a0", fontSize: 13, margin: 0 }}>{t("loading_messages", "Loading messages...")}</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 36 }}>👋</div>
                        <p style={{ color: "#8696a0", fontSize: 14, margin: 0 }}>{t("no_messages_yet", "No messages yet. Say hello!")}</p>
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
                            let systemMsg = msg.message;
                            if (systemMsg && systemMsg.startsWith("Group created by ")) {
                                const creator = systemMsg.replace("Group created by ", "");
                                systemMsg = `${t("group", "Group")} ${t("created_by", "created by")} ${creator}`;
                            }
                            return (
                                <div key={msg.message_id} style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                                    <span style={{ background: "#f0f2f5", color: "#54656f", fontSize: 12, padding: "5px 12px", borderRadius: 8, textAlign: "center", boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}>
                                        {systemMsg}
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
                            <div key={msg.message_id} id={`chat-msg-${msg.message_id}`} className="chat_msg-row"
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
                                                        const fb = e.target.parentElement?.querySelector(".chat_av-fallback");
                                                        if (fb) fb.style.display = "flex";
                                                    }}
                                                />
                                            )}
                                            <div className="chat_av-fallback" style={{
                                                position: avatarUrl ? "absolute" : "relative",
                                                inset: 0,
                                                width: 30, height: 30,
                                                borderRadius: "50%",
                                                background: "#95cef0",
                                                display: avatarUrl ? "none" : "flex",
                                                alignItems: "center", justifyContent: "center",
                                                color: "#ffffff", fontSize: 13, fontWeight: 600,
                                            }}>
                                                {senderName?.charAt(0)?.toUpperCase() ?? "?"}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", maxWidth: "68%" }}>
                                    {/* Bubble + chevron side by side */}
                                    {!isDeleted && (
                                        <div style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-start", gap: 1 }}>

                                            {/* ── Bubble container ── */}
                                            <div
                                                className="chat_msg-bubble-container"
                                                style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}
                                            >
                                                {/* Bubble */}
                                                <div style={{
                                                    position: "relative",
                                                    padding: "7px 12px",
                                                    borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                                    background: isMe ? "#47a8e0" : "#ffffff",
                                                    color: isMe ? "white" : "#111b21",
                                                    fontSize: 14.5,
                                                    lineHeight: 1.5,
                                                    boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                                    width: "fit-content",
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
                                                        const rName = msg.reply_sender_name ?? "User";
                                                        const rInitial = rName.charAt(0).toUpperCase();
                                                        const rColor = avatarColors[(rName.charCodeAt(0) || 0) % avatarColors.length];
                                                        const rIsMe = rName === (user?.name ?? "");
                                                        // Resolve photo: from API load OR from real-time event
                                                        const rPhoto = msg.reply_sender_photo_url ?? null;
                                                        return (
                                                            <div
                                                                onClick={() => scrollToMessage(msg.reply_to_id)}
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "stretch",
                                                                    background: isMe ? "rgba(255,255,255,0.14)" : "#f0f4ff",
                                                                    borderLeft: `3.5px solid ${rColor}`,
                                                                    borderRadius: "0 8px 8px 0",
                                                                    marginBottom: 7,
                                                                    overflow: "hidden",
                                                                    cursor: "pointer",
                                                                }}
                                                            >
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
                                                                                const fb = e.target.parentElement?.querySelector(".chat_rply-av-fb");
                                                                                if (fb) fb.style.display = "flex";
                                                                            }}
                                                                        />
                                                                    ) : null}
                                                                    <div className="chat_rply-av-fb" style={{
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
                                                                            <path d="M9 14L4 9l5-5" stroke={rColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" stroke={rColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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

                                                    {/* ── Chevron (▼) & Reaction — inline after message ── */}
                                                    <div style={{ display: "inline-block", position: "relative", marginLeft: 8, verticalAlign: "middle" }}>

                                                        <button
                                                            className="chat_chevron-btn"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const containerRect = scrollContainerRef.current?.getBoundingClientRect();
                                                                const spaceBelow = containerRect ? (containerRect.bottom - rect.bottom) : (window.innerHeight - rect.bottom);
                                                                setMenuOpenUpward(spaceBelow < 160);
                                                                setActiveMenuMsgId(prev =>
                                                                    prev === msg.message_id ? null : msg.message_id
                                                                );
                                                            }}
                                                            style={{
                                                                width: 22,
                                                                height: 22,
                                                                borderRadius: 6,
                                                                background: "transparent",
                                                                border: "none",
                                                                cursor: "pointer",
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                padding: 0,
                                                            }}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isMe ? "#ffffff" : "#54656f"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="6 9 12 15 18 9"></polyline>
                                                            </svg>
                                                        </button>

                                                        {/* Backdrop */}
                                                        {(activeMenuMsgId === msg.message_id || activeReactionMsgId === msg.message_id) && (
                                                            <div
                                                                onClick={(e) => { e.stopPropagation(); setActiveMenuMsgId(null); setActiveReactionMsgId(null); }}
                                                                style={{ position: "fixed", inset: 0, zIndex: 299 }}
                                                            />
                                                        )}

                                                        {/* Combined Container for Pill & Menu */}
                                                        {(activeMenuMsgId === msg.message_id || activeReactionMsgId === msg.message_id) && (
                                                            <div
                                                                style={{
                                                                    position: "absolute",
                                                                    ...(menuOpenUpward ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
                                                                    [isMe ? "right" : "left"]: 0,
                                                                    zIndex: 300,
                                                                    display: "flex",
                                                                    flexDirection: "column",
                                                                    gap: 6,
                                                                    alignItems: isMe ? "flex-end" : "flex-start",
                                                                }}
                                                            >
                                                                {/* Reaction Dropdown Pill */}
                                                                <div
                                                                    onClick={e => e.stopPropagation()}
                                                                    style={{
                                                                        background: "#ffffff",
                                                                        borderRadius: 30,
                                                                        boxShadow: "0 2px 5px 0 rgba(11,20,26,.26), 0 2px 10px 0 rgba(11,20,26,.16)",
                                                                        padding: "6px 12px",
                                                                        display: "flex",
                                                                        gap: 8,
                                                                        alignItems: "center",
                                                                        animation: "fadeIn 0.12s ease"
                                                                    }}
                                                                >
                                                                    {["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => (
                                                                        <button
                                                                            key={emoji}
                                                                            className="chat_reaction-emoji-btn"
                                                                            onClick={() => {
                                                                                handleReact(msg.message_id, emoji);
                                                                                setActiveReactionMsgId(null);
                                                                            }}
                                                                            style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", padding: 0 }}
                                                                        >
                                                                            {emoji}
                                                                        </button>
                                                                    ))}
                                                                </div>

                                                                {/* Menu Dropdown */}
                                                                {activeMenuMsgId === msg.message_id && (
                                                                    <div
                                                                        onClick={e => e.stopPropagation()}
                                                                        style={{
                                                                            background: "#ffffff",
                                                                            borderRadius: 4,
                                                                            boxShadow: "0 2px 5px 0 rgba(11,20,26,.26), 0 2px 10px 0 rgba(11,20,26,.16)",
                                                                            minWidth: 160,
                                                                            padding: "8px 0",
                                                                            animation: "fadeIn 0.12s ease",
                                                                        }}
                                                                    >
                                                                        {[
                                                                            ...(isMe ? [{ icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>, label: "Edit message", action: () => { startEdit(msg); setActiveMenuMsgId(null); } }] : []),
                                                                            { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" strokeLinecap="round" strokeLinejoin="round" /></svg>, label: "Reply", action: () => { startReply(msg); setActiveMenuMsgId(null); } },
                                                                            { icon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" strokeLinejoin="round" /></svg>, label: "Copy", action: () => { navigator.clipboard?.writeText(msg.message || ""); setActiveMenuMsgId(null); } },
                                                                            ...(isMe ? [{ icon: <svg width="15" height="15" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" /><path d="M10 11v6M14 11v6" strokeLinecap="round" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" /></svg>, label: "Delete message", color: "#ef4444", action: () => { handleDelete(msg.message_id); setActiveMenuMsgId(null); } }] : [])
                                                                        ].map(({ icon, label, action, color }) => (
                                                                            <button
                                                                                key={label}
                                                                                className="chat_menu-item"
                                                                                onClick={action}
                                                                                style={{ color: color || "#3b4a54" }}
                                                                                onMouseEnter={e => e.currentTarget.style.background = "#f5f6f6"}
                                                                                onMouseLeave={e => e.currentTarget.style.background = "none"}
                                                                            >
                                                                                <span style={{ color: color || "#54656f", flexShrink: 0 }}>{icon}</span>
                                                                                {label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

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
                                            </div>{/* ── end bubble container ── */}



                                        </div>
                                    )}

                                    {/* Deleted bubble */}
                                    {isDeleted && (
                                        <>
                                            <div style={{
                                                position: "relative",
                                                padding: "7px 12px",
                                                borderRadius: isMe ? "12px 0 12px 12px" : "0 12px 12px 12px",
                                                background: "rgba(255,255,255,0.6)",
                                                color: "#8696a0",
                                                fontSize: 13.5,
                                                lineHeight: 1.5,
                                                fontStyle: "italic",
                                                boxShadow: "0 1px 2px rgba(0,0,0,0.13)",
                                                minWidth: 60,
                                                wordBreak: "break-word",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                            }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                                </svg>
                                                {t("this_message_was_deleted", "This message was deleted")}
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

            {/* ── Inline Delete Confirmation Toast ── */}
            {confirmDeleteMsgId && (
                <div style={{
                    flexShrink: 0,
                    margin: "0 12px 4px",
                    background: "#ffffff",
                    borderRadius: 12,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                    border: "1px solid #fee2e2",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    animation: "fadeIn 0.18s ease",
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
                            {t("delete_message", "Delete message")}?
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8696a0" }}>
                            {t("delete_message_confirm", "This cannot be undone.")}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                            onClick={() => setConfirmDeleteMsgId(null)}
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
                            onClick={confirmDelete}
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

            {/* Reply bar */}
            {replyTo && (
                <div style={{ padding: "8px 14px", background: "#f0f2f5", borderTop: "1px solid #e9edef", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                    <div style={{ borderLeft: `3px solid ${BRAND_CYAN}`, paddingLeft: 8 }}>
                        <p style={{ margin: 0, fontSize: 12, color: BRAND_PRIMARY, fontWeight: 600 }}>
                            {t("replying_to")} {replyTo.sender_name ?? t("message")}
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
                    <p style={{ margin: 0, fontSize: 12, color: "#92400e", fontWeight: 600 }}>✏️ {t("editing_message")}</p>
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

                    {/* Attachment/pin button — commented out per client request */}

                    {isRecording ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#ffffff", borderRadius: 20, height: 42, padding: "0 6px 0 16px", gap: 12, animation: "fadeIn 0.2s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                            <div ref={waveContainerRef} className="chat_wave-container" style={{ flex: 1, display: "flex", gap: 4, alignItems: "center", height: 20, overflow: "hidden" }}>
                                {[...Array(57)].map((_, i) => (
                                    <div key={i} className="chat_wave-bar" style={{ animationDelay: `${Math.random() * 0.8}s` }} />
                                ))}
                            </div>
                            <button
                                onClick={toggleVoice}
                                title={t("stop_recording")}
                                style={{ width: 32, height: 32, borderRadius: "50%", background: "transparent", border: "2px solid #8696a0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                            >
                                <div style={{ width: 10, height: 10, background: "#8696a0", borderRadius: 2 }} />
                            </button>
                            <button
                                onClick={toggleVoice}
                                title={t("done")}
                                style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                            >
                                <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, background: "#ffffff", borderRadius: 20, display: "flex", alignItems: "center", padding: "0 14px", height: 42, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
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
                                    placeholder={editingMsg ? t("edit_message_placeholder") : t("type_a_message")}
                                    style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontSize: 14, color: "#3b4a54", lineHeight: 1.4, height: 24, padding: 0, fontFamily: "system-ui, -apple-system, sans-serif", overflowY: "auto" }}
                                />
                            </div>

                            <button
                                onClick={editingMsg ? handleEditSave : (input.trim() ? send : toggleVoice)}
                                disabled={editingMsg ? !editText.trim() : (input.trim() && sending)}
                                title={input.trim() ? t("send") : t("voice_message")}
                                style={{
                                    width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0, paddingLeft: 9,
                                    cursor: "pointer",
                                    background: editingMsg ? (editText.trim() ? "linear-gradient(135deg,#f59e0b,#d97706)" : "#aebac1")
                                        : (input.trim() && !sending ? BRAND_GRADIENT : "#aebac1"),
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
                                    <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24" style={{ transform: "rotate(90deg)", display: "block", margin: "auto" }}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
