// App.jsx
import React, { useState } from "react";
import Login from "./Login";
import Chat from "./Chat";

export default function App() {

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("novagram_user");
    return saved ? JSON.parse(saved) : null;
  });

  function handleLogin(u) {
    localStorage.setItem("novagram_user", JSON.stringify(u));
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem("novagram_user");
    setUser(null);
  }

  return user ? (
    <Chat user={user} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
