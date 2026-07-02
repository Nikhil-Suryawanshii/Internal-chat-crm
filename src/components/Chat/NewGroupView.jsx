import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import ChatService from "../../services/chatService";
import { getAvatarUrl } from "../../config/urls";

export default function NewGroupView({ onGroupCreated, onCancel, isOnline }) {
    const { user }                          = useAuth();
    const [groupName, setGroupName]         = useState("");
    
    // Data lists
    const [users, setUsers]                 = useState([]);
    const [teams, setTeams]                 = useState([]);
    
    // Selections
    const [selectedUsers, setSelectedUsers] = useState([]);   // [{ id: string, name, surname, photo }]
    const [selectedTeams, setSelectedTeams] = useState([]);   // [{ id: string, name }]
    const [teamMembersCache, setTeamMembersCache] = useState({}); // { teamId: [user objects] }
    
    // States
    const [loading, setLoading]             = useState(false);
    const [creating, setCreating]           = useState(false);
    const [error, setError]                 = useState(null);
    const [search, setSearch]               = useState("");
    const createInFlightRef                 = useRef(false);

    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [usersRes, teamsRes] = await Promise.all([
                ChatService.getUsers(user.id, "", user.org_id),
                ChatService.getTeams(user.org_id)
            ]);
            
            if (usersRes.data?.success) setUsers(usersRes.data.data);
            if (teamsRes.data?.success) setTeams(teamsRes.data.data.teams_list || []);
        } catch (err) {
            setError("Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    // ── Normalize every ID to a string so === always works ──
    const getUserId = (u) => String(u.user_id ?? u.id);
    const getTeamId = (t) => String(t.team_id);

    const isUserSelected = (u) => selectedUsers.some(s => s.id === getUserId(u));
    const isTeamSelected = (t) => selectedTeams.some(s => s.id === getTeamId(t));

    const toggleUser = (u) => {
        const id = getUserId(u);
        setSelectedUsers(prev =>
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

    const toggleTeam = async (t) => {
        const id = getTeamId(t);
        const isSelected = selectedTeams.some(s => s.id === id);

        if (isSelected) {
            setSelectedTeams(prev => prev.filter(s => s.id !== id));
        } else {
            // Select immediately for responsive UI
            setSelectedTeams(prev => [...prev, { id, name: t.title }]);
            
            // Deduplicate any overlapping individual users and cache members
            try {
                const res = await ChatService.getTeamMembers(id);
                if (res.data?.success) {
                    const data = res.data.data;
                    const members = data.members || [];
                    const manager = data.manager;
                    
                    const allUsersInTeam = [...members];
                    if (manager && manager.user_id) {
                        // Avoid duplicating the manager if they are also in the members array
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

    const removeUser = (id) => {
        setSelectedUsers(prev => prev.filter(s => s.id !== String(id)));
    };
    
    const removeTeam = (id) => {
        setSelectedTeams(prev => prev.filter(s => s.id !== String(id)));
    };

    const implicitUserIds = useMemo(() => {
        const ids = new Set();
        selectedTeams.forEach(t => {
            const teamUsers = teamMembersCache[t.id] || [];
            teamUsers.forEach(u => ids.add(String(u.user_id)));
        });
        return ids;
    }, [selectedTeams, teamMembersCache]);

    const handleCreate = async () => {
        if (createInFlightRef.current) return;

        if (!groupName.trim()) {
            setError("Please enter a group name");
            return;
        }
        if (selectedUsers.length + selectedTeams.length < 1) {
            setError("Please select at least 1 member or team");
            return;
        }

        try {
            createInFlightRef.current = true;
            setCreating(true);
            setError(null);

            let allTeamMemberIds = [];
            selectedTeams.forEach(t => {
                const teamUsers = teamMembersCache[t.id] || [];
                teamUsers.forEach(u => allTeamMemberIds.push(String(u.user_id)));
            });

            const memberIds = [...new Set([
                String(user.id),
                ...selectedUsers.map(s => String(s.id)),
                ...allTeamMemberIds
            ])];
            const teamIds = selectedTeams.map(t => String(t.id));

            const res = await ChatService.createGroup(
                user.id,
                groupName.trim(),
                memberIds,
                user.org_id,
                teamIds
            );

            if (res.data.success) {
                const threadId = res.data.thread_id ?? res.data.data?.thread_id;
                // Just pass selected items back for local representation if needed
                const createdMembers = res.data.members ?? [...selectedUsers, ...selectedTeams];
                
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

    const searchLower = search.toLowerCase();
    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchLower) ||
        u.surname?.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower)
    );
    
    const filteredTeams = teams.filter(t =>
        t.title?.toLowerCase().includes(searchLower)
    );

    const avatarColors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

    const totalSelected = selectedUsers.length + selectedTeams.length;
    const canCreate = !creating && groupName.trim().length > 0 && totalSelected >= 1;

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
            {totalSelected > 0 && (
                <div style={{
                    padding: "8px 16px", borderBottom: "1px solid #f3f4f6",
                    display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0,
                    maxHeight: 80, overflowY: "auto"
                }}>
                    {selectedTeams.map(s => (
                        <span key={`team-${s.id}`} style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "#e0e7ff", color: "#4f46e5",
                            padding: "4px 10px", borderRadius: 20,
                            fontSize: 12, fontWeight: 500
                        }}>
                            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                            {s.name}
                            <button
                                onClick={() => removeTeam(s.id)}
                                title={`Remove ${s.name}`}
                                style={{
                                    background: "none", border: "none",
                                    cursor: "pointer", color: "#4f46e5",
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
                    {selectedUsers.map(s => (
                        <span key={`user-${s.id}`} style={{
                            display: "flex", alignItems: "center", gap: 4,
                            background: "#eff6ff", color: "#2563eb",
                            padding: "4px 10px", borderRadius: 20,
                            fontSize: 12, fontWeight: 500
                        }}>
                            {s.name} {s.surname}
                            <button
                                onClick={() => removeUser(s.id)}
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
                        placeholder="Search users and teams..."
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

            {/* ── User & Team list ── */}
            <div style={{ flex: 1, overflowY: "auto" }}>
                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
                        <div style={{ width: 28, height: 28, border: "3px solid #e5e7eb", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (filteredUsers.length === 0 && filteredTeams.length === 0) ? (
                    <div style={{ textAlign: "center", padding: "40px 20px" }}>
                        <p style={{ color: "#9ca3af", fontSize: 13 }}>
                            {search ? `No results for "${search}"` : "No users or teams available"}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* TEAMS */}
                        {filteredTeams.map(t => {
                            const teamId  = getTeamId(t);
                            const checked = isTeamSelected(t);

                            return (
                                <button
                                    key={`team-${teamId}`}
                                    onClick={() => toggleTeam(t)}
                                    style={{
                                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                                        padding: "10px 16px",
                                        background: checked ? "#eef2ff" : "transparent",
                                        border: "none", borderBottom: "1px solid #f9fafb",
                                        cursor: "pointer", textAlign: "left",
                                        transition: "background 0.15s"
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = checked ? "#e0e7ff" : "#f9fafb"}
                                    onMouseLeave={e => e.currentTarget.style.background = checked ? "#eef2ff" : "transparent"}
                                >
                                    <div style={{ position: "relative", flexShrink: 0 }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: "50%",
                                            background: "#95cef0",
                                            border: "2px solid #ffffff",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "white"
                                        }}>
                                            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                        </div>
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: 0 }}>
                                            {t.title}
                                        </p>
                                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Team • {t.count || 0} members</p>
                                    </div>

                                    <div style={{
                                        width: 22, height: 22, borderRadius: "50%",
                                        border: checked ? "none" : "2px solid #d1d5db",
                                        background: checked ? "#95cef0" : "transparent",
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
                        })}

                        {/* USERS */}
                        {filteredUsers.map(u => {
                            const userId  = getUserId(u);
                            const color   = avatarColors[(u.name?.charCodeAt(0) || 0) % avatarColors.length];
                            
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
                                        padding: "10px 16px",
                                        background: checked ? "#eff6ff" : "transparent",
                                        border: "none", borderBottom: "1px solid #f9fafb",
                                        cursor: implicitlySelected ? "default" : "pointer", textAlign: "left",
                                        transition: "background 0.15s",
                                        opacity: implicitlySelected ? 0.8 : 1
                                    }}
                                    onMouseEnter={e => {
                                        if (!implicitlySelected) e.currentTarget.style.background = checked ? "#dbeafe" : "#f9fafb";
                                    }}
                                    onMouseLeave={e => {
                                        if (!implicitlySelected) e.currentTarget.style.background = checked ? "#eff6ff" : "transparent";
                                    }}
                                >
                                    <div style={{ position: "relative", flexShrink: 0 }}>
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt={u.name}
                                                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid #ffffff" }}
                                                onError={e => {
                                                    e.target.style.display = "none";
                                                    const fallback = e.target.parentElement?.querySelector(".chat_av-fallback");
                                                    if (fallback) fallback.style.display = "flex";
                                                }}
                                            />
                                        ) : null}
                                        <div className="chat_av-fallback" style={{
                                            width: 40, height: 40, borderRadius: "50%",
                                            background: "#95cef0",
                                            border: "1px solid #ffffff",
                                            display: avatarUrl ? "none" : "flex",
                                            alignItems: "center", justifyContent: "center",
                                            color: "white", fontSize: 15, fontWeight: 600
                                        }}>
                                            {u.name?.charAt(0).toUpperCase() ?? "?"}
                                        </div>
                                        {(isOnline && isOnline(userId)) && (
                                            <span style={{
                                                position: "absolute", bottom: 1, right: 1,
                                                width: 10, height: 10, background: "#25D366",
                                                border: "2px solid white", borderRadius: "50%"
                                            }} />
                                        )}
                                    </div>

                                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                                        <p style={{ fontSize: 14, fontWeight: 500, color: "#111827", margin: 0 }}>
                                            {u.name} {u.surname ?? ""}
                                        </p>
                                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>{u.email}</p>
                                    </div>

                                    <div style={{
                                        width: 22, height: 22, borderRadius: "50%",
                                        border: checked ? "none" : "2px solid #d1d5db",
                                        background: implicitlySelected ? "#60a5fa" : (checked ? "#2563eb" : "transparent"),
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
                        })}
                    </>
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
                        : totalSelected > 0
                            ? `Create Group (${totalSelected} selected)`
                            : "Create Group"}
                </button>
            </div>
        </div>
    );
}
