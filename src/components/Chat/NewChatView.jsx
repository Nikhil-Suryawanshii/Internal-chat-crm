import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";

export default function NewChatView({ onThreadCreated, onCancel }) {
    const { user } = useAuth();
    const [searchQuery, setSearchQuery] = useState("");
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(null); // userId being created
    const [error, setError] = useState(null);
    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    // useCallback so useEffect deps are satisfied
    const loadUsers = useCallback(async (query) => {
        try {
            setLoading(true);
            setError(null);
            const res = await ChatService.getUsers(user.id, query);
            if (res.data.success) {
                setUsers(res.data.data);
            }
        } catch (err) {
            console.error("Error loading users:", err);
            setError("Failed to load users. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [user.id]);

    // Auto-focus + initial load
    useEffect(() => {
        searchRef.current?.focus();
        loadUsers("");
    }, [loadUsers]);

    // Debounced search on query change
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            loadUsers(searchQuery);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [searchQuery, loadUsers]);

    const handleSelectUser = async (selectedUser) => {
        if (creating) return;
        // Normalize: support both `id` and `user_id` from API
        const receiverId = selectedUser.id ?? selectedUser.user_id;
        try {
            setCreating(receiverId);
            setError(null);
            const res = await ChatService.createThread(user.id, receiverId);
            if (res.data.success) {
                // Laravel returns thread_id at top level: { success, thread_id, existing }
                const conversation = {
                thread_id:   res.data.thread_id,
                name:        selectedUser.name,
                surname:     selectedUser.surname ?? "",
                photo:       selectedUser.photo ?? null,
                user_status: selectedUser.active ?? "0", 
                last_message: null,
                unread_count: 0,
            };
                onThreadCreated(conversation);
            } else {
                setError(res.data.message || "Could not start conversation.");
            }
        } catch (err) {
            console.error("Error creating thread:", err);
            setError("Something went wrong. Please try again.");
        } finally {
            setCreating(null);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            {/* Search Input */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "#f0f4ff", borderRadius: 12, padding: "8px 12px",
                    border: "1.5px solid #dbeafe", transition: "border-color 0.2s"
                }}>
                    <svg width="15" height="15" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        ref={searchRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name or email..."
                        style={{
                            background: "transparent", border: "none", outline: "none",
                            fontSize: 13, color: "#374151", flex: 1
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}
                        >
                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div style={{
                    margin: "8px 12px 0", padding: "8px 12px", background: "#fef2f2",
                    border: "1px solid #fecaca", borderRadius: 8, flexShrink: 0
                }}>
                    <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>⚠️ {error}</p>
                </div>
            )}

            {/* User List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, padding: 40 }}>
                        <div style={{
                            width: 28, height: 28,
                            border: "3px solid #e5e7eb",
                            borderTop: "3px solid #2563eb",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite"
                        }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Searching users...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 20px" }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                        <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 500, margin: 0 }}>
                            {searchQuery ? `No users found for "${searchQuery}"` : "No users available"}
                        </p>
                        <p style={{ color: "#d1d5db", fontSize: 12, marginTop: 4 }}>Try a different name or email</p>
                    </div>
                ) : (
                    <>
                        <p style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, padding: "10px 16px 4px", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {searchQuery ? `Results for "${searchQuery}"` : "All Users"} · {users.length}
                        </p>
                        {users.map((u, index) => {
                            // Support both `id` and `user_id` field names from Laravel
                            const userId = u.id ?? u.user_id ?? index;
                            const isCreating = creating === userId;
                            const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
                            const color = avatarColors[(u.name?.charCodeAt(0) || 0) % avatarColors.length];

                            return (
                                <button
                                    key={userId}
                                    onClick={() => handleSelectUser({ ...u, id: userId })}
                                    // inject normalized id so handleSelectUser always gets u.id
                                    disabled={!!creating}
                                    style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                                        padding: "11px 16px", background: "none", border: "none",
                                        borderBottom: "1px solid #f9fafb", cursor: creating ? "not-allowed" : "pointer",
                                        textAlign: "left", opacity: creating && !isCreating ? 0.5 : 1,
                                        transition: "background 0.15s"
                                    }}
                                    onMouseEnter={e => { if (!creating) e.currentTarget.style.background = "#f9fafb"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                                >
                                    {/* Avatar */}
                                    <div style={{ position: "relative", flexShrink: 0 }}>
                                        {u.photo ? (
                                            <img
                                                src={`http://localhost/mokapen/public/uploads/users/${u.photo}`}
                                                alt={u.name}
                                                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                                                onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                                            />
                                        ) : null}
                                        <div style={{
                                            width: 44, height: 44, borderRadius: "50%",
                                            background: color,
                                            display: u.photo ? "none" : "flex",
                                            alignItems: "center", justifyContent: "center",
                                            color: "white", fontSize: 16, fontWeight: 600
                                        }}>
                                            {u.name?.charAt(0).toUpperCase() ?? "?"}
                                        </div>
                                       {(u.active === "1" || u.active === 1) && (
                                            <span style={{
                                                position: "absolute", bottom: 1, right: 1,
                                                width: 10, height: 10, background: "#22c55e",
                                                border: "2px solid white", borderRadius: "50%"
                                            }} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 500, color: "#111827", margin: 0, marginBottom: 2 }}>
                                            {u.name} {u.surname ?? ""}
                                        </p>
                                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {u.email ?? (u.user_status === "1" ? "🟢 Online" : "⚫ Offline")}
                                        </p>
                                    </div>

                                    {/* Action */}
                                    {isCreating ? (
                                        <div style={{
                                            width: 32, height: 32, borderRadius: "50%",
                                            border: "2.5px solid #e5e7eb", borderTop: "2.5px solid #2563eb",
                                            animation: "spin 0.8s linear infinite", flexShrink: 0
                                        }} />
                                    ) : (
                                        <div style={{
                                            width: 32, height: 32, borderRadius: "50%",
                                            background: "#eff6ff", display: "flex",
                                            alignItems: "center", justifyContent: "center", flexShrink: 0
                                        }}>
                                            <svg width="15" height="15" fill="none" stroke="#2563eb" strokeWidth="2" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}
