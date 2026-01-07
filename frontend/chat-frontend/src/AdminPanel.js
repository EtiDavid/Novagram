import React, { useState, useEffect } from "react";
import { socket } from "./socket";

export default function AdminPanel({ onClose }) {

  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [newRoom, setNewRoom] = useState("");
  const [resetUser, setResetUser] = useState("");
  const [newPin, setNewPin] = useState("");


  useEffect(() => {

    socket.emit("get_rooms");
    socket.emit("get_users");

    socket.on("rooms_list", setRooms);
    socket.on("users_list", setUsers);

    socket.on("rooms_updated", () => socket.emit("get_rooms"));
    socket.on("users_updated", () => socket.emit("get_users"));

    return () => {
      socket.off("rooms_list");
      socket.off("users_list");
      socket.off("rooms_updated");
      socket.off("users_updated");
    };

  }, []);


  function createRoom() {
    socket.emit("create_room", newRoom);
    setNewRoom("");
  }

  function deleteRoom(name) {
    socket.emit("delete_room", name);
  }

  function deleteUser(username) {
    socket.emit("delete_user", username);
  }


  function resetPin() {
    socket.emit("reset_pin", {
      username: resetUser,
      newPin
    });

    setResetUser("");
    setNewPin("");
  }


  return (
    <div style={{ padding: 20, border: "2px solid red" }}>

      <h2>Admin Panel</h2>

      <button onClick={onClose}>Close</button>

      <hr/>

      <h3>Rooms</h3>

      {rooms.map(r => (
        <div key={r._id}>
          {r.name}
          <button onClick={() => deleteRoom(r.name)}>Delete</button>
        </div>
      ))}

      <input
        value={newRoom}
        onChange={e => setNewRoom(e.target.value)}
        placeholder="Room name"
      />
      <button onClick={createRoom}>Create</button>

      <hr/>

      <h3>Users</h3>

      {users.map(u => (
        <div key={u._id}>
          {u.username} {u.isAdmin && "(admin)"}

          <button onClick={() => deleteUser(u.username)}>
            Delete
          </button>

          <button onClick={() => setResetUser(u.username)}>
            Reset PIN
          </button>
        </div>
      ))}


      {resetUser && (
        <div>
          <p>Reset PIN for {resetUser}</p>

          <input
            value={newPin}
            onChange={e => setNewPin(e.target.value)}
            placeholder="New 4-digit PIN"
          />

          <button onClick={resetPin}>Confirm</button>
          <button onClick={() => setResetUser("")}>Cancel</button>
        </div>
      )}

    </div>
  );
}
