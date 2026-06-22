import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";

export default function NewGroupView({ onGroupCreated, onCancel }) {
    const { user }                        = useAuth();
    const [groupName, setGroupName]       = useState("");
    const [users, setUsers]               = useState([]);
    const [selected, setSelected]         = useState([]);   // [{ id: string, name, surname, photo }]
    const [loading, setLoading]           = useState(false);
    const [creating, setCreating]         = useState(false);
    const [error, setError]               = useState(null);
    const [search, setSearch]             = useState("");
    const createInFlightRef               = useRef(false);

    useEffect(() => {
        loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadUsers = async (query = "") => {
        try {
            setLoading(true);
            const res = await ChatService.getUsers(user.id, query, user.org_id);
            if (res.data.success) setUsers(res.data.data);
        } catch (err) {
            setError("Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    // ── Normalize every ID to a string so === always works ──
    const getId = (u) => String(u.user_id ?? u.id);

    const isSelected = (u) => selected.some(s => s.id === getId(u));

    const toggleUser = (u) => {
        const id = getId(u);
        setSelected(prev =>
            prev.some(s => s.id === id)
                ? prev.filter(s => s.id !== id)           // deselect
                : [...prev, {                              // select
                    id,
                    name:    u.name,
                    surname: u.surname,
                    photo:   u.photo,
                }]
        );
    };

    const removeMember = (id) => {
        setSelected(prev => prev.filter(s => s.id !== String(id)));
    };

    const handleCreate = async () => {
        if (createInFlightRef.current) return;

        if (!groupName.trim()) {
            setError("Please enter a group name");
            return;
        }
        if (selected.length < 1) {
            setError("Please select at least 1 member");
            return;
        }

        try {
            createInFlightRef.current = true;
            setCreating(true);
            setError(null);

            const memberIds = [...new Set([
                String(user.id),
                ...selected.map(s => String(s.id)),
            ])];

            const res = await ChatService.createGroup(
                user.id,
                groupName.trim(),
                memberIds,
                user.org_id
            );

            if (res.data.success) {
                const threadId = res.data.thread_id ?? res.data.data?.thread_id;
                const createdMembers = res.data.members ?? selected;
                onGroupCreated({
                    thread_id:          threadId,
                    title:              groupName.trim(),
                    name:               groupName.trim(),
                    source_type:        "group",
                    type:               "group",
                    thread_type:        "group",
                    is_group:           1,
                    group_name:         groupName.trim(),
                    created_by_name:    user?.name ?? null,
                    unread_count:       0,
                    last_message:       null,
                    members:            createdMembers,
                    other_user_name:    null,
                    other_user_surname: null,
                    other_user_id:      null,
                    photo:              null,
                    photo_url:          null,
                    other_user_photo_url: null,
                });
            } else {
                setError(res.data.message || "Failed to create group");
            }
        } catch (err) {
            const serverMessage =
                err?.response?.data?.message ||
                (err?.response?.data?.errors
                    ? Object.values(err.response.data.errors).flat().join(" ")
                    : "");
            setError(serverMessage || "Failed to create group. Please try again.");
        } finally {
            createInFlightRef.current = false;
            setCreating(false);
        }
    };

    const filtered = users.filter(u =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.surname?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase())
    );

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

    const canCreate = !creating && groupName.trim().length > 0 && selected.length >= 1;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

            {/* ── Group Name ── */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                <input
                    type="text"
                    value={groupName}
                    onChange={e => { setGroupName(e.target.value); setError(null); }}
                    placeholder="Enter group name..."
                    style={{
                        width: "100%", padding: "10px 14px",
                        border: "1.5px solid #dbeafe", borderRadius: 12,
                        fontSize: 14, outline: "none", color: "#111827",
                        background: "#f0f4ff", boxSizing: "border-box"
                    }}
                />
            </div>

            {/* ── Selected member pills ── */}
            {selected.length > 0 && (
                <div style={{
                    padding: "8px 16px", borderBottom: "1px solid #f3f4f6",
                    display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0,
                    maxHeight: 80, overflowY: "auto"
                }}>
                    {selected.map(s => (
                        <span key={s.id} style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "#eff6ff", color: "#2563eb",
                            padding: "4px 10px", borderRadius: 20,
                            fontSize: 12, fontWeight: 500
                        }}>
                            {s.name} {s.surname}
                            <button
                                onClick={() => removeMember(s.id)}
                                title={`Remove ${s.name}`}
                                style={{
                                    background: "none", border: "none",
                                    cursor: "pointer", color: "#2563eb",
                                    padding: 0, display: "flex",
                                    alignItems: "center", marginLeft: 2
                                }}
                            >
                                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* ── Search ── */}
            <div style={{ padding: "8px 12px", flexShrink: 0 }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "#f9fafb", borderRadius: 12, padding: "8px 12px"
                }}>
                    <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search members..."
                        style={{
                            background: "transparent", border: "none",
                            outline: "none", fontSize: 13, color: "#374151", flex: 1
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch("")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div style={{ margin: "0 12px 8px", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>⚠️ {error}</p>
                </div>
            )}

            {/* ── User list ── */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                        <div style={{ width: 28, height: 28, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                        <p style={{ color: "#9ca3af", fontSize: 13 }}>
                            {search ? `No users found for "${search}"` : "No users available"}
                        </p>
                    </div>
                ) : (
                    filtered.map(u => {
                        const userId  = getId(u);
                        const color   = avatarColors[(u.name?.charCodeAt(0) || 0) % avatarColors.length];
                        const checked = isSelected(u);

                        const avatarUrl = u.photo_url
                            ?? (u.photo
                                ? (u.photo.startsWith("http")
                                    ? u.photo
                                    : `http://localhost/mokapen/public/uploads/users/${userId}/images/${u.photo}`)
                                : null);

                        return (
                            <button
                                key={userId}
                                onClick={() => toggleUser(u)}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                                    padding: "10px 16px",
                                    background: checked ? "#eff6ff" : "transparent",
                                    border: "none", borderBottom: "1px solid #f9fafb",
                                    cursor: "pointer", textAlign: "left",
                                    transition: "background 0.15s"
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = checked ? "#dbeafe" : "#f9fafb"}
                                onMouseLeave={e => e.currentTarget.style.background = checked ? "#eff6ff" : "transparent"}
                            >
                                {/* Avatar */}
                                <div style={{ position: "relative", flexShrink: 0 }}>
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt={u.name}
                                            style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", display: "block" }}
                                            onError={e => {
                                                e.target.style.display = "none";
                                                const fallback = e.target.parentElement?.querySelector(".av-fallback");
                                                if (fallback) fallback.style.display = "flex";
                                            }}
                                        />
                                    ) : null}
                                    <div className="av-fallback" style={{
                                        width: 40, height: 40, borderRadius: "50%",
                                        background: color,
                                        display: avatarUrl ? "none" : "flex",
                                        alignItems: "center", justifyContent: "center",
                                        color: "white", fontSize: 15, fontWeight: 600
                                    }}>
                                        {u.name?.charAt(0).toUpperCase() ?? "?"}
                                    </div>
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                    <p style={{ fontSize: 14, fontWeight: 500, color: "#111827", margin: 0 }}>
                                        {u.name} {u.surname ?? ""}
                                    </p>
                                    <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>{u.email}</p>
                                </div>

                                {/* Checkbox */}
                                <div style={{
                                    width: 22, height: 22, borderRadius: "50%",
                                    border: checked ? "none" : "2px solid #d1d5db",
                                    background: checked ? "#2563eb" : "transparent",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0, transition: "all 0.15s"
                                }}>
                                    {checked && (
                                        <svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            {/* ── Create button ── */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
                <button
                    onClick={handleCreate}
                    disabled={!canCreate}
                    style={{
                        width: "100%", padding: "12px",
                        border: "none", borderRadius: 12,
                        cursor: canCreate ? "pointer" : "not-allowed",
                        background: canCreate
                            ? "linear-gradient(135deg, #0066FF, #0044CC)"
                            : "#e5e7eb",
                        color: canCreate ? "white" : "#9ca3af",
                        fontSize: 14, fontWeight: 600,
                        transition: "all 0.2s"
                    }}
                >
                    {creating
                        ? "Creating..."
                        : selected.length > 0
                            ? `Create Group (${selected.length + 1} members)`
                            : "Create Group"}
                </button>
            </div>
        </div>
    );
}
