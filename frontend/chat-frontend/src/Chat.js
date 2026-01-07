// Chat.jsx
import React, { useState, useEffect } from "react";
import { socket } from "./socket";
import AdminPanel from "./AdminPanel";

export default function Chat({ user, onLogout }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [room, setRoom] = useState(user.room || "global");
  const [online, setOnline] = useState([]);
  const [typing, setTyping] = useState(null);

  // 👉 Typing indicator listener
  useEffect(() => {
    socket.on("user_typing", username => {
      setTyping(username);

      // Auto-clear after 2 seconds
      const timer = setTimeout(() => setTyping(null), 2000);
      return () => clearTimeout(timer);
    });

    return () => {
      socket.off("user_typing");
    };
  }, []);

  // 👉 Online users
  useEffect(() => {
    socket.on("online_users", setOnline);
    return () => socket.off("online_users");
  }, []);

  // 👉 Join initial room + set up message listeners
  useEffect(() => {
    // Join initial room from login
    socket.emit("join_room", user.room || "global");

    // Load history
    socket.on("chat_history", history => {
      setMessages(history);
    });

    // Receive new messages
    socket.on("new_message", msg => {
      if (msg.room === (user.room || "global")) {
        setMessages(prev => [...prev, msg]);
      }
    });

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
    };
  }, []); // 🔹 run once on mount

  // 👉 Sending a message
  function send() {
    if (!message.trim()) return;

    socket.emit("send_message", {
      text: message,
      room: room || "global" // send to currently selected room
    });

    setMessage("");
  }

  // 👉 Emit typing event on input change
  function handleType(e) {
    setMessage(e.target.value);
    socket.emit("typing");
  }

  // 👉 Switch room manually
  function switchRoom() {
    if (!room) return;
    socket.emit("join_room", room);
    setMessages([]); // clear and wait for new history
  }

  return (
    <div style={{ padding: 20 }}>
      <h3>
        Logged in as: {user.username} <br />
        Default room: {user.room}
      </h3>

      <button onClick={onLogout}>Logout</button>

      {user.isAdmin && !showAdmin && (
        <button onClick={() => setShowAdmin(true)} style={{ marginLeft: 10 }}>
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
        <label>Active room: </label>
        <select value={room} onChange={e => setRoom(e.target.value)}>
          <option value="global">global</option>
          <option value="arsenal">arsenal</option>
          <option value="coding">coding</option>
        </select>
        <button onClick={switchRoom} style={{ marginLeft: 10 }}>
          Switch
        </button>
      </div>

      {/* Typing indicator */}
      {typing && <p style={{ fontStyle: "italic" }}>{typing} is typing...</p>}

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
          onChange={handleType}
          style={{ width: "70%", marginRight: 10 }}
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
