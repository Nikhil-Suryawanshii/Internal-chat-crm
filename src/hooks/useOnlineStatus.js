import { useState, useEffect } from "react";
import echo from "../config/echo";

export default function useOnlineStatus(currentUserId) {
    const [onlineUsers, setOnlineUsers] = useState([]);

    useEffect(() => {
        if (!currentUserId) return;

        // Join presence channel
        const channel = echo.join(`presence-online`)
            .here((users) => {
                // Users currently online
                const ids = users.map(u => u.id);
                setOnlineUsers(ids);
                console.log("✅ Online users:", ids);
            })
            .joining((user) => {
                // New user came online
                setOnlineUsers(prev => [...new Set([...prev, user.id])]);
                console.log("🟢 User online:", user.id);
            })
            .leaving((user) => {
                // User went offline
                setOnlineUsers(prev => prev.filter(id => id !== user.id));
                console.log("🔴 User offline:", user.id);
            })
            .error((error) => {
                console.error("Presence channel error:", error);
            });

        return () => {
            echo.leave("presence-online");
        };
    }, [currentUserId]);

    const isOnline = (userId) => onlineUsers.includes(Number(userId));

    return { onlineUsers, isOnline };
}