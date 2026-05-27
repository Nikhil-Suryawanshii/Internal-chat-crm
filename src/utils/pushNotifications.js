const urlBase64ToUint8Array = (base64String) => {
    const padding     = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64      = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const rawData     = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export const registerSW = async () => {
    if ("serviceWorker" in navigator) {
        try {
            const swUrl = `${process.env.PUBLIC_URL || ""}/sw.js`;
            const reg = await navigator.serviceWorker.register(swUrl);
            console.log("✅ SW registered");
            return reg;
        } catch (err) {
            console.error("❌ SW failed:", err);
            return null;
        }
    }
    return null;
};

export const subscribeToPush = async (userId, apiInstance) => {
    try {
        // Get VAPID public key
        const res       = await apiInstance.get("/push/vapid-public-key");
        const publicKey = res.data.public_key;

        // Register SW
        const registration = await registerSW();
        if (!registration) return false;

        // Request permission
        const permission = Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        if (permission !== "granted") {
            console.log("❌ Permission denied");
            return false;
        }

        // Subscribe
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly:      true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }

        const subJson = subscription.toJSON();

        // Save to Laravel
        await apiInstance.post("/push/subscribe", {
            user_id:          userId,
            endpoint:         subJson.endpoint,
            public_key:       subJson.keys.p256dh,
            auth_token:       subJson.keys.auth,
            content_encoding: "aesgcm",
        });

        console.log("✅ Push subscription saved!");
        return true;

    } catch (err) {
        console.error("❌ Push subscription failed:", err);
        return false;
    }
};
