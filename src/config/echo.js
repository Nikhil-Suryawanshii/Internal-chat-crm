import Echo from "laravel-echo";
import Pusher from "pusher-js";

window.Pusher = Pusher;

const createEcho = () => {
    return new Echo({
        broadcaster:       "pusher",
        key:               process.env.REACT_APP_SOKETI_KEY,
        wsHost:            process.env.REACT_APP_SOKETI_HOST,
        wsPort:            Number(process.env.REACT_APP_SOKETI_PORT),
        wssPort:           Number(process.env.REACT_APP_SOKETI_PORT),
        forceTLS:          false,
        encrypted:         false,
        disableStats:      true,
        enabledTransports: ["ws", "wss"],
        cluster:           "mt1",
        authEndpoint:      `${process.env.REACT_APP_API_URL}/broadcasting/auth`,
        auth: {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("chat_token")}`,
                Accept:        "application/json",
            },
        },
    });
};

// Current echo instance
let echo = createEcho();

// Version counter — incremented every time we reconnect.
// Other modules can subscribe to this to know when to re-join channels.
let echoVersion = 0;
const echoVersionListeners = new Set();

export const getEchoVersion = () => echoVersion;

export const onEchoReconnect = (callback) => {
    echoVersionListeners.add(callback);
    return () => echoVersionListeners.delete(callback);
};

// Fully recreate echo after login with a fresh token.
// We replace the *instance* and notify all listeners so hooks re-subscribe.
export const reconnectEcho = () => {
    // Disconnect old instance
    try { echo.disconnect(); } catch (e) {}

    // Create brand-new instance with the current token from localStorage
    echo = createEcho();

    // Notify all listeners (e.g. useOnlineStatus) to re-subscribe
    echoVersion += 1;
    echoVersionListeners.forEach(cb => cb(echoVersion));

    return echo;
};

// Always export a getter so callers get the *current* instance
export const getEcho = () => echo;

export default echo;