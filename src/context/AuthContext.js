import { createContext, useContext, useState } from "react";
import { subscribeToPush } from "../utils/pushNotifications";
import { reconnectEcho } from "../config/echo";
import API from "../config/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem("chat_user");
        return saved ? JSON.parse(saved) : null;
    });

    const login = async (userData, token) => {
        localStorage.setItem("chat_token", token);
        localStorage.setItem("chat_user", JSON.stringify(userData));
        setUser(userData);

        // Reconnect Echo with fresh token ← ADD THIS
        try {
            reconnectEcho();
        } catch (err) {
            console.error("Echo reconnect failed:", err);
        }

        // Subscribe to push notifications after login
        setTimeout(async () => {
            try {
                await subscribeToPush(userData.id, API);
            } catch (err) {
                console.error("Push subscription failed:", err);
            }
        }, 2000);
    };

    const logout = () => {
        localStorage.removeItem("chat_token");
        localStorage.removeItem("chat_user");
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}