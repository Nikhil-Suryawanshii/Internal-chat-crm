import { useState, useEffect } from "react";
import { getEcho, onEchoReconnect } from "../config/echo";

export default function useOnlineStatus(currentUserId) {
    const [onlineUsers, setOnlineUsers] = useState([]);
    // A simple trigger that increments whenever echo reconnects
    const [echoVersion, setEchoVersion] = useState(0);

    // Listen for echo reconnections (e.g. after login)
    useEffect(() => {
        const unsubscribe = onEchoReconnect((version) => {
            setEchoVersion(version);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!currentUserId) return;

        const echo = getEcho();

        // Leave first in case we are re-subscribing after a reconnect
        try { echo.leave("online"); } catch (e) { }

        // Join presence channel with the fresh echo instance
        echo.join("online")
            .here((users) => {
                const ids = users.map(u => u.id);
                setOnlineUsers(ids);
                // console.log("✅ Online users:", ids);
            })
            .joining((user) => {
                setOnlineUsers(prev => [...new Set([...prev, user.id])]);
                // console.log("🟢 User online:", user.id);
            })
            .leaving((user) => {
                setOnlineUsers(prev => prev.filter(id => id !== user.id));
                // console.log("🔴 User offline:", user.id);
            })
            .error((error) => {
                console.error("Presence channel error:", error);
            });

        return () => {
            try { getEcho().leave("online"); } catch (e) { }
        };
        // Re-run whenever the user logs in (currentUserId) or echo reconnects (echoVersion)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUserId, echoVersion]);

    const isOnline = (userId) => onlineUsers.includes(Number(userId));

    return { onlineUsers, isOnline };
}