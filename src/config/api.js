import axios from "axios";

const API = axios.create({
    baseURL: "http://localhost/mokapen/public/api",
    headers: {
        Accept: "application/json",
    },
    Authorization: {
        username: "mokapen",  // ← ADD THIS
        password: "mokapen"   // ← ADD THIS
    }
});

// Add Bearer token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem("chat_token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

API.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            if (error.response.status === 401) {
                localStorage.removeItem("chat_token");
                localStorage.removeItem("chat_user");
                window.location.reload();
            }

            if (error.response.status === 500) {
                console.error("Server error:", error.response.data);
            }
        }

        return Promise.reject(error);
    }
);

export default API;
