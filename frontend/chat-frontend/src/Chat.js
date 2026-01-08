import React, { useState, useEffect } from "react";
import { socket } from "./socket";
import AdminPanel from "./AdminPanel";

export default function Chat({ user, onLogout }) {

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [room, setRoom] = useState(user.room || "global");
  const [rooms, setRooms] = useState(["global"]);
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // ===================================================
  // SOCKET AUTH — re-login on connect / refresh
  // ===================================================
  useEffect(() => {
    function authenticateSocket() {
      socket.emit("login", {
        username: user.username,
        pin: user.pin
      });

      socket.emit("join_room", room);
    }

    socket.on("connect", authenticateSocket);

    if (socket.connected) {
      authenticateSocket();
    }

    return () => socket.off("connect", authenticateSocket);
  }, [user.username, user.pin, room]);

  // ===================================================
  // LOAD ROOMS
  // ===================================================
  useEffect(() => {
    socket.emit("get_rooms");

    socket.on("rooms_list", list => {
      const names = ["global", ...list.map(r => r.name)];
      setRooms(names);
    });

    return () => socket.off("rooms_list");
  }, []);

  // ===================================================
  // JOIN ROOM + LOAD HISTORY
  // ===================================================
  useEffect(() => {
    socket.emit("join_room", room);

    socket.on("chat_history", history => {
      setMessages(history);
    });

    socket.on("new_message", msg => {
      if (msg.room === room) {
        setMessages(prev => [...prev, msg]);
      }
    });

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
    };
  }, [room]);

  // ===================================================
  // ONLINE USERS
  // ===================================================
  useEffect(() => {
    socket.on("online_users", setOnline);
    return () => socket.off("online_users");
  }, []);

  // ===================================================
  // TYPING INDICATOR (ROOM-AWARE, SELF-SUPPRESSED)
  // ===================================================
  useEffect(() => {
    socket.on("user_typing", username => {
      if (username === user.username) return;

      setTyping(username);

      const timer = setTimeout(() => setTyping(null), 2000);
      return () => clearTimeout(timer);
    });

    return () => socket.off("user_typing");
  }, [user.username]);

  // ===================================================
  // SEND MESSAGE
  // ===================================================
  function send() {
    if (!message.trim()) return;

    socket.emit("send_message", {
      text: message,
      room
    });

    setMessage("");
  }

  return (
    <div style={{ padding: 20, position: "relative" }}>

      <h3>
        Logged in as: {user.username}<br />
        Room: {room}
      </h3>

      <button onClick={onLogout}>Logout</button>

      {user.isAdmin && !showAdmin && (
        <button
          onClick={() => setShowAdmin(true)}
          style={{ marginLeft: 10 }}
        >
          Admin Panel
        </button>
      )}

      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {/* Online users */}
      <h4 style={{ marginTop: 20 }}>Online Users</h4>
      <ul>
        {online.map(u => (
          <li key={u}>{u}</li>
        ))}
      </ul>

      {/* Room selector */}
      <div style={{ marginTop: 10 }}>
        <label>Room: </label>
        <select value={room} onChange={e => setRoom(e.target.value)}>
          {rooms.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Typing indicator — fixed position (no layout shift) */}
      {typing && (
        <div
          style={{
            position: "absolute",
            bottom: 70,
            left: 20,
            fontStyle: "italic",
            color: "#666",
            pointerEvents: "none"
          }}
        >
          {typing} is typing…
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          border: "1px solid gray",
          height: 250,
          overflow: "auto",
          marginTop: 20,
          padding: 8
        }}
      >
        {messages.map((m, i) => (
          <div key={m._id || i}>
            <strong>{m.username}</strong>: {m.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ marginTop: 10 }}>
        <input
          value={message}
          onChange={e => {
            setMessage(e.target.value);
            socket.emit("typing", room);
          }}
          style={{ width: "70%", marginRight: 10 }}
        />
        <button onClick={send}>Send</button>
      </div>

    </div>
  );
}
