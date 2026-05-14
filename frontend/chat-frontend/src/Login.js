import React, { useState, useEffect } from "react";
import { socket } from "./socket";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    socket.on("login_success", u => { setLoading(false); onLogin({ ...u, pin }); });
    socket.on("login_failed",  m => { setLoading(false); setError(m); });
    return () => { socket.off("login_success"); socket.off("login_failed"); };
  }, [onLogin, pin]);

  function submit(e) {
    e.preventDefault();
    if (!username.trim() || !pin.trim()) return setError("Username and PIN required");
    setError(""); setLoading(true);
    socket.emit("login", { username: username.trim(), pin });
  }

  return (
    <div style={{
      minHeight:"100vh", background:"linear-gradient(135deg,#080c14 0%,#0f1623 60%,#080c14 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'DM Sans','Segoe UI',sans-serif", position:"relative", overflow:"hidden"
    }}>
      {/* Ambient glows */}
      <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%",
        background:"radial-gradient(circle,rgba(56,189,248,0.06) 0%,transparent 70%)",
        top:"-10%", left:"-10%", pointerEvents:"none" }} />
      <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%",
        background:"radial-gradient(circle,rgba(139,92,246,0.05) 0%,transparent 70%)",
        bottom:"0%", right:"5%", pointerEvents:"none" }} />

      <div style={{
        background:"rgba(255,255,255,0.02)", backdropFilter:"blur(24px)",
        border:"1px solid rgba(255,255,255,0.07)", borderRadius:28,
        padding:"52px 44px", width:400, maxWidth:"90vw", position:"relative", zIndex:1
      }}>
        {/* Logo */}
        <div style={{ marginBottom:36, textAlign:"center" }}>
          <div style={{
            width:56, height:56, borderRadius:18, margin:"0 auto 16px",
            background:"linear-gradient(135deg,#38bdf8,#8b5cf6)",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:28
          }}>💬</div>
          <div style={{ fontSize:26, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.5px" }}>
            Novagram
          </div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.35)", marginTop:4 }}>
            Sign in to your account
          </div>
        </div>

        <form onSubmit={submit}>
          {["Username","PIN"].map((label, i) => (
            <div key={label} style={{ marginBottom:16 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700,
                letterSpacing:"0.1em", textTransform:"uppercase",
                color:"rgba(255,255,255,0.4)", marginBottom:7 }}>
                {label}
              </label>
              <input
                style={{
                  width:"100%", background:"rgba(255,255,255,0.05)",
                  border:"1px solid rgba(255,255,255,0.09)", borderRadius:14,
                  padding:"13px 16px", color:"#f1f5f9", fontSize:14,
                  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
                  transition:"border-color 0.2s"
                }}
                placeholder={i === 0 ? "your username" : "4-digit PIN"}
                type={i === 1 ? "password" : "text"}
                value={i === 0 ? username : pin}
                onChange={e => i === 0 ? setUsername(e.target.value) : setPin(e.target.value)}
                autoFocus={i === 0}
              />
            </div>
          ))}

          <button
            type="submit" disabled={loading}
            style={{
              width:"100%", padding:"14px",
              background:"linear-gradient(135deg,#38bdf8,#8b5cf6)",
              border:"none", borderRadius:14, color:"#fff",
              fontSize:15, fontWeight:700, cursor:"pointer",
              fontFamily:"inherit", marginTop:8,
              opacity: loading ? 0.7 : 1, transition:"opacity 0.2s"
            }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && (
          <div style={{
            marginTop:14, padding:"10px 14px",
            background:"rgba(248,113,113,0.1)", border:"1px solid rgba(248,113,113,0.25)",
            borderRadius:10, color:"#f87171", fontSize:13
          }}>{error}</div>
        )}

        <div style={{ marginTop:20, fontSize:12, color:"rgba(255,255,255,0.2)", textAlign:"center" }}>
          New user? Sign in with any username + PIN to create an account.
        </div>
      </div>
    </div>
  );
}
