import Echo from "laravel-echo";
import Pusher from "pusher-js";

window.Pusher = Pusher;

const createEcho = () => {
    return new Echo({
        broadcaster:       "pusher",
        key:               "mokapen-key",
        wsHost:            "127.0.0.1",
        wsPort:            6001,
        wssPort:           6001,
        forceTLS:          false,
        encrypted:         false,
        disableStats:      true,
        enabledTransports: ["ws", "wss"],
        cluster:           "mt1",
        authEndpoint:      "http://localhost/mokapen/public/api/broadcasting/auth",
        auth: {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("chat_token")}`,
                Accept:        "application/json",
            },
        },
    });
};

// Create echo instance
let echo = createEcho();

// Recreate echo after login with fresh token
export const reconnectEcho = () => {
    try {
        echo.disconnect();
    } catch(e) {}
    echo = createEcho();
    return echo;
};

export default echo;