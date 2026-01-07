import React, { useState } from "react";
import Login from "./Login";
import Chat from "./Chat";
import { socket } from "./socket";

export default function App() {

  const [user, setUser] = useState(null);

  function logout() {
    socket.disconnect();
    window.location.reload();
  }

  if (!user) return <Login onLogin={setUser} />;

  return <Chat user={user} onLogout={logout} />;
}
