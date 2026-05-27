import { createContext, useContext, useEffect, useRef, useState } from "react";
import { subscribeToPush } from "../utils/pushNotifications";
import API from "../config/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem("chat_user");
        return saved ? JSON.parse(saved) : null;
    });
    const lastSubscribedUserRef = useRef(null);

    useEffect(() => {
        if (!user?.id) {
            lastSubscribedUserRef.current = null;
            return;
        }

        if (lastSubscribedUserRef.current === user.id) {
            return;
        }

        lastSubscribedUserRef.current = user.id;

        const timer = setTimeout(() => {
            subscribeToPush(user.id, API).catch((err) => {
                console.error("Push init failed:", err);
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, [user]);

    const login = (userData, token) => {
        localStorage.setItem("chat_token", token);
        localStorage.setItem("chat_user", JSON.stringify(userData));
        setUser(userData);
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
