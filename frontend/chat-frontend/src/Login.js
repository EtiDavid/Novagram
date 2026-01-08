import React, { useState, useEffect } from "react";
import { socket } from "./socket";

export default function Login({ onLogin }) {

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [room, setRoom] = useState("global");
  const [rooms, setRooms] = useState(["global"]);
  const [error, setError] = useState("");


  useEffect(() => {
    socket.emit("get_rooms");

    socket.on("rooms_list", list => {
      const names = ["global", ...list.map(r => r.name)];
      setRooms(names);
    });

    return () => socket.off("rooms_list");
  }, []);


  function submit() {

    setError("");

    socket.emit("login", { username, pin });

    socket.once("login_success", user => {

      const loggedInUser = {
        ...user,
        room,
        pin   // ⭐ store the PIN here
      };

      onLogin(loggedInUser);
    });

    socket.once("login_failed", msg => {
      setError(msg);
    });
  }


  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>

      <input
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
      /><br /><br />

      <input
        placeholder="4-digit PIN"
        type="password"
        value={pin}
        onChange={e => setPin(e.target.value)}
      /><br /><br />

      <label>Select room:</label><br />

      <select value={room} onChange={e => setRoom(e.target.value)}>
        {rooms.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <br /><br />

      <button onClick={submit}>Login</button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
