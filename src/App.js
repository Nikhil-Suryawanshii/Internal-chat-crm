import { useAuth } from "./context/AuthContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import ChatWidget from "./components/Chat/ChatWidget";
import Login from "./components/Login";

function App() {
    const { user, login } = useAuth();
    const { i18n } = useTranslation();

    // Always overwrite with fresh Blade-injected credentials on every page load.
    // Do NOT guard with !user — stale localStorage user would block token refresh.
    useEffect(() => {
        const mkUser  = window.MokapenChatUser;
        const mkToken = window.MokapenChatToken;

        if (mkUser && mkToken && mkToken !== '') {
            login({
                id:     mkUser.id,
                name:   mkUser.name,
                email:  mkUser.email,
                photo:  mkUser.photo,
                org_id: mkUser.org_id,
                language: mkUser.language || mkUser.default_language || 'en',
            }, mkToken);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const lang = user?.language || window.MokapenChatUser?.language || window.MokapenChatUser?.default_language;
        if (lang) {
            i18n.changeLanguage(lang);
        }
    }, [user?.language, i18n]);

    return (
        <div>
            {/* Show ChatWidget as soon as Blade credentials exist (user may still be
                loading from localStorage or from the useEffect above) */}
            {(user || window.MokapenChatUser)
                ? <ChatWidget />
                : <Login />
            }
        </div>
    );
}

export default App;