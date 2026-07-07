import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import { getAvatarUrl } from "../../config/urls";
import { useTranslation } from "react-i18next";

// Shows group members, lets the admin rename the group, add/remove members,
// or delete the group entirely. Non-admins get a read-only view (just the
// member list) plus the option to leave is intentionally NOT included here
// since there's no "leave group" API yet — only admin actions.
export default function GroupInfoView({ conversation, onCancel, onGroupUpdated, onGroupDeleted, isOnline }) {
    const { user } = useAuth();
    const { t } = useTranslation();

    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [renaming, setRenaming] = useState(false);
    const [groupName, setGroupName] = useState(conversation?.title || conversation?.name || conversation?.group_name || "");
    const [savingName, setSavingName] = useState(false);

    // Add Member Panel State
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [addSearch, setAddSearch] = useState("");

    // Selections for Add Panel
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [selectedTeams, setSelectedTeams] = useState([]);
    const [teamMembersCache, setTeamMembersCache] = useState({});

    const [adding, setAdding] = useState(false);
    const [removingId, setRemovingId] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const addInFlightRef = useRef(false);

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
    const myMembership = members.find(m => String(m.user_id) === String(user.id) && m.participant_type === 'user');
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

    // ── Load users and teams to add ─────────────────────────
    const openAddPanel = async () => {
        setShowAddPanel(true);
        setSelectedUsers([]);
        setSelectedTeams([]);
        try {
            const [usersRes, teamsRes] = await Promise.all([
                ChatService.getUsers(user.id, "", user.org_id),
                ChatService.getTeams(user.org_id)
            ]);
            if (usersRes.data?.success) setAllUsers(usersRes.data.data || []);
            if (teamsRes.data?.success) setAllTeams(teamsRes.data.data.teams_list || []);
        } catch (err) {
            setError("Failed to load users and teams");
        }
    };

    const getUserId = (u) => String(u.user_id ?? u.id);
    const getTeamId = (t) => String(t.team_id);

    const memberUserSet = new Set(members.filter(m => m.participant_type === 'user').map(m => String(m.user_id)));
    const memberTeamSet = new Set(members.filter(m => m.participant_type === 'team').map(m => String(m.participant_id)));

    const searchLower = addSearch.toLowerCase();

    const addableUsers = allUsers.filter(u =>
        !memberUserSet.has(getUserId(u)) &&
        (u.name?.toLowerCase().includes(searchLower) ||
            u.surname?.toLowerCase().includes(searchLower) ||
            u.email?.toLowerCase().includes(searchLower))
    );

    const addableTeams = allTeams.filter(t =>
        !memberTeamSet.has(getTeamId(t)) &&
        t.title?.toLowerCase().includes(searchLower)
    );

    const isUserSelected = (u) => selectedUsers.some(s => s.id === getUserId(u));
    const isTeamSelected = (t) => selectedTeams.some(s => s.id === getTeamId(t));

    const toggleUser = (u) => {
        const id = getUserId(u);
        setSelectedUsers(prev =>
            prev.some(s => s.id === id)
                ? prev.filter(s => s.id !== id)
                : [...prev, { id, name: u.name, surname: u.surname, photo: u.photo }]
        );
    };

    const toggleTeam = async (t) => {
        const id = getTeamId(t);
        const isSelected = selectedTeams.some(s => s.id === id);

        if (isSelected) {
            setSelectedTeams(prev => prev.filter(s => s.id !== id));
        } else {
            setSelectedTeams(prev => [...prev, { id, name: t.title }]);
            try {
                const res = await ChatService.getTeamMembers(id);
                if (res.data?.success) {
                    const data = res.data.data;
                    const members = data.members || [];
                    const manager = data.manager;

                    const allUsersInTeam = [...members];
                    if (manager && manager.user_id) {
                        if (!allUsersInTeam.some(m => String(m.user_id) === String(manager.user_id))) {
                            allUsersInTeam.push(manager);
                        }
                    }

                    setTeamMembersCache(prev => ({ ...prev, [id]: allUsersInTeam }));
                    const memberIds = allUsersInTeam.map(m => String(m.user_id));
                    setSelectedUsers(prev => prev.filter(u => !memberIds.includes(u.id)));
                }
            } catch (err) {
                console.error("Failed to fetch team members for deduplication", err);
            }
        }
    };

    const removeSelectedUser = (id) => setSelectedUsers(prev => prev.filter(s => s.id !== String(id)));
    const removeSelectedTeam = (id) => setSelectedTeams(prev => prev.filter(s => s.id !== String(id)));

    const implicitUserIds = useMemo(() => {
        const ids = new Set();
        selectedTeams.forEach(t => {
            const teamUsers = teamMembersCache[t.id] || [];
            teamUsers.forEach(u => ids.add(String(u.user_id)));
        });
        return ids;
    }, [selectedTeams, teamMembersCache]);

    const handleAddSelected = async () => {
        if (addInFlightRef.current) return;
        const totalSelected = selectedUsers.length + selectedTeams.length;
        if (totalSelected === 0) return;

        try {
            addInFlightRef.current = true;
            setAdding(true);
            setError(null);

            let allTeamMemberIds = [];
            selectedTeams.forEach(t => {
                const teamUsers = teamMembersCache[t.id] || [];
                teamUsers.forEach(u => allTeamMemberIds.push(String(u.user_id)));
            });

            const memberIdsToSubmit = [...new Set([
                ...selectedUsers.map(s => String(s.id)),
                ...allTeamMemberIds
            ])];
            const teamIdsToSubmit = selectedTeams.map(t => String(t.id));

            await ChatService.addGroupMember(threadId, user.id, memberIdsToSubmit, teamIdsToSubmit);
            await loadMembers();

            setShowAddPanel(false);
            setSelectedUsers([]);
            setSelectedTeams([]);
            setAddSearch("");
        } catch (err) {
            const serverMessage =
                err?.response?.data?.message ||
                (err?.response?.data?.errors
                    ? Object.values(err.response.data.errors).flat().join(" ")
                    : "");
            setError(serverMessage || "Failed to add member");
        } finally {
            addInFlightRef.current = false;
            setAdding(false);
        }
    };

    const [confirmDialog, setConfirmDialog] = useState(null);
    const [confirmInput, setConfirmInput] = useState("");

    const handleRemoveMember = async (participantId, participantType, participantName) => {
        setConfirmInput("");
        setConfirmDialog({
            title: t("remove_member_title", "REMOVE MEMBER"),
            message: t("remove_member_confirm", "Are you sure you want to remove {{name}} from the group?", { name: participantName }),
            requiredInput: t("remove_upper", "REMOVE"),
            confirmText: t("remove", "Remove"),
            isDestructive: true,
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    setRemovingId(`${participantType}-${participantId}`);
                    setError(null);
                    await ChatService.removeGroupMember(threadId, user.id, participantId, participantType);
                    await loadMembers();
                } catch (err) {
                    setError(err?.response?.data?.message || "Failed to remove member");
                } finally {
                    setRemovingId(null);
                }
            }
        });
    };

    const handleDeleteGroup = async () => {
        setConfirmInput("");
        setConfirmDialog({
            title: t("delete_group_title", "DELETE GROUP"),
            message: t("delete_group_confirm", "Delete this group for everyone? This cannot be undone."),
            requiredInput: t("delete_upper", "DELETE"),
            confirmText: t("delete", "Delete"),
            isDestructive: true,
            onConfirm: async () => {
                setConfirmDialog(null);
                try {
                    setDeleting(true);
                    setError(null);
                    await ChatService.deleteGroup(threadId, user.id);
                    if (onGroupDeleted) onGroupDeleted(threadId);
                } catch (err) {
                    setError(err?.response?.data?.message || "Failed to delete group");
                    setDeleting(false);
                }
            }
        });
    };

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const getColor = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

    const totalSelected = selectedUsers.length + selectedTeams.length;

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
                    background: "#95cef0",
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
                            style={{ background: "#04c4b1", border: "none", borderRadius: 8, color: "white", padding: "10px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "opacity 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                        >
                            {savingName ? "..." : t("save", "Save")}
                        </button>
                        <button onClick={() => { setRenaming(false); setGroupName(conversation?.title || conversation?.name || ""); }}
                            style={{ background: "#f3f4f6", border: "none", borderRadius: 8, color: "#4b5563", padding: "10px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#e5e7eb"}
                            onMouseLeave={e => e.currentTarget.style.background = "#f3f4f6"}
                        >
                            {t("cancel", "Cancel")}
                        </button>
                    </div>
                ) : (
                    <div style={{ textAlign: "center" }}>
                        {(() => {
                            const displayMembers = members.filter(m => m.participant_type !== 'team');
                            return (
                                <>
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
                                        {t("group", "Group")} · {displayMembers.length} {t("members", "members")}
                                    </p>
                                </>
                            );
                        })()}
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
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{t("members", "Members")}</span>
                        {isAdmin && !showAddPanel && (
                            <button onClick={openAddPanel}
                                style={{ background: "#47a8e0", border: "none", color: "#ffffff", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 16, transition: "background 0.2s" }}
                                onMouseEnter={e => e.target.style.background = "#47bee0"}
                                onMouseLeave={e => e.target.style.background = "#47a8e0"}
                            >
                                + {t("add_member", "Add Member")}
                            </button>
                        )}
                    </div>

                    {/* ── Add member panel (Multiselect) ── */}
                    {isAdmin && showAddPanel && (
                        <div style={{ background: "#f8fafc", borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column" }}>
                            {/* Selected Pills */}
                            {totalSelected > 0 && (
                                <div style={{
                                    padding: "12px 16px 4px", display: "flex", flexWrap: "wrap", gap: 6,
                                    maxHeight: 100, overflowY: "auto"
                                }}>
                                    {selectedTeams.map(s => (
                                        <span key={`team-${s.id}`} style={{
                                            display: "flex", alignItems: "center", gap: 4,
                                            background: "#dbf3ff", color: "#2265a3",
                                            padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500
                                        }}>
                                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                            {s.name}
                                            <button onClick={() => removeSelectedTeam(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2265a3", padding: 0, display: "flex", marginLeft: 2 }}>
                                                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </span>
                                    ))}
                                    {selectedUsers.map(s => (
                                        <span key={`user-${s.id}`} style={{
                                            display: "flex", alignItems: "center", gap: 4,
                                            background: "#dbf3ff", color: "#2265a3",
                                            padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500
                                        }}>
                                            {s.name} {s.surname}
                                            <button onClick={() => removeSelectedUser(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2265a3", padding: 0, display: "flex", marginLeft: 2 }}>
                                                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Search Box */}
                            <div style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 14px", transition: "border-color 0.2s" }}>
                                    <svg width="18" height="18" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                    <input
                                        type="text"
                                        autoFocus
                                        value={addSearch}
                                        onChange={e => setAddSearch(e.target.value)}
                                        placeholder="Search members and teams..."
                                        style={{ border: "none", background: "transparent", outline: "none", flex: 1, fontSize: 14, color: "#0f172a" }}
                                    />
                                    {addSearch && (
                                        <button onClick={() => setAddSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}>
                                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                                {(addableUsers.length === 0 && addableTeams.length === 0) ? (
                                    <p style={{ fontSize: 14, color: "#9ca3af", textAlign: "center", padding: "20px 0", margin: 0 }}>
                                        {searchLower ? "No results found" : "No users or teams available"}
                                    </p>
                                ) : (
                                    <>
                                        {/* TEAMS */}
                                        {addableTeams.map(teamItem => {
                                            const teamId = getTeamId(teamItem);
                                            const checked = isTeamSelected(teamItem);

                                            return (
                                                <button
                                                    key={`team-${teamId}`}
                                                    onClick={() => toggleTeam(teamItem)}
                                                    style={{
                                                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                                                        padding: "10px 16px", background: checked ? "#eef2ff" : "transparent",
                                                        border: "none", borderBottom: "1px solid #f1f5f9",
                                                        cursor: "pointer", textAlign: "left", transition: "background 0.15s"
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = checked ? "#e0e7ff" : "#f1f5f9"}
                                                    onMouseLeave={e => e.currentTarget.style.background = checked ? "#eef2ff" : "transparent"}
                                                >
                                                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#95cef0", border: "2px solid #ffffff", display: "flex", alignItems: "center", justifyContent: "center", color: "white", flexShrink: 0 }}>
                                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                                        <p style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", margin: 0 }}>{teamItem.title}</p>
                                                        <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{t("team", "Team")} • {teamItem.count || 0} {t("members", "members")}</p>
                                                    </div>
                                                    <div style={{
                                                        width: 20, height: 20, borderRadius: "50%", border: checked ? "none" : "2px solid #cbd5e1",
                                                        background: checked ? "#95cef0" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                                                    }}>
                                                        {checked && <svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                </button>
                                            );
                                        })}

                                        {/* USERS */}
                                        {addableUsers.map(u => {
                                            const userId = getUserId(u);

                                            const implicitlySelected = implicitUserIds.has(userId);
                                            const explicitlySelected = isUserSelected(u);
                                            const checked = implicitlySelected || explicitlySelected;

                                            const avatarUrl = u.photo_url ?? getAvatarUrl(u.photo, userId);

                                            return (
                                                <button
                                                    key={`user-${userId}`}
                                                    onClick={() => {
                                                        if (implicitlySelected) return;
                                                        toggleUser(u);
                                                    }}
                                                    style={{
                                                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                                                        padding: "10px 16px", background: checked ? "#eff6ff" : "transparent",
                                                        border: "none", borderBottom: "1px solid #f1f5f9",
                                                        cursor: implicitlySelected ? "default" : "pointer", textAlign: "left",
                                                        transition: "background 0.15s",
                                                        opacity: implicitlySelected ? 0.8 : 1
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!implicitlySelected) e.currentTarget.style.background = checked ? "#dbeafe" : "#f1f5f9";
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!implicitlySelected) e.currentTarget.style.background = checked ? "#eff6ff" : "transparent";
                                                    }}
                                                >
                                                    <div style={{ position: "relative", flexShrink: 0 }}>
                                                        {avatarUrl ? (
                                                            <img src={avatarUrl} alt={u.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid #ffffff" }}
                                                                onError={e => { e.target.style.display = "none"; const fb = e.target.parentElement?.querySelector(".chat_av-fallback"); if (fb) fb.style.display = "flex"; }}
                                                            />
                                                        ) : null}
                                                        <div className="chat_av-fallback" style={{
                                                            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: "#95cef0", border: "2px solid #ffffff",
                                                            display: avatarUrl ? "none" : "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 600,
                                                        }}>
                                                            {u.name?.charAt(0).toUpperCase() ?? "?"}
                                                        </div>
                                                        {isOnline && isOnline(userId) && (
                                                            <span style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: "#25D366", border: "2px solid #ffffff" }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{u.name} {u.surname}</p>
                                                    </div>
                                                    <div style={{
                                                        width: 20, height: 20, borderRadius: "50%", border: checked ? "none" : "2px solid #cbd5e1",
                                                        background: implicitlySelected ? "#60a5fa" : (checked ? "#2563eb" : "transparent"), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                                                    }}>
                                                        {checked && <svg width="12" height="12" fill="none" stroke="white" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                            </div>

                            {/* Add Buttons Footer */}
                            <div style={{ padding: "12px 16px", background: "#ffffff", borderTop: "1px solid #f1f5f9", display: "flex", gap: 12 }}>
                                <button onClick={() => setShowAddPanel(false)}
                                    style={{ flex: 1, background: "#e9eef2", border: "none", color: "#64748b", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                >
                                    {t("cancel", "Cancel")}
                                </button>
                                <button onClick={handleAddSelected} disabled={adding || totalSelected === 0}
                                    style={{
                                        flex: 2,
                                        background: totalSelected > 0 ? "#04c4b1" : "#04c4b1",
                                        border: "none",
                                        color: "white", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                                        cursor: totalSelected > 0 ? "pointer" : "not-allowed",
                                        opacity: adding ? 0.7 : 1, transition: "opacity 0.2s"
                                    }}
                                >
                                    {adding ? t("adding", "Adding...") : totalSelected > 0 ? `${t("add_selected", "Add Selected")} (${totalSelected})` : t("add_selected", "Add Selected")}
                                </button>
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
                            members.filter(m => m.participant_type !== 'team').map((m, index, arr) => {
                                const isMe = String(m.user_id) === String(user.id);
                                const memberIsAdmin = Boolean(Number(m.is_admin));
                                const fullName = (`${m.name ?? ""} ${m.surname ?? ""}`.trim() || m.email);

                                return (
                                    <div key={m.id} style={{
                                        display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                                        borderBottom: index < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                                        background: "#ffffff", transition: "background 0.2s"
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                                        onMouseLeave={e => e.currentTarget.style.background = "#ffffff"}
                                    >
                                        <div style={{ position: "relative", flexShrink: 0 }}>
                                            <>
                                                {m.photo ? (
                                                    <img src={getAvatarUrl(m.photo, m.user_id)} alt={fullName} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid #ffffff" }}
                                                        onError={e => { e.target.style.display = "none"; const fallback = e.target.parentElement?.querySelector(".chat_av-fallback"); if (fallback) fallback.style.display = "flex"; }}
                                                    />
                                                ) : null}
                                                <div className="chat_av-fallback" style={{
                                                    width: 38, height: 38, borderRadius: "50%", background: "#95cef0", border: "2px solid #ffffff", display: m.photo ? "none" : "flex",
                                                    alignItems: "center", justifyContent: "center", color: "white", fontSize: 14, fontWeight: 600,
                                                }}>
                                                    {m.name?.charAt(0).toUpperCase() ?? "?"}
                                                </div>
                                                {isOnline && isOnline(m.user_id) && (
                                                    <span style={{ position: "absolute", right: -2, bottom: -2, width: 10, height: 10, borderRadius: "50%", background: "#25D366", border: "2px solid #ffffff" }} />
                                                )}
                                            </>
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: 6 }}>
                                                {fullName}
                                                {isMe && <span style={{ fontSize: 11, fontWeight: 500, color: "#9ca3af", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{t("you", "You")}</span>}
                                            </p>
                                            {memberIsAdmin ? (
                                                <p style={{ margin: 0, fontSize: 12, color: "#059669", fontWeight: 600 }}>{t("group_admin", "Group Admin")}</p>
                                            ) : (
                                                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{t("member", "Member")}</p>
                                            )}
                                        </div>

                                        {isAdmin && !memberIsAdmin && !isMe && (
                                            <button
                                                onClick={() => handleRemoveMember(m.participant_id, m.participant_type, fullName)}
                                                disabled={removingId === `${m.participant_type}-${m.participant_id}`}
                                                title={`Remove ${fullName}`}
                                                style={{
                                                    background: "none", border: "1px solid #fee2e2", borderRadius: 6,
                                                    cursor: "pointer", color: "#DF547A", fontSize: 12, fontWeight: 500,
                                                    padding: "4px 10px", transition: "all 0.2s"
                                                }}
                                                onMouseEnter={e => { e.target.style.background = "#fef2f2"; e.target.style.borderColor = "#fecaca"; }}
                                                onMouseLeave={e => { e.target.style.background = "none"; e.target.style.borderColor = "#fee2e2"; }}
                                            >
                                                {removingId === `${m.participant_type}-${m.participant_id}` ? "..." : t("remove", "Remove")}
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
                            borderRadius: 8, background: "#fef2f2", color: "#DF547A",
                            fontSize: 13, fontWeight: 600, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={e => { e.target.style.background = "#fee2e2"; }}
                        onMouseLeave={e => { e.target.style.background = "#fef2f2"; }}
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                        {deleting ? t("deleting", "Deleting...") : t("delete_group", "Delete Group")}
                    </button>
                </div>
            )}

            {/* Custom Confirm Dialog */}
            {confirmDialog && (
                <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.4)", zIndex: 100,
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
                }}>
                    <div style={{
                        background: "#ffffff", borderRadius: 12, padding: 24,
                        width: "100%", maxWidth: 360, boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                        animation: "fadeIn 0.2s ease-out", position: "relative"
                    }}>
                        <button onClick={() => setConfirmDialog(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: confirmDialog.isDestructive ? "#DF547A" : "#111827", textTransform: "uppercase" }}>
                            {confirmDialog.title}
                        </h3>
                        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>
                            {confirmDialog.message}
                        </p>

                        {confirmDialog.requiredInput && (
                            <div style={{ marginBottom: 24 }}>
                                <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 8 }}>
                                    {t("use_box_to_confirm", "Use the box below to confirm by typing")} <strong>{confirmDialog.requiredInput}</strong>.
                                </p>
                                <input
                                    type="text"
                                    value={confirmInput}
                                    onChange={e => setConfirmInput(e.target.value)}
                                    placeholder={confirmDialog.requiredInput}
                                    style={{
                                        width: "100%", padding: "10px 12px", border: "1px solid #93c5fd",
                                        borderRadius: 6, fontSize: 14, outline: "none", color: "#111827",
                                        boxSizing: "border-box"
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setConfirmDialog(null)}
                                style={{
                                    padding: "8px 20px", borderRadius: 20, border: "none",
                                    background: "#f1f5f9", color: "#475569", fontSize: 14, fontWeight: 500,
                                    cursor: "pointer", transition: "background 0.2s"
                                }}
                                onMouseEnter={e => e.target.style.background = "#e2e8f0"}
                                onMouseLeave={e => e.target.style.background = "#f1f5f9"}
                            >
                                {t("cancel", "Cancel")}
                            </button>
                            <button
                                onClick={confirmDialog.onConfirm}
                                disabled={confirmDialog.requiredInput && confirmInput !== confirmDialog.requiredInput}
                                style={{
                                    padding: "8px 20px", borderRadius: 20, border: "none",
                                    background: confirmDialog.isDestructive ? "#DF547A" : "#2563eb",
                                    color: "white", fontSize: 14, fontWeight: 500,
                                    cursor: (confirmDialog.requiredInput && confirmInput !== confirmDialog.requiredInput) ? "not-allowed" : "pointer",
                                    opacity: (confirmDialog.requiredInput && confirmInput !== confirmDialog.requiredInput) ? 0.6 : 1,
                                    transition: "all 0.2s"
                                }}
                                onMouseEnter={e => {
                                    if (!(confirmDialog.requiredInput && confirmInput !== confirmDialog.requiredInput)) {
                                        e.target.style.background = confirmDialog.isDestructive ? "#c44262" : "#1d4ed8";
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!(confirmDialog.requiredInput && confirmInput !== confirmDialog.requiredInput)) {
                                        e.target.style.background = confirmDialog.isDestructive ? "#DF547A" : "#2563eb";
                                    }
                                }}
                            >
                                {confirmDialog.confirmText || "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
