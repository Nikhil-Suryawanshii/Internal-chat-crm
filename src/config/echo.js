import Echo from "laravel-echo";
import Pusher from "pusher-js";

window.Pusher = Pusher;

const echo = new Echo({
    broadcaster: "pusher",
    key: "mokapen-key",
    wsHost: "127.0.0.1",
    wsPort: 6001,
    wssPort: 6001,
    forceTLS: false,
    encrypted: false,
    disableStats: true,
    enabledTransports: ["ws", "wss"],
    cluster: "mt1",
});

export default echo;