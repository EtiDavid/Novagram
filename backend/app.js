require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "development"}` });

const express        = require("express");
const http           = require("http");
const cors           = require("cors");
const mongoose       = require("mongoose");
const Redis          = require("ioredis");

const Message        = require("./models/Message");
const User           = require("./models/User");
const Room           = require("./models/Room");
const ContactRequest = require("./models/ContactRequest");
const GroupRequest   = require("./models/GroupRequest");

const { logger, requestLogger } = require("./utils/logger");
const { loginRateLimiter, clearAttempts } = require("./middleware/rateLimiter");
const apiRoutes      = require("./routes/api");

// ─── EXPRESS ────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use("/api", apiRoutes);

const server = http.createServer(app);

// ─── REDIS ──────────────────────────────────────────────────────
let redis      = null;
let redisReady = false;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_AUTH = process.env.REDIS_AUTH || null;

if (REDIS_HOST) {
  redis = new Redis({
    host: REDIS_HOST, port: REDIS_PORT,
    password: REDIS_AUTH || undefined,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    retryStrategy: t => Math.min(t * 200, 5000),
    enableOfflineQueue: false
  });
  redis.on("ready",  () => { redisReady = true;  logger.info("REDIS_CONNECTED"); });
  redis.on("error",  err => { redisReady = false; logger.error("REDIS_ERROR", { error: err.message }); });
  redis.on("close",  () => { redisReady = false;  logger.warn("REDIS_DISCONNECTED"); });
} else {
  logger.warn("REDIS_SKIPPED", { reason: "REDIS_HOST not set" });
}

// ─── SOCKET.IO ──────────────────────────────────────────────────
const io = require("socket.io")(server, { cors: { origin: "*" } });

if (REDIS_HOST) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");
    const pub = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_AUTH || undefined });
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info("SOCKET_IO_REDIS_ADAPTER_ENABLED");
  } catch (e) {
    logger.warn("SOCKET_IO_REDIS_ADAPTER_SKIP", { reason: e.message });
  }
}

// ─── DATABASE  ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info("DB_CONNECTED", { host: mongoose.connection.host }))
  .catch(err => { logger.error("DB_ERROR", { error: err.message }); process.exit(1); });

// ─── HEALTH ─────────────────────────────────────────────────────
app.get("/health", async (_, res) => {
  const checks  = {};
  let   healthy = true;
  const dbState = mongoose.connection.readyState;
  checks.mongodb = dbState === 1 ? "ok" : "degraded";
  if (dbState !== 1) healthy = false;
  if (REDIS_HOST) { checks.redis = redisReady ? "ok" : "degraded"; if (!redisReady) healthy = false; }
  else checks.redis = "not_configured";
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", checks, ts: new Date().toISOString() });
});

// ─── HELPERS ────────────────────────────────────────────────────
function dmKey(a, b) { return [a, b].sort().join("::"); }

// ── PRESENCE ──
const AWAY_AFTER  = 5 * 60 * 1000;
const presenceMap = new Map();

async function setPresence(username, status) {
  if (redis && redisReady) {
    if (status === "offline") await redis.del(`presence:${username}`);
    else await redis.setex(`presence:${username}`, 60, status);
  }
  const existing = presenceMap.get(username) || {};
  presenceMap.set(username, { ...existing, status, lastActive: Date.now() });
}

async function getPresence(username) {
  if (redis && redisReady) {
    const val = await redis.get(`presence:${username}`).catch(() => null);
    return val || "offline";
  }
  return presenceMap.get(username)?.status || "offline";
}

async function broadcastPresence() {
  const allUsers = await User.find({}, "username").lean();
  const statuses = {};
  for (const u of allUsers) {
    statuses[u.username] = await getPresence(u.username);
  }
  io.emit("presence_update", statuses);
}

const presenceInterval = setInterval(async () => {
  const now = Date.now();
  for (const [username, data] of presenceMap.entries()) {
    if (data.status === "online" && now - data.lastActive > AWAY_AFTER) {
      await setPresence(username, "away");
    }
  }
  await broadcastPresence();
}, 60 * 1000);

// ── SESSION TRACKING ──
const userSessions = new Map();
const userSockets  = new Map();

function touchActivity(username) {
  const data = presenceMap.get(username);
  if (data) {
    data.lastActive = Date.now();
    if (data.status === "away") {
      setPresence(username, "online").then(() => broadcastPresence());
    }
  }
}

async function areContacts(a, b) {
  const user = await User.findOne({ username: a, contacts: b });
  return !!user;
}

// Sync admin into every existing room
async function syncAdminRooms(username, socketRef) {
  const allRooms     = await Room.find({}, "name").lean();
  const allRoomNames = ["global", ...allRooms.map(r => r.name)];
  await User.updateOne({ username }, { $set: { groups: allRoomNames } });
  if (socketRef) allRoomNames.forEach(r => socketRef.join(r));
  return allRoomNames;
}

// ─── SOCKET LOGIC ───────────────────────────────────────────────
io.on("connection", socket => {
  logger.info("SOCKET_CONNECTED", { socketId: socket.id });

  function requireLogin() {
    if (!socket.username) { socket.emit("error_msg", "Not authenticated"); return false; }
    return true;
  }

  // ─── LOGIN ────────────────────────────────────────────────────
  socket.on("login", async ({ username, pin }) => {
    if (!loginRateLimiter(socket.id)) {
      return socket.emit("login_failed", "Too many attempts. Try again in a minute.");
    }

    try {
      const cleanName = username.trim().toLowerCase();
      let user = await User.findOne({ username: cleanName });

      if (!user) {
        user = await User.create({
          username: cleanName,
          pin,
          isAdmin:  cleanName === "admin",
          groups:   ["global"]
        });
        logger.info("USER_CREATED", { username: cleanName });
      }

      if (user.pin !== pin) {
        return socket.emit("login_failed", "Invalid username or PIN");
      }

      clearAttempts(socket.id);
      socket.username = cleanName;
      socket.isAdmin  = user.isAdmin;

      if (!userSockets.has(cleanName)) userSockets.set(cleanName, new Set());
      userSockets.get(cleanName).add(socket.id);
      userSessions.set(socket.id, cleanName);

      // Admin auto-joins ALL rooms; regular user joins their groups
      let effectiveGroups = user.groups;
      if (user.isAdmin) {
        effectiveGroups = await syncAdminRooms(cleanName, socket);
      } else {
        for (const g of user.groups) socket.join(g);
      }

      await setPresence(cleanName, "online");

      socket.emit("login_success", {
        username:    cleanName,
        isAdmin:     user.isAdmin,
        avatarColor: user.avatarColor,
        avatarUrl:   user.avatarUrl,
        contacts:    user.contacts,
        groups:      effectiveGroups
      });

      const history = await Message.find({ room: "global", pending: false })
        .sort({ createdAt: 1 }).limit(100);
      socket.emit("chat_history", { room: "global", messages: history });

      for (const contact of user.contacts) {
        const socks = userSockets.get(contact);
        if (socks) socks.forEach(sid => io.to(sid).emit("presence_update", { [cleanName]: "online" }));
      }

      // Deliver offline pending messages
      const pendingMsgs = await Message.find({
        dmKey: { $regex: cleanName },
        status: "sent",
        pending: false
      });
      for (const msg of pendingMsgs) {
        socket.emit("new_dm", msg.toObject());
        await Message.updateOne({ _id: msg._id }, { status: "delivered" });
        const other = msg.dmKey.replace(cleanName, "").replace("::", "");
        const senderSocks = userSockets.get(other);
        if (senderSocks) {
          senderSocks.forEach(sid => io.to(sid).emit("msg_status_update", {
            messageId: msg._id.toString(), status: "delivered"
          }));
        }
      }

      const pendingRequests = await ContactRequest.find({ to: cleanName, status: "pending" });
      if (pendingRequests.length) socket.emit("contact_requests", pendingRequests);

      if (user.isAdmin) {
        const pendingGroupReqs = await GroupRequest.find({ status: "pending" });
        if (pendingGroupReqs.length) socket.emit("group_requests", pendingGroupReqs);
      }

      await broadcastPresence();
      logger.info("LOGIN_SUCCESS", { username: cleanName, isAdmin: user.isAdmin });

    } catch (err) {
      logger.error("LOGIN_ERROR", { error: err.message });
      socket.emit("login_failed", "Login error. Try again.");
    }
  });

  socket.on("activity", () => {
    if (socket.username) touchActivity(socket.username);
  });

  socket.on("typing", ({ room: r, dm }) => {
    if (!socket.username) return;
    touchActivity(socket.username);
    if (dm) {
      socket.to(`dm:${dmKey(socket.username, dm)}`).emit("user_typing", { username: socket.username, dm });
    } else {
      socket.to(r || "global").emit("user_typing", { username: socket.username, room: r || "global" });
    }
  });

  socket.on("send_message", async ({ text, room: r }) => {
    if (!requireLogin()) return;
    touchActivity(socket.username);
    const targetRoom = (r || "global").toLowerCase();
    try {
      const saved = await Message.create({ username: socket.username, text, room: targetRoom });
      io.to(targetRoom).emit("new_message", saved.toObject());
    } catch (err) {
      logger.error("MSG_SAVE_ERROR", { error: err.message });
    }
  });

  // ─── DM — admin bypasses contact check ────────────────────────
  socket.on("send_dm", async ({ text, to }) => {
    if (!requireLogin()) return;
    touchActivity(socket.username);
    const key       = dmKey(socket.username, to);
    const isContact = socket.isAdmin || await areContacts(socket.username, to);
    const pending   = !isContact;

    try {
      const saved = await Message.create({
        username: socket.username, text, dmKey: key, pending, status: "sent"
      });

      socket.join(`dm:${key}`);

      if (!pending) {
        const recipientSocks = userSockets.get(to);
        if (recipientSocks && recipientSocks.size > 0) {
          recipientSocks.forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) s.join(`dm:${key}`);
          });
          io.to(`dm:${key}`).emit("new_dm", saved.toObject());
          await Message.updateOne({ _id: saved._id }, { status: "delivered" });
          const senderSocks = userSockets.get(socket.username);
          if (senderSocks) {
            senderSocks.forEach(sid => io.to(sid).emit("msg_status_update", {
              messageId: saved._id.toString(), status: "delivered"
            }));
          }
        } else {
          socket.emit("new_dm", saved.toObject());
        }
      } else {
        socket.emit("new_dm", { ...saved.toObject(), pending: true });
      }
    } catch (err) {
      logger.error("DM_SAVE_ERROR", { error: err.message });
    }
  });

  socket.on("mark_read", async ({ dmKey: key }) => {
    if (!requireLogin()) return;
    const unread = await Message.find({
      dmKey: key, username: { $ne: socket.username }, seenBy: { $ne: socket.username }
    });
    for (const msg of unread) {
      await Message.updateOne(
        { _id: msg._id },
        { $addToSet: { seenBy: socket.username }, status: "read" }
      );
      const senderSocks = userSockets.get(msg.username);
      if (senderSocks) {
        senderSocks.forEach(sid => io.to(sid).emit("msg_status_update", {
          messageId: msg._id.toString(), status: "read"
        }));
      }
    }
  });

  socket.on("load_dm", async ({ with: otherUser }) => {
    if (!requireLogin()) return;
    const key       = dmKey(socket.username, otherUser);
    const isContact = socket.isAdmin || await areContacts(socket.username, otherUser);
    socket.join(`dm:${key}`);
    const history = await Message.find({
      dmKey: key, ...(isContact ? {} : { pending: false })
    }).sort({ createdAt: 1 }).limit(100);
    socket.emit("dm_history", { dmKey: key, messages: history });
    socket.emit("mark_read_trigger", { dmKey: key });
  });

  socket.on("join_room", async roomName => {
    if (!requireLogin()) return;
    const cleanRoom = roomName.trim().toLowerCase();
    socket.join(cleanRoom);
    const history = await Message.find({ room: cleanRoom, pending: false })
      .sort({ createdAt: 1 }).limit(100);
    socket.emit("chat_history", { room: cleanRoom, messages: history });
  });

  // ─── CONTACT REQUEST — admin bypasses ─────────────────────────
  socket.on("send_contact_request", async ({ to }) => {
    if (!requireLogin()) return;
    try {
      // Admin gets instant access — no request needed
      if (socket.isAdmin) {
        await User.updateOne({ username: socket.username }, { $addToSet: { contacts: to } });
        await User.updateOne({ username: to },             { $addToSet: { contacts: socket.username } });
        socket.emit("contact_accepted", { username: to });
        const targetSocks = userSockets.get(to);
        if (targetSocks) {
          targetSocks.forEach(sid => io.to(sid).emit("contact_accepted", { username: socket.username }));
        }
        return;
      }

      const already  = await areContacts(socket.username, to);
      if (already) return socket.emit("error_msg", "Already in your contacts");

      const existing = await ContactRequest.findOne({ from: socket.username, to, status: "pending" });
      if (existing) return socket.emit("contact_request_sent", { to });

      await ContactRequest.create({ from: socket.username, to });
      logger.info("CONTACT_REQUEST_SENT", { from: socket.username, to });
      socket.emit("contact_request_sent", { to });

      const recipientSocks = userSockets.get(to);
      if (recipientSocks) {
        const req = await ContactRequest.findOne({ from: socket.username, to, status: "pending" });
        recipientSocks.forEach(sid => io.to(sid).emit("contact_requests", [req]));
      }
    } catch (err) {
      if (err.code === 11000) return socket.emit("contact_request_sent", { to });
      logger.error("CONTACT_REQUEST_ERROR", { error: err.message });
    }
  });

  socket.on("accept_contact_request", async ({ from }) => {
    if (!requireLogin()) return;
    try {
      await ContactRequest.updateOne({ from, to: socket.username, status: "pending" }, { status: "accepted" });
      await User.updateOne({ username: socket.username }, { $addToSet: { contacts: from } });
      await User.updateOne({ username: from },            { $addToSet: { contacts: socket.username } });

      logger.info("CONTACT_ACCEPTED", { by: socket.username, from });
      socket.emit("contact_accepted", { username: from });

      const senderSocks = userSockets.get(from);
      if (senderSocks) {
        senderSocks.forEach(sid => io.to(sid).emit("contact_accepted", { username: socket.username }));
      }

      const key     = dmKey(socket.username, from);
      const pending = await Message.find({ dmKey: key, pending: true });
      for (const msg of pending) {
        await Message.updateOne({ _id: msg._id }, { pending: false, status: "delivered" });
        socket.emit("new_dm", { ...msg.toObject(), pending: false });
      }
    } catch (err) {
      logger.error("CONTACT_ACCEPT_ERROR", { error: err.message });
    }
  });

  socket.on("reject_contact_request", async ({ from }) => {
    if (!requireLogin()) return;
    await ContactRequest.updateOne({ from, to: socket.username, status: "pending" }, { status: "rejected" });
    socket.emit("contact_request_rejected", { from });
  });

  // ─── GROUP REQUEST — admin skips ──────────────────────────────
  socket.on("request_group_join", async ({ groupName }) => {
    if (!requireLogin()) return;
    if (socket.isAdmin) return; // admin already in all groups

    try {
      const cleanName = groupName.trim().toLowerCase();
      const user = await User.findOne({ username: socket.username });
      if (user.groups.includes(cleanName)) {
        return socket.emit("error_msg", "Already a member of this group");
      }

      await GroupRequest.create({ username: socket.username, groupName: cleanName });
      socket.emit("group_request_sent", { groupName: cleanName });

      const admins = await User.find({ isAdmin: true }, "username");
      for (const admin of admins) {
        const adminSocks = userSockets.get(admin.username);
        if (adminSocks) {
          const allReqs = await GroupRequest.find({ status: "pending" });
          adminSocks.forEach(sid => io.to(sid).emit("group_requests", allReqs));
        }
      }
    } catch (err) {
      if (err.code === 11000) return socket.emit("error_msg", "Request already sent");
      logger.error("GROUP_REQUEST_ERROR", { error: err.message });
    }
  });

  socket.on("approve_group_request", async ({ username, groupName }) => {
    if (!requireLogin() || !socket.isAdmin) return socket.emit("error_msg", "Admin only");

    await GroupRequest.updateOne({ username, groupName, status: "pending" }, { status: "approved" });
    await User.updateOne({ username }, { $addToSet: { groups: groupName } });
    logger.info("GROUP_REQUEST_APPROVED", { username, groupName, by: socket.username });

    const targetSocks = userSockets.get(username);
    if (targetSocks) {
      targetSocks.forEach(sid => {
        const s = io.sockets.sockets.get(sid);
        if (s) s.join(groupName);
        io.to(sid).emit("group_request_approved", { groupName });
      });
    }

    const allReqs = await GroupRequest.find({ status: "pending" });
    socket.emit("group_requests", allReqs);
  });

  socket.on("reject_group_request", async ({ username, groupName }) => {
    if (!requireLogin() || !socket.isAdmin) return socket.emit("error_msg", "Admin only");
    await GroupRequest.updateOne({ username, groupName, status: "pending" }, { status: "rejected" });
    const allReqs = await GroupRequest.find({ status: "pending" });
    socket.emit("group_requests", allReqs);
  });

  socket.on("get_rooms", async () => {
    const rooms = await Room.find().sort({ name: 1 });
    socket.emit("rooms_list", rooms);
  });

  socket.on("create_room", async name => {
    if (!requireLogin()) return;
    const cleanName = name.trim().toLowerCase();
    await Room.create({ name: cleanName, createdBy: socket.username });

    // Auto-add all admins to the new room
    const admins = await User.find({ isAdmin: true }, "username");
    for (const admin of admins) {
      await User.updateOne({ username: admin.username }, { $addToSet: { groups: cleanName } });
      const adminSocks = userSockets.get(admin.username);
      if (adminSocks) {
        adminSocks.forEach(sid => {
          const s = io.sockets.sockets.get(sid);
          if (s) s.join(cleanName);
        });
      }
    }

    const rooms = await Room.find().sort({ name: 1 });
    io.emit("rooms_list", rooms);
  });

  socket.on("delete_room", async name => {
    if (!requireLogin() || !socket.isAdmin) return socket.emit("error_msg", "Admin only");
    const cleanName = name.trim().toLowerCase();
    await Room.deleteOne({ name: cleanName });
    await Message.deleteMany({ room: cleanName });
    const rooms = await Room.find().sort({ name: 1 });
    io.emit("rooms_list", rooms);
  });

  socket.on("get_users", async () => {
    const users = await User.find().sort({ username: 1 });
    socket.emit("users_list", users);
  });

  socket.on("delete_user", async username => {
    if (!socket.isAdmin) return socket.emit("error_msg", "Admin only");
    await User.deleteOne({ username });
    const users = await User.find().sort({ username: 1 });
    io.emit("users_list", users);
  });

  socket.on("reset_pin", async ({ username, newPin }) => {
    if (!socket.isAdmin) return socket.emit("error_msg", "Admin only");
    await User.updateOne({ username }, { pin: newPin });
    socket.emit("pin_reset_success", { username });
  });

  socket.on("disconnect", async () => {
    const username = userSessions.get(socket.id);
    if (!username) return;

    userSessions.delete(socket.id);
    const socks = userSockets.get(username);
    if (socks) {
      socks.delete(socket.id);
      if (socks.size === 0) {
        userSockets.delete(username);
        await setPresence(username, "offline");
        const user = await User.findOne({ username }, "contacts");
        if (user) {
          for (const contact of user.contacts) {
            const cSocks = userSockets.get(contact);
            if (cSocks) cSocks.forEach(sid => io.to(sid).emit("presence_update", { [username]: "offline" }));
          }
        }
        await broadcastPresence();
      }
    }
    logger.info("USER_DISCONNECTED", { username });
  });
});

module.exports = { app, server, presenceInterval };
