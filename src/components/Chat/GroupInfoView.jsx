import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import { getAvatarUrl } from "../../config/urls";

// Shows group members, lets the admin rename the group, add/remove members,
// or delete the group entirely. Non-admins get a read-only view (just the
// member list) plus the option to leave is intentionally NOT included here
// since there's no "leave group" API yet — only admin actions.
export default function GroupInfoView({ conversation, onCancel, onGroupUpdated, onGroupDeleted, isOnline }) {
    const { user } = useAuth();

    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [renaming, setRenaming] = useState(false);
    const [groupName, setGroupName] = useState(conversation?.title || conversation?.name || conversation?.group_name || "");
    const [savingName, setSavingName] = useState(false);

    const [showAddPanel, setShowAddPanel] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [addSearch, setAddSearch] = useState("");
    const [addingId, setAddingId] = useState(null);
    const [removingId, setRemovingId] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const threadId = conversation?.thread_id;

    const loadMembers = useCallback(async () => {
        if (!threadId) return;
        try {
            setLoading(true);
            const res = await ChatService.getGroupMembers(threadId);
            if (res.data.success) setMembers(res.data.data || []);
        } catch (err) {
            setError("Failed to load group members");
        } finally {
            setLoading(false);
        }
    }, [threadId]);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    // Am I an admin of this group?
    const myMembership = members.find(m => String(m.user_id) === String(user.id));
    const isAdmin = myMembership ? Boolean(Number(myMembership.is_admin)) : false;

    // ── Rename group ─────────────────────────────────────────
    const handleSaveName = async () => {
        if (!groupName.trim()) return;
        try {
            setSavingName(true);
            setError(null);
            await ChatService.updateGroup(threadId, user.id, groupName.trim());
            setRenaming(false);
            if (onGroupUpdated) onGroupUpdated({ title: groupName.trim(), name: groupName.trim(), group_name: groupName.trim() });
        } catch (err) {
            setError(err?.response?.data?.message || "Failed to rename group");
        } finally {
            setSavingName(false);
        }
    };

    // ── Load users to add ───────────────────────────────────
    const openAddPanel = async () => {
        setShowAddPanel(true);
        try {
            const res = await ChatService.getUsers(user.id, "", user.org_id);
            if (res.data.success) setAllUsers(res.data.data || []);
        } catch (err) {
            setError("Failed to load users");
        }
    };

    const memberIdSet = new Set(members.map(m => String(m.user_id)));
    const addableUsers = allUsers.filter(u =>
        !memberIdSet.has(String(u.user_id)) &&
        (u.name?.toLowerCase().includes(addSearch.toLowerCase()) ||
            u.surname?.toLowerCase().includes(addSearch.toLowerCase()) ||
            u.email?.toLowerCase().includes(addSearch.toLowerCase()))
    );

    const handleAddMember = async (memberId) => {
        try {
            setAddingId(memberId);
            setError(null);
            await ChatService.addGroupMember(threadId, user.id, memberId);
            await loadMembers();
            setAllUsers(prev => prev.filter(u => String(u.user_id) !== String(memberId)));
        } catch (err) {
            setError(err?.response?.data?.message || "Failed to add member");
        } finally {
            setAddingId(null);
        }
    };

    const handleRemoveMember = async (memberId, memberName) => {
        if (!window.confirm(`Remove ${memberName} from the group?`)) return;
        try {
            setRemovingId(memberId);
            setError(null);
            await ChatService.removeGroupMember(threadId, user.id, memberId);
            await loadMembers();
        } catch (err) {
            setError(err?.response?.data?.message || "Failed to remove member");
        } finally {
            setRemovingId(null);
        }
    };

    const handleDeleteGroup = async () => {
        if (!window.confirm("Delete this group for everyone? This cannot be undone.")) return;
        try {
            setDeleting(true);
            setError(null);
            await ChatService.deleteGroup(threadId, user.id);
            if (onGroupDeleted) onGroupDeleted(threadId);
        } catch (err) {
            setError(err?.response?.data?.message || "Failed to delete group");
            setDeleting(false);
        }
    };

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const getColor = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, height: "100%", overflow: "hidden", background: "#f0f2f5" }}>
            {/* ── Group name / rename header ── */}
            <div style={{
                padding: "20px 16px 16px",
                background: "#ffffff",
                display: "flex", flexDirection: "column", alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                zIndex: 10,
                flexShrink: 0
            }}>
                <div style={{
                    width: 64, height: 64, borderRadius: "50%", margin: "0 auto 12px",
                    background: `hsl(${((groupName.charCodeAt(0) || 0) * 37) % 360}, 65%, 55%)`,
                    color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, fontWeight: 600,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.12)"
                }}>
                    {groupName.charAt(0).toUpperCase() || "G"}
                </div>

                {renaming ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", maxWidth: 320 }}>
                        <input
                            autoFocus
                            type="text"
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSaveName()}
                            style={{
                                flex: 1, padding: "10px 14px", border: "1px solid #d1d5db",
                                borderRadius: 8, fontSize: 15, outline: "none", color: "#111827",
                                transition: "border-color 0.2s"
                            }}
                            onFocus={e => e.target.style.borderColor = "#2563eb"}
                            onBlur={e => e.target.style.borderColor = "#d1d5db"}
                        />
                        <button onClick={handleSaveName} disabled={savingName}
                            style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "white", padding: "10px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background 0.2s" }}
                            onMouseEnter={e => e.target.style.background = "#1d4ed8"}
                            onMouseLeave={e => e.target.style.background = "#2563eb"}
                        >
                            {savingName ? "..." : "Save"}
                        </button>
                        <button onClick={() => { setRenaming(false); setGroupName(conversation?.title || conversation?.name || ""); }}
                            style={{ background: "#f3f4f6", border: "none", borderRadius: 8, color: "#4b5563", padding: "10px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background 0.2s" }}
                            onMouseEnter={e => e.target.style.background = "#e5e7eb"}
                            onMouseLeave={e => e.target.style.background = "#f3f4f6"}
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#111827" }}>{groupName}</h2>
                            {isAdmin && (
                                <button onClick={() => setRenaming(true)} title="Rename group"
                                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", padding: 4, borderRadius: "50%", transition: "all 0.2s", marginTop: 2 }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "#f3f4f6"; e.currentTarget.style.color = "#111827"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9ca3af"; }}
                                >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" /></svg>
                                </button>
                            )}
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280", fontWeight: 500 }}>
                            Group · {members.length} member{members.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

                {/* ── Error ── */}
                {error && (
                    <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12 }}>
                        <p style={{ fontSize: 13, color: "#dc2626", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            {error}
                        </p>
                    </div>
                )}

                {/* ── Members Card ── */}
                <div style={{ background: "#ffffff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Members</span>
                        {isAdmin && !showAddPanel && (
                            <button onClick={openAddPanel}
                                style={{ background: "#eff6ff", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 16, transition: "background 0.2s" }}
                                onMouseEnter={e => e.target.style.background = "#dbeafe"}
                                onMouseLeave={e => e.target.style.background = "#eff6ff"}
                            >
                                + Add Member
                            </button>
                        )}
                    </div>

                    {/* ── Add member panel ── */}
                    {isAdmin && showAddPanel && (
                        <div style={{ background: "#f8fafc", borderBottom: "1px solid #f3f4f6" }}>
                            <div style={{ padding: "16px 20px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 14px", transition: "border-color 0.2s" }}>
                                    <svg width="18" height="18" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={addSearch}
                                        onChange={e => setAddSearch(e.target.value)}
                                        placeholder="Search people to add..."
                                        style={{ border: "none", background: "transparent", outline: "none", flex: 1, fontSize: 14, color: "#0f172a" }}
                                    />
                                    <button onClick={() => setShowAddPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex", padding: 2 }} title="Close">
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                                {addableUsers.length === 0 ? (
                                    <p style={{ fontSize: 14, color: "#9ca3af", textAlign: "center", padding: "20px 0", margin: 0 }}>No users found</p>
                                ) : (
                                    addableUsers.map(u => {
                                        const addUserId = u.user_id ?? u.id;
                                        const addAvatarUrl = u.photo_url
                                            ?? getAvatarUrl(u.photo, addUserId);
                                        return (
                                            <div key={addUserId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid #f1f5f9" }}>
                                                <div style={{ position: "relative", flexShrink: 0 }}>
                                                    {addAvatarUrl ? (
                                                        <img
                                                            src={addAvatarUrl}
                                                            alt={u.name}
                                                            style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", display: "block" }}
                                                            onError={e => {
                                                                e.target.style.display = "none";
                                                                const fb = e.target.parentElement?.querySelector(".chat_av-fallback");
                                                                if (fb) fb.style.display = "flex";
                                                            }}
                                                        />
                                                    ) : null}
                                                    <div className="chat_av-fallback" style={{
                                                        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                                                        background: getColor(u.name),
                                                        display: addAvatarUrl ? "none" : "flex",
                                                        alignItems: "center", justifyContent: "center",
                                                        color: "white", fontSize: 12, fontWeight: 600,
                                                    }}>
                                                        {u.name?.charAt(0).toUpperCase() ?? "?"}
                                                    </div>
                                                    {isOnline && isOnline(addUserId) && (
                                                        <span style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: "#25D366", border: "2px solid #ffffff" }} />
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{u.name} {u.surname}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleAddMember(addUserId)}
                                                    disabled={addingId === addUserId}
                                                    style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }}
                                                    onMouseEnter={e => e.target.style.background = "#1d4ed8"}
                                                    onMouseLeave={e => e.target.style.background = "#2563eb"}
                                                >
                                                    {addingId === addUserId ? "..." : "Add"}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Member List */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {loading ? (
                            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                                <div style={{ width: 28, height: 28, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            </div>
                        ) : (
                            members.map((m, index) => {
                                const isMe = String(m.user_id) === String(user.id);
                                const memberIsAdmin = Boolean(Number(m.is_admin));
                                const fullName = `${m.name ?? ""} ${m.surname ?? ""}`.trim() || m.email;

                                return (
                                    <div key={m.id} style={{
                                        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                                        borderBottom: index < members.length - 1 ? "1px solid #f3f4f6" : "none",
                                        background: "#ffffff", transition: "background 0.2s"
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                                        onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}
                                    >
                                        <div style={{ position: "relative", flexShrink: 0 }}>
                                            {m.photo ? (
                                                <img
                                                    src={getAvatarUrl(m.photo, m.user_id)}
                                                    alt={fullName}
                                                    style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", display: "block" }}
                                                    onError={e => {
                                                        e.target.style.display = "none";
                                                        const fallback = e.target.parentElement?.querySelector(".chat_av-fallback");
                                                        if (fallback) fallback.style.display = "flex";
                                                    }}
                                                />
                                            ) : null}
                                            <div className="chat_av-fallback" style={{
                                                width: 38, height: 38, borderRadius: "50%",
                                                background: getColor(m.name), display: m.photo ? "none" : "flex",
                                                alignItems: "center", justifyContent: "center",
                                                color: "white", fontSize: 14, fontWeight: 600,
                                            }}>
                                                {m.name?.charAt(0).toUpperCase() ?? "?"}
                                            </div>
                                            {isOnline && isOnline(m.user_id) && (
                                                <span style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: "#25D366", border: "2px solid #ffffff" }} />
                                            )}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                                                {fullName}
                                                {isMe && <span style={{ fontSize: 11, fontWeight: 500, color: "#9ca3af", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>You</span>}
                                            </p>
                                            {memberIsAdmin ? (
                                                <p style={{ margin: 0, fontSize: 12, color: "#059669", fontWeight: 600 }}>Group Admin</p>
                                            ) : (
                                                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Member</p>
                                            )}
                                        </div>

                                        {isAdmin && !memberIsAdmin && !isMe && (
                                            <button
                                                onClick={() => handleRemoveMember(m.user_id, fullName)}
                                                disabled={removingId === m.user_id}
                                                title={`Remove ${fullName}`}
                                                style={{
                                                    background: "none", border: "1px solid #fee2e2", borderRadius: 6,
                                                    cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 500,
                                                    padding: "4px 10px", transition: "all 0.2s"
                                                }}
                                                onMouseEnter={e => { e.target.style.background = "#fef2f2"; e.target.style.borderColor = "#fecaca"; }}
                                                onMouseLeave={e => { e.target.style.background = "none"; e.target.style.borderColor = "#fee2e2"; }}
                                            >
                                                {removingId === m.user_id ? "..." : "Remove"}
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ── Delete group (admin only) ── */}
            {isAdmin && (
                <div style={{ padding: "16px", background: "#ffffff", borderTop: "1px solid #e2e8f0", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                    <button
                        onClick={handleDeleteGroup}
                        disabled={deleting}
                        style={{
                            width: "auto", padding: "6px 16px", border: "1px solid #fecaca",
                            borderRadius: 8, background: "#fef2f2", color: "#dc2626",
                            fontSize: 13, fontWeight: 600, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={e => { e.target.style.background = "#fee2e2"; }}
                        onMouseLeave={e => { e.target.style.background = "#fef2f2"; }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        {deleting ? "Deleting..." : "Delete Group"}
                    </button>
                </div>
            )}
        </div>
    );
}
