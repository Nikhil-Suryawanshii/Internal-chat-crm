self.addEventListener("push", function (event) {
    let data = {};

    if (event.data) {
        try {
            // Try JSON first
            data = event.data.json();
        } catch (e) {
            // Fallback to plain text
            data = {
                title: "New Message",
                body: event.data.text(),
            };
        }
    }

    const options = {
        body:    data.body || "New message",
        icon:    data.icon || "/mk-chats.png",
        badge:   "/mk-chats.png",
        vibrate: [200, 100, 200],
        data: {
            thread_id: data.thread_id,
            url:       data.url || "/",
        },
        actions: [
            { action: "open",  title: "Open Chat" },
            { action: "close", title: "Dismiss"   },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || "New Message",
            options
        )
    );
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    if (event.action !== "close") {
        event.waitUntil(
            clients.matchAll({
                type: "window",
                includeUncontrolled: true
            }).then((clientList) => {
                for (const client of clientList) {
                    if ("focus" in client) return client.focus();
                }
                if (clients.openWindow) {
                    return clients.openWindow("/");
                }
            })
        );
    }
});