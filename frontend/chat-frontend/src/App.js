import React, { useState } from "react";
import Login from "./Login";
import Chat  from "./Chat";

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ng_user_v3") || "null"); }
    catch { return null; }
  });

  function handleLogin(u) {
    localStorage.setItem("ng_user_v3", JSON.stringify(u));
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem("ng_user_v3");
    setUser(null);
  }

  return user ? <Chat user={user} onLogout={handleLogout} /> : <Login onLogin={handleLogin} />;
}
