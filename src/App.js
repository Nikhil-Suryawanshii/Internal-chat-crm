import { useAuth } from "./context/AuthContext";
import { useEffect } from "react";
import ChatWidget from "./components/Chat/ChatWidget";
import Login from "./components/Login";

function App() {
    const { user, login } = useAuth();

    // Auto login from Mokapen blade
    useEffect(() => {
        const mkUser  = window.MokapenChatUser;
        const mkToken = window.MokapenChatToken;

        if (mkUser && mkToken && mkToken !== '' && !user) {
            login({
                id:    mkUser.id,
                name:  mkUser.name,
                email: mkUser.email,
                photo: mkUser.photo,
                org_id: mkUser.org_id,
            }, mkToken);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div>
            {user
                ? <ChatWidget />
                : window.MokapenChatUser
                    ? <div>Loading chat...</div>
                    : <Login />
            }
        </div>
    );
}

export default App;