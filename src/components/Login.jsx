import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [error, setError]       = useState("");
    const [loading, setLoading]   = useState(false);

    const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
        const formData = new FormData();
        formData.append("email", email);
        formData.append("password", password);

            const res = await axios.post(
                "http://localhost/mokapen/public/api/login",
                formData,
                {
                    auth: {
                        username: "mokapen",  // ← Apache Basic Auth user
                        password: "mokapen"   // ← Apache Basic Auth password
                    }
                }
            );

            if (res.data.success) {
                login(
                    {
                        id:    res.data.data.user_id,
                        name:  res.data.data.name,
                        email: email,
                    },
                    res.data.data.token
                );
            }
        } catch (err) {
            setError("Invalid email or password!");
        }
        setLoading(false);
    };

    return (
        <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ background:"white", padding:40, borderRadius:20, boxShadow:"0 4px 24px rgba(0,0,0,0.1)", width:360 }}>
                <div style={{ textAlign:"center", marginBottom:32 }}>
                    <div style={{ width:56, height:56, borderRadius:"50%", background:"linear-gradient(135deg,#0066FF,#0044CC)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                        <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                        </svg>
                    </div>
                    <h2 style={{ fontSize:22, fontWeight:700, color:"#111827" }}>Mokapen Chat</h2>
                    <p style={{ color:"#9ca3af", fontSize:14, marginTop:4 }}>Sign in to continue</p>
                </div>

                {error && (
                    <div style={{ background:"#fef2f2", color:"#dc2626", padding:"10px 14px", borderRadius:10, fontSize:13, marginBottom:16 }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom:16 }}>
                    <label style={{ fontSize:13, fontWeight:500, color:"#374151", display:"block", marginBottom:6 }}>Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        style={{ width:"100%", padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none" }}
                    />
                </div>

                <div style={{ marginBottom:24 }}>
                    <label style={{ fontSize:13, fontWeight:500, color:"#374151", display:"block", marginBottom:6 }}>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        onKeyDown={e => e.key === "Enter" && handleLogin()}
                        style={{ width:"100%", padding:"10px 14px", border:"1px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none" }}
                    />
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    style={{
                        width:"100%", padding:"12px", border:"none",
                        borderRadius:10, cursor:"pointer", fontSize:15,
                        fontWeight:600, color:"white",
                        background:"linear-gradient(135deg,#0066FF,#0044CC)",
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? "Signing in..." : "Sign In"}
                </button>
            </div>
        </div>
    );
}