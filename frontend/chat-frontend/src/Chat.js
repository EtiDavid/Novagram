import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { socket } from "./socket";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

// ─── COLOUR PALETTE ──────────────────────────────────────────────
const C = {
  bg:      "#080c14", sidebar: "#0b1120", panel: "#0f1623",
  border:  "rgba(255,255,255,0.06)", text: "#e2e8f0",
  sub:     "rgba(255,255,255,0.38)", accent: "#38bdf8",
  sent:    "#1e3a5f", recv: "#131e30",
  hover:   "rgba(255,255,255,0.04)", active: "rgba(56,189,248,0.1)",
  input:   "rgba(255,255,255,0.05)", green: "#4ade80",
  yellow:  "#facc15", red: "#f87171", orange: "#fb923c"
};

// ─── HELPERS ─────────────────────────────────────────────────────
function initials(n = "") { return n.slice(0, 2).toUpperCase(); }
function dmKey(a, b)      { return [a, b].sort().join("::"); }
function fmtTime(d)       { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function fmtDate(d)       { return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }

// ─── AVATAR ──────────────────────────────────────────────────────
function Avatar({ username, color, url, size = 38, status }) {
  const dot = status === "online" ? C.green : status === "away" ? C.yellow : null;
  return (
      <div style={{ position: "relative", flexShrink: 0 }}>
        {url
            ? <img src={url} alt={username} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{
              width: size, height: size, borderRadius: "50%",
              background: color || "#334155",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: size * 0.35, fontWeight: 700, color: "#fff", userSelect: "none"
            }}>{initials(username)}</div>
        }
        {dot && <div style={{
          position: "absolute", bottom: 1, right: 1,
          width: 10, height: 10, borderRadius: "50%",
          background: dot, border: `2px solid ${C.sidebar}`
        }} />}
      </div>
  );
}

// ─── TICKS ───────────────────────────────────────────────────────
function Ticks({ status }) {
  if (!status || status === "sent")      return <span style={{ fontSize: 12, color: C.sub }}>✓</span>;
  if (status === "delivered")            return <span style={{ fontSize: 12, color: C.sub }}>✓✓</span>;
  return <span style={{ fontSize: 12, color: C.green }}>✓✓</span>;
}

// ─── STATUS BADGE ────────────────────────────────────────────────
function StatusBadge({ status }) {
  const label = status === "online" ? "Online" : status === "away" ? "Away" : "Offline";
  const color = status === "online" ? C.green  : status === "away" ? C.yellow : C.sub;
  return <span style={{ fontSize: 12, color }}>● {label}</span>;
}

// ─── ADD BUTTON — dynamic pending state ──────────────────────────
function AddButton({ username, contacts, pendingContacts, onAdd, size = "normal" }) {
  const isContact = contacts.includes(username);
  const isPending = pendingContacts.has(username);

  const small = size === "small";
  const base  = {
    padding:      small ? "4px 10px" : "6px 14px",
    borderRadius: 8, border: "none", cursor: "pointer",
    fontSize:     small ? 11 : 12, fontWeight: 700, fontFamily: "inherit",
    transition:   "all 0.2s"
  };

  if (isContact) {
    return <span style={{ fontSize: small ? 11 : 12, color: C.green }}>✓ Contact</span>;
  }
  if (isPending) {
    return (
        <span style={{
          ...base, cursor: "default",
          background: "rgba(250,204,21,0.12)", color: C.yellow
        }}>⏳ Pending</span>
    );
  }
  return (
      <button
          onClick={e => { e.stopPropagation(); onAdd(username); }}
          style={{
            ...base,
            background: small
                ? "rgba(56,189,248,0.15)"
                : "linear-gradient(135deg,#38bdf8,#8b5cf6)",
            color: small ? C.accent : "#fff"
          }}>
        Add
      </button>
  );
}

// ─── AVATAR UPLOAD ───────────────────────────────────────────────
function AvatarUpload({ user, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert("Max 2MB");
    setUploading(true);
    try {
      const r1  = await fetch(`${API}/api/avatar/presign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, contentType: file.type })
      });
      const { uploadUrl, publicUrl } = await r1.json();
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      await fetch(`${API}/api/avatar`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, avatarUrl: publicUrl })
      });
      onUpdate(publicUrl);
    } catch { alert("Upload failed. Check S3 is configured."); }
    finally { setUploading(false); }
  }

  return (
      <>
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <button onClick={() => ref.current.click()} style={{
          background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.sub, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit"
        }}>{uploading ? "Uploading…" : "Change photo"}</button>
      </>
  );
}

// ─── ADMIN PANEL ─────────────────────────────────────────────────
function AdminPanel({ onClose, groupRequests }) {
  const [users, setUsers]     = useState([]);
  const [rooms, setRooms]     = useState([]);
  const [newRoom, setNewRoom] = useState("");
  const [tab, setTab]         = useState("users");

  useEffect(() => {
    socket.emit("get_users");
    socket.emit("get_rooms");
    socket.on("users_list", setUsers);
    socket.on("rooms_list", list => setRooms(["global", ...list.map(r => r.name)]));
    return () => { socket.off("users_list"); socket.off("rooms_list"); };
  }, []);

  const btn = (v = "default") => ({
    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600, fontFamily: "inherit",
    background: v === "danger"  ? "rgba(248,113,113,0.15)"
        : v === "success" ? "rgba(74,222,128,0.15)"
            : v === "primary" ? "linear-gradient(135deg,#38bdf8,#8b5cf6)"
                : "rgba(255,255,255,0.07)",
    color: v === "danger" ? C.red : v === "success" ? C.green : "#fff"
  });

  return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, backdropFilter: "blur(8px)"
      }} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{
          background: "#0f1623", border: `1px solid ${C.border}`, borderRadius: 24,
          padding: 28, width: 500, maxWidth: "92vw", maxHeight: "82vh", overflowY: "auto"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Admin Panel</span>
            <button style={btn()} onClick={onClose}>✕ Close</button>
          </div>

          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
            {["users", "rooms", "requests"].map(t => (
                <div key={t} onClick={() => setTab(t)} style={{
                  flex: 1, textAlign: "center", padding: "8px 0",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: tab === t ? C.accent : C.sub,
                  borderBottom: tab === t ? `2px solid ${C.accent}` : "2px solid transparent"
                }}>
                  {t}{t === "requests" && groupRequests.length > 0 ? ` (${groupRequests.length})` : ""}
                </div>
            ))}
          </div>

          {tab === "users" && users.map(u => (
              <div key={u._id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.02)", marginBottom: 6
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar username={u.username} color={u.avatarColor} url={u.avatarUrl} size={32} />
                  <span style={{ fontSize: 14, color: C.text }}>{u.username}</span>
                  {u.isAdmin && <span style={{ fontSize: 10, color: C.accent }}>ADMIN</span>}
                </div>
                {!u.isAdmin && (
                    <button style={btn("danger")} onClick={() => socket.emit("delete_user", u.username)}>Delete</button>
                )}
              </div>
          ))}

          {tab === "rooms" && (
              <div>
                {rooms.map(r => (
                    <div key={r} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 12,
                      background: "rgba(255,255,255,0.02)", marginBottom: 6
                    }}>
                      <span style={{ fontSize: 14, color: C.text }}>{r === "global" ? "🌐" : "#"} {r}</span>
                      {r !== "global" && (
                          <button style={btn("danger")} onClick={() => socket.emit("delete_room", r)}>Delete</button>
                      )}
                    </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                      style={{
                        flex: 1, background: C.input, border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: "8px 12px", color: C.text,
                        fontSize: 13, outline: "none", fontFamily: "inherit"
                      }}
                      placeholder="New room name" value={newRoom} onChange={e => setNewRoom(e.target.value)}
                  />
                  <button style={btn("primary")} onClick={() => {
                    if (newRoom.trim()) { socket.emit("create_room", newRoom.trim()); setNewRoom(""); }
                  }}>Create</button>
                </div>
              </div>
          )}

          {tab === "requests" && (
              <div>
                {groupRequests.length === 0
                    ? <div style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No pending requests</div>
                    : groupRequests.map((r, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 12px", borderRadius: 12,
                          background: "rgba(255,255,255,0.02)", marginBottom: 6
                        }}>
                          <div>
                            <span style={{ fontSize: 13, color: C.text }}>{r.username}</span>
                            <span style={{ fontSize: 12, color: C.sub }}> → </span>
                            <span style={{ fontSize: 13, color: C.accent }}>#{r.groupName}</span>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button style={btn("success")} onClick={() => socket.emit("approve_group_request", { username: r.username, groupName: r.groupName })}>Approve</button>
                            <button style={btn("danger")}  onClick={() => socket.emit("reject_group_request",  { username: r.username, groupName: r.groupName })}>Reject</button>
                          </div>
                        </div>
                    ))
                }
              </div>
          )}
        </div>
      </div>
  );
}

// ─── CONTACT REQUESTS PANEL ──────────────────────────────────────
function ContactRequestsPanel({ requests, onClose }) {
  if (!requests.length) return null;
  return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, backdropFilter: "blur(8px)"
      }} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{
          background: "#0f1623", border: `1px solid ${C.border}`,
          borderRadius: 24, padding: 28, width: 420, maxWidth: "92vw"
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 20 }}>
            Contact Requests ({requests.length})
          </div>
          {requests.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px", borderRadius: 12, background: "rgba(255,255,255,0.02)", marginBottom: 8
              }}>
                <span style={{ fontSize: 14, color: C.text }}>{r.from}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { socket.emit("accept_contact_request", { from: r.from }); onClose(); }}
                          style={{
                            padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                            background: "rgba(74,222,128,0.15)", color: C.green,
                            fontSize: 12, fontWeight: 600, fontFamily: "inherit"
                          }}>Accept</button>
                  <button onClick={() => socket.emit("reject_contact_request", { from: r.from })}
                          style={{
                            padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                            background: "rgba(248,113,113,0.15)", color: C.red,
                            fontSize: 12, fontWeight: 600, fontFamily: "inherit"
                          }}>Decline</button>
                </div>
              </div>
          ))}
        </div>
      </div>
  );
}

// ─── SEARCH PANEL ────────────────────────────────────────────────
function SearchUsers({ me, contacts, pendingContacts, onAdd, onClose, presence }) {
  const [q, setQ]           = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const res  = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}&me=${me}`);
      const data = await res.json();
      setResults(data);
    }, 300);
    return () => clearTimeout(t);
  }, [q, me]);

  return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, backdropFilter: "blur(8px)"
      }} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{
          background: "#0f1623", border: `1px solid ${C.border}`,
          borderRadius: 24, padding: 28, width: 440, maxWidth: "92vw"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Find People</span>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 20 }}>✕</button>
          </div>
          <input
              autoFocus
              style={{
                width: "100%", background: C.input, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "10px 14px", color: C.text, fontSize: 14,
                outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 16
              }}
              placeholder="Search by username…" value={q} onChange={e => setQ(e.target.value)}
          />
          {results.map(u => (
              <div key={u.username} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 12,
                background: "rgba(255,255,255,0.02)", marginBottom: 6
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar username={u.username} color={u.avatarColor} url={u.avatarUrl} size={36}
                          status={presence[u.username] || "offline"} />
                  <div>
                    <div style={{ fontSize: 14, color: C.text }}>{u.username}</div>
                    <StatusBadge status={presence[u.username] || "offline"} />
                  </div>
                </div>
                <AddButton
                    username={u.username}
                    contacts={contacts}
                    pendingContacts={pendingContacts}
                    onAdd={onAdd}
                />
              </div>
          ))}
          {q && results.length === 0 && (
              <div style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "16px 0" }}>
                No users found for "{q}"
              </div>
          )}
        </div>
      </div>
  );
}

// ─── MAIN CHAT ────────────────────────────────────────────────────
export default function Chat({ user: initialUser, onLogout }) {
  const [user, setUser]           = useState(initialUser);
  const [rooms, setRooms]         = useState(["global"]);
  const [allUsers, setAllUsers]   = useState([]);
  const [presence, setPresence]   = useState({});
  const [contacts, setContacts]   = useState(initialUser.contacts || []);
  const [myGroups, setMyGroups]   = useState(initialUser.groups || ["global"]);

  // Pending contact requests that THIS user has sent (for dynamic button)
  const [pendingContacts, setPendingContacts] = useState(new Set());

  const [tab, setTab]               = useState("rooms");
  const [activeRoom, setActiveRoom] = useState("global");
  const [activeDm, setActiveDm]     = useState(null);

  const [messages, setMessages]       = useState({});
  const [msgStatuses, setMsgStatuses] = useState({});
  const [input, setInput]             = useState("");
  const [typing, setTyping]           = useState({});

  const [contactRequests, setContactRequests] = useState([]);
  const [groupRequests, setGroupRequests]     = useState([]);
  const [showAdmin, setShowAdmin]             = useState(false);
  const [showSearch, setShowSearch]           = useState(false);
  const [showContactReqs, setShowContactReqs] = useState(false);
  const [showProfile, setShowProfile]         = useState(false);

  const bottomRef    = useRef(null);
  const typingTimers = useRef({});
  const activityRef  = useRef(null);

  const activeKey = activeDm ? dmKey(user.username, activeDm) : activeRoom;

  const currentMsgs = useMemo(
      () => messages[activeKey] || [],
      [messages, activeKey]
  );

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [currentMsgs]);

  // Activity ping
  useEffect(() => {
    activityRef.current = setInterval(() => socket.emit("activity"), 90 * 1000);
    const ping = () => socket.emit("activity");
    window.addEventListener("mousemove", ping);
    window.addEventListener("keydown",   ping);
    return () => {
      clearInterval(activityRef.current);
      window.removeEventListener("mousemove", ping);
      window.removeEventListener("keydown",   ping);
    };
  }, []);

  // Auth on connect
  const authenticate = useCallback(() => {
    socket.emit("login", { username: user.username, pin: user.pin });
  }, [user.username, user.pin]);

  useEffect(() => {
    socket.on("connect", authenticate);
    if (socket.connected) authenticate();
    return () => socket.off("connect", authenticate);
  }, [authenticate]);

  // Fetch all users
  useEffect(() => {
    fetch(`${API}/api/users`)
        .then(r => r.json())
        .then(data => setAllUsers(data.filter(u => u.username !== user.username)))
        .catch(() => {});
  }, [user.username]);

  // Login success
  useEffect(() => {
    socket.on("login_success", data => {
      setContacts(data.contacts || []);
      setMyGroups(data.groups  || ["global"]);
    });
    return () => socket.off("login_success");
  }, []);

  // Rooms
  useEffect(() => {
    socket.emit("get_rooms");
    socket.on("rooms_list", list => setRooms(["global", ...list.map(r => r.name)]));
    return () => socket.off("rooms_list");
  }, []);

  // Presence
  useEffect(() => {
    socket.on("presence_update", update => setPresence(prev => ({ ...prev, ...update })));
    return () => socket.off("presence_update");
  }, []);

  // Room messages
  useEffect(() => {
    socket.on("chat_history", ({ room: r, messages: hist }) => {
      if (!r || !hist) return;
      setMessages(prev => ({ ...prev, [r]: hist }));
    });
    socket.on("new_message", msg => {
      setMessages(prev => ({ ...prev, [msg.room]: [...(prev[msg.room] || []), msg] }));
    });
    return () => { socket.off("chat_history"); socket.off("new_message"); };
  }, []);

  // DM messages
  useEffect(() => {
    socket.on("dm_history", ({ dmKey: key, messages: hist }) => {
      setMessages(prev => ({ ...prev, [key]: hist }));
    });
    socket.on("new_dm", msg => {
      const key = msg.dmKey;
      setMessages(prev => ({ ...prev, [key]: [...(prev[key] || []), msg] }));
    });
    return () => { socket.off("dm_history"); socket.off("new_dm"); };
  }, []);

  // Message status
  useEffect(() => {
    socket.on("msg_status_update", ({ messageId, status }) => {
      setMsgStatuses(prev => ({ ...prev, [messageId]: status }));
    });
    return () => socket.off("msg_status_update");
  }, []);

  // Mark read trigger
  useEffect(() => {
    socket.on("mark_read_trigger", ({ dmKey: key }) => socket.emit("mark_read", { dmKey: key }));
    return () => socket.off("mark_read_trigger");
  }, []);

  // Typing
  useEffect(() => {
    socket.on("user_typing", ({ username: u, room: r, dm: d }) => {
      if (u === user.username) return;
      const key = d ? dmKey(user.username, u) : r;
      setTyping(prev => ({ ...prev, [key]: u }));
      if (typingTimers.current[key]) clearTimeout(typingTimers.current[key]);
      typingTimers.current[key] = setTimeout(() => {
        setTyping(prev => { const n = { ...prev }; delete n[key]; return n; });
      }, 2500);
    });
    return () => socket.off("user_typing");
  }, [user.username]);

  // Contact requests
  useEffect(() => {
    socket.on("contact_requests", reqs => {
      setContactRequests(prev => {
        const existing = new Set(prev.map(r => r.from));
        return [...prev, ...reqs.filter(r => !existing.has(r.from))];
      });
      setShowContactReqs(true);
    });
    socket.on("contact_accepted", ({ username }) => {
      setContacts(prev => [...new Set([...prev, username])]);
      // Remove from pending — they are now a contact
      setPendingContacts(prev => { const n = new Set(prev); n.delete(username); return n; });
      socket.emit("load_dm", { with: username });
    });
    socket.on("contact_request_sent", ({ to }) => {
      // Backend confirms request was sent — update button to pending
      setPendingContacts(prev => new Set([...prev, to]));
    });
    return () => {
      socket.off("contact_requests");
      socket.off("contact_accepted");
      socket.off("contact_request_sent");
    };
  }, []);

  // Group requests
  useEffect(() => {
    socket.on("group_requests",          reqs => setGroupRequests(reqs));
    socket.on("group_request_sent",      () => {});
    socket.on("group_request_approved",  ({ groupName }) => {
      setMyGroups(prev => [...new Set([...prev, groupName])]);
      socket.emit("join_room", groupName);
    });
    return () => {
      socket.off("group_requests");
      socket.off("group_request_sent");
      socket.off("group_request_approved");
    };
  }, []);

  // ── ADD CONTACT handler (shared by SearchUsers + People tab) ──
  function handleAddContact(username) {
    socket.emit("send_contact_request", { to: username });
    // Optimistically mark as pending — server will confirm via contact_request_sent
    setPendingContacts(prev => new Set([...prev, username]));
  }

  function selectRoom(r) {
    setActiveRoom(r); setActiveDm(null);
    if (myGroups.includes(r)) socket.emit("join_room", r);
  }

  function selectDm(username) {
    setActiveDm(username); setActiveRoom(null);
    socket.emit("load_dm", { with: username });
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    if (activeDm) socket.emit("send_dm", { text, to: activeDm });
    else          socket.emit("send_message", { text, room: activeRoom });
    setInput("");
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleChange(e) {
    setInput(e.target.value);
    if (activeDm) socket.emit("typing", { dm: activeDm });
    else          socket.emit("typing", { room: activeRoom });
  }

  function groupedMsgs(msgs) {
    const out = []; let lastDate = null;
    msgs.forEach(m => {
      const d = fmtDate(m.createdAt);
      if (d !== lastDate) { out.push({ type: "date", label: d }); lastDate = d; }
      out.push({ type: "msg", data: m });
    });
    return out;
  }

  const grouped       = groupedMsgs(currentMsgs);
  const typingUser    = typing[activeKey];
  const activeStatus  = activeDm ? (presence[activeDm] || "offline") : null;
  const contactsList  = contacts.filter(c => c !== user.username);
  const pendingCount  = contactRequests.length;
  const groupReqCount = groupRequests.length;
  const userMap       = Object.fromEntries(allUsers.map(u => [u.username, u]));

  // ── RENDER ──────────────────────────────────────────────────────
  return (
      <div style={{
        display: "flex", height: "100vh", background: C.bg,
        fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text, overflow: "hidden"
      }}>

        {/* ── SIDEBAR ── */}
        <div style={{
          width: 300, minWidth: 260, background: C.sidebar,
          borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column"
        }}>
          {/* Header */}
          <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{
              fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px",
              background: "linear-gradient(135deg,#38bdf8,#8b5cf6)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>Novagram</span>
              <div style={{ display: "flex", gap: 6 }}>
                {/* Search */}
                <button onClick={() => setShowSearch(true)} style={{
                  width: 32, height: 32, borderRadius: 9, background: C.hover,
                  border: `1px solid ${C.border}`, cursor: "pointer", color: C.sub, fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>🔍</button>
                {/* Notifications */}
                <button onClick={() => setShowContactReqs(true)} style={{
                  width: 32, height: 32, borderRadius: 9, background: C.hover,
                  border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 15, position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.sub
                }}>
                  🔔
                  {pendingCount > 0 && (
                      <span style={{
                        position: "absolute", top: -4, right: -4,
                        background: C.red, color: "#fff", borderRadius: "50%",
                        width: 16, height: 16, fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>{pendingCount}</span>
                  )}
                </button>
                {/* Admin */}
                {user.isAdmin && (
                    <button onClick={() => setShowAdmin(true)} style={{
                      width: 32, height: 32, borderRadius: 9, background: C.hover,
                      border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 15, position: "relative",
                      display: "flex", alignItems: "center", justifyContent: "center", color: C.sub
                    }}>
                      ⚙️
                      {groupReqCount > 0 && (
                          <span style={{
                            position: "absolute", top: -4, right: -4,
                            background: C.orange, color: "#fff", borderRadius: "50%",
                            width: 16, height: 16, fontSize: 9, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>{groupReqCount}</span>
                      )}
                    </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            {["Rooms", "DMs", "People"].map(t => (
                <div key={t} onClick={() => setTab(t.toLowerCase())} style={{
                  flex: 1, textAlign: "center", padding: "9px 4px",
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.07em", cursor: "pointer",
                  color: tab === t.toLowerCase() ? C.accent : C.sub,
                  borderBottom: tab === t.toLowerCase() ? `2px solid ${C.accent}` : "2px solid transparent"
                }}>{t}</div>
            ))}
          </div>

          {/* Lists */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* ROOMS */}
            {tab === "rooms" && rooms.map(r => {
              const isMember = user.isAdmin || myGroups.includes(r);
              const lastMsg  = (messages[r] || []).slice(-1)[0];
              const isActive = !activeDm && activeRoom === r;
              return (
                  <div key={r} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 16px", cursor: "pointer",
                    background: isActive ? C.active : "transparent",
                    borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent"
                  }} onClick={() => {
                    if (isMember) selectRoom(r);
                    else socket.emit("request_group_join", { groupName: r });
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      background: isActive ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
                    }}>{r === "global" ? "🌐" : "#"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r}</div>
                      <div style={{ fontSize: 11, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {isMember ? (lastMsg?.text || "No messages yet") : "Tap to request access"}
                      </div>
                    </div>
                    {!isMember && <span style={{ fontSize: 10, color: C.orange }}>🔒</span>}
                  </div>
              );
            })}

            {/* DMS */}
            {tab === "dms" && contactsList.map(username => {
              const u       = userMap[username] || {};
              const key     = dmKey(user.username, username);
              const lastMsg = (messages[key] || []).slice(-1)[0];
              const isActive = activeDm === username;
              return (
                  <div key={username} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "11px 16px", cursor: "pointer",
                    background: isActive ? C.active : "transparent",
                    borderLeft: isActive ? `3px solid ${C.accent}` : "3px solid transparent"
                  }} onClick={() => selectDm(username)}>
                    <Avatar username={username} color={u.avatarColor} url={u.avatarUrl} size={38}
                            status={presence[username] || "offline"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{username}</div>
                      <div style={{ fontSize: 11, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {lastMsg?.text || "Start a conversation"}
                      </div>
                    </div>
                  </div>
              );
            })}

            {/* PEOPLE */}
            {tab === "people" && allUsers.map(u => (
                <div key={u.username} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 16px", cursor: "pointer"
                }} onClick={() => { if (contacts.includes(u.username)) { setTab("dms"); selectDm(u.username); } }}>
                  <Avatar username={u.username} color={u.avatarColor} url={u.avatarUrl} size={36}
                          status={presence[u.username] || "offline"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{u.username}</div>
                    <StatusBadge status={presence[u.username] || "offline"} />
                  </div>
                  <AddButton
                      username={u.username}
                      contacts={contacts}
                      pendingContacts={pendingContacts}
                      onAdd={handleAddContact}
                      size="small"
                  />
                </div>
            ))}
          </div>

          {/* Self footer */}
          <div style={{
            padding: "12px 16px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10
          }}>
            <div onClick={() => setShowProfile(p => !p)} style={{ cursor: "pointer" }}>
              <Avatar username={user.username} color={user.avatarColor} url={user.avatarUrl} size={34} status="online" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{user.username}</div>
              <div style={{ fontSize: 11, color: C.green }}>● Online</div>
            </div>
            <button onClick={onLogout} title="Logout" style={{
              background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: 18
            }}>⏻</button>
          </div>

          {showProfile && (
              <div style={{ padding: "10px 16px 14px", borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                <AvatarUpload user={user} onUpdate={url => {
                  setUser(prev => ({ ...prev, avatarUrl: url }));
                  localStorage.setItem("ng_user_v3", JSON.stringify({ ...user, avatarUrl: url }));
                }} />
              </div>
          )}
        </div>

        {/* ── MAIN PANEL ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
          {/* Header */}
          <div style={{
            padding: "13px 20px", borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 12, background: C.panel
          }}>
            {activeDm
                ? <Avatar username={activeDm} color={userMap[activeDm]?.avatarColor}
                          url={userMap[activeDm]?.avatarUrl} size={38} status={activeStatus} />
                : <div style={{
                  width: 38, height: 38, borderRadius: 11, background: "rgba(56,189,248,0.13)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
                }}>{activeRoom === "global" ? "🌐" : "#"}</div>
            }
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {activeDm ? activeDm : `# ${activeRoom}`}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>
                {activeDm
                    ? <StatusBadge status={activeStatus} />
                    : `${Object.values(presence).filter(s => s === "online").length} online`}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 4px", display: "flex", flexDirection: "column", gap: 2 }}>
            {currentMsgs.length === 0 && (
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", color: C.sub, gap: 10
                }}>
                  <div style={{ fontSize: 44 }}>💬</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>No messages yet</div>
                  <div style={{ fontSize: 13 }}>
                    {activeDm && !contacts.includes(activeDm)
                        ? "Send a message — they'll see it once they accept your request"
                        : "Start the conversation"}
                  </div>
                </div>
            )}

            {grouped.map((item, i) => {
              if (item.type === "date") return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    margin: "10px 0", color: C.sub, fontSize: 11
                  }}>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                    <span>{item.label}</span>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                  </div>
              );

              const m         = item.data;
              const mine      = m.username === user.username;
              const u         = userMap[m.username] || {};
              const msgStatus = msgStatuses[m._id] || m.status || "sent";

              return (
                  <div key={m._id || i} style={{
                    display: "flex", flexDirection: mine ? "row-reverse" : "row",
                    alignItems: "flex-end", gap: 8, marginBottom: 2
                  }}>
                    {!mine && <Avatar username={m.username} color={u.avatarColor} url={u.avatarUrl} size={28} />}
                    <div style={{
                      maxWidth: "65%", padding: "9px 13px",
                      borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      background: mine ? C.sent : C.recv,
                      opacity: m.pending ? 0.6 : 1
                    }}>
                      {!mine && !activeDm && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 3 }}>
                            {m.username}
                          </div>
                      )}
                      <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" }}>{m.text}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 3 }}>
                        {m.pending && <span style={{ fontSize: 10, color: C.orange }}>pending</span>}
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{fmtTime(m.createdAt)}</span>
                        {mine && <Ticks status={msgStatus} />}
                      </div>
                    </div>
                    {mine && <Avatar username={user.username} color={user.avatarColor} url={user.avatarUrl} size={28} />}
                  </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Typing */}
          <div style={{ padding: "2px 20px 6px", minHeight: 22, fontSize: 12, color: C.sub, fontStyle: "italic" }}>
            {typingUser && `${typingUser} is typing…`}
          </div>

          {/* Input */}
          <div style={{
            padding: "10px 20px 14px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "flex-end", gap: 10, background: C.panel
          }}>
          <textarea
              style={{
                flex: 1, background: C.input, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: "10px 16px", color: C.text, fontSize: 14,
                outline: "none", fontFamily: "inherit", resize: "none", maxHeight: 120, lineHeight: 1.5
              }}
              placeholder={activeDm ? `Message ${activeDm}…` : `Message #${activeRoom}…`}
              value={input} onChange={handleChange} onKeyDown={handleKey} rows={1}
          />
            <button onClick={send} style={{
              width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
              background: input.trim() ? "linear-gradient(135deg,#38bdf8,#8b5cf6)" : "rgba(255,255,255,0.07)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, transition: "background 0.2s"
            }}>➤</button>
          </div>
        </div>

        {/* Overlays */}
        {showAdmin       && <AdminPanel onClose={() => setShowAdmin(false)} groupRequests={groupRequests} />}
        {showContactReqs && contactRequests.length > 0 && (
            <ContactRequestsPanel
                requests={contactRequests}
                onClose={() => { setShowContactReqs(false); setContactRequests([]); }}
            />
        )}
        {showSearch && (
            <SearchUsers
                me={user.username} contacts={contacts}
                pendingContacts={pendingContacts} onAdd={handleAddContact}
                presence={presence} onClose={() => setShowSearch(false)}
            />
        )}
      </div>
  );
}