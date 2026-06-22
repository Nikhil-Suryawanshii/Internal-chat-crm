import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";

// Shows group members, lets the admin rename the group, add/remove members,
// or delete the group entirely. Non-admins get a read-only view (just the
// member list) plus the option to leave is intentionally NOT included here
// since there's no "leave group" API yet — only admin actions.
export default function GroupInfoView({ conversation, onCancel, onGroupUpdated, onGroupDeleted }) {
    const { user } = useAuth();

    const [members, setMembers]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);

    const [renaming, setRenaming]     = useState(false);
    const [groupName, setGroupName]   = useState(conversation?.title || conversation?.name || conversation?.group_name || "");
    const [savingName, setSavingName] = useState(false);

    const [showAddPanel, setShowAddPanel] = useState(false);
    const [allUsers, setAllUsers]         = useState([]);
    const [addSearch, setAddSearch]       = useState("");
    const [addingId, setAddingId]         = useState(null);
    const [removingId, setRemovingId]     = useState(null);
    const [deleting, setDeleting]         = useState(false);

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
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* ── Group name / rename ── */}
            <div style={{ padding: "16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                <div style={{
                    width: 64, height: 64, borderRadius: "50%", margin: "0 auto 12px",
                    background: `hsl(${((groupName.charCodeAt(0) || 0) * 37) % 360}, 60%, 55%)`,
                    color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, fontWeight: 700,
                }}>
                    {groupName.charAt(0).toUpperCase() || "G"}
                </div>

                {renaming ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                            autoFocus
                            type="text"
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSaveName()}
                            style={{
                                flex: 1, padding: "8px 12px", border: "1.5px solid #dbeafe",
                                borderRadius: 10, fontSize: 14, outline: "none", color: "#111827",
                            }}
                        />
                        <button onClick={handleSaveName} disabled={savingName}
                            style={{ background: "#2563eb", border: "none", borderRadius: 8, color: "white", padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                            {savingName ? "..." : "Save"}
                        </button>
                        <button onClick={() => { setRenaming(false); setGroupName(conversation?.title || conversation?.name || ""); }}
                            style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}>
                            Cancel
                        </button>
                    </div>
                ) : (
                    <div style={{ textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>{groupName}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
                            {members.length} member{members.length !== 1 ? "s" : ""}
                        </p>
                        {isAdmin && (
                            <button onClick={() => setRenaming(true)}
                                style={{ marginTop: 8, background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                ✏️ Rename group
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Error ── */}
            {error && (
                <div style={{ margin: "10px 16px 0", padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>⚠️ {error}</p>
                </div>
            )}

            {/* ── Add member panel ── */}
            {isAdmin && showAddPanel && (
                <div style={{ borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                    <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Add members</span>
                        <button onClick={() => setShowAddPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>✕</button>
                    </div>
                    <div style={{ padding: "0 16px 8px" }}>
                        <input
                            type="text"
                            value={addSearch}
                            onChange={e => setAddSearch(e.target.value)}
                            placeholder="Search people to add..."
                            style={{ width: "100%", padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        />
                    </div>
                    <div style={{ maxHeight: 160, overflowY: "auto" }}>
                        {addableUsers.length === 0 ? (
                            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "10px 0" }}>No users to add</p>
                        ) : (
                            addableUsers.map(u => (
                                <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px" }}>
                                    <div style={{
                                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                                        background: getColor(u.name), display: "flex", alignItems: "center",
                                        justifyContent: "center", color: "white", fontSize: 12, fontWeight: 600,
                                    }}>
                                        {u.name?.charAt(0).toUpperCase() ?? "?"}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontSize: 13, color: "#111827" }}>{u.name} {u.surname}</p>
                                    </div>
                                    <button
                                        onClick={() => handleAddMember(u.user_id)}
                                        disabled={addingId === u.user_id}
                                        style={{ background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                                    >
                                        {addingId === u.user_id ? "..." : "Add"}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ── Member list ── */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Members</span>
                    {isAdmin && !showAddPanel && (
                        <button onClick={openAddPanel} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                            + Add
                        </button>
                    )}
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
                        <div style={{ width: 24, height: 24, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    members.map(m => {
                        const isMe = String(m.user_id) === String(user.id);
                        const memberIsAdmin = Boolean(Number(m.is_admin));
                        const fullName = `${m.name ?? ""} ${m.surname ?? ""}`.trim() || m.email;

                        return (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px" }}>
                                <div style={{ position: "relative", flexShrink: 0 }}>
                                    {m.photo ? (
                                        <img
                                            src={m.photo.startsWith("http") ? m.photo : `http://localhost/mokapen/public/uploads/users/${m.user_id}/images/${m.photo}`}
                                            alt={fullName}
                                            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", display: "block" }}
                                            onError={e => {
                                                e.target.style.display = "none";
                                                const fallback = e.target.parentElement?.querySelector(".av-fallback");
                                                if (fallback) fallback.style.display = "flex";
                                            }}
                                        />
                                    ) : null}
                                    <div className="av-fallback" style={{
                                        width: 36, height: 36, borderRadius: "50%",
                                        background: getColor(m.name), display: m.photo ? "none" : "flex",
                                        alignItems: "center", justifyContent: "center",
                                        color: "white", fontSize: 13, fontWeight: 600,
                                    }}>
                                        {m.name?.charAt(0).toUpperCase() ?? "?"}
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#111827" }}>
                                        {fullName} {isMe && <span style={{ color: "#9ca3af" }}>(You)</span>}
                                    </p>
                                    {memberIsAdmin && (
                                        <p style={{ margin: 0, fontSize: 11, color: "#2563eb", fontWeight: 600 }}>Admin</p>
                                    )}
                                </div>
                                {isAdmin && !memberIsAdmin && !isMe && (
                                    <button
                                        onClick={() => handleRemoveMember(m.user_id, fullName)}
                                        disabled={removingId === m.user_id}
                                        title={`Remove ${fullName}`}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12 }}
                                    >
                                        {removingId === m.user_id ? "..." : "Remove"}
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* ── Delete group (admin only) ── */}
            {isAdmin && (
                <div style={{ padding: "12px 16px", borderTop: "1px solid #f3f4f6", flexShrink: 0 }}>
                    <button
                        onClick={handleDeleteGroup}
                        disabled={deleting}
                        style={{
                            width: "100%", padding: "10px", border: "1px solid #fecaca",
                            borderRadius: 10, background: "#fef2f2", color: "#dc2626",
                            fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                    >
                        {deleting ? "Deleting..." : "🗑 Delete group"}
                    </button>
                </div>
            )}
        </div>
    );
}
