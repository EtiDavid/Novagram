require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});

const express   = require("express");
const http      = require("http");
const cors      = require("cors");
const mongoose  = require("mongoose");
const Redis     = require("ioredis");

const Message        = require("./models/Message");
const User           = require("./models/User");
const Room           = require("./models/Room");
const ContactRequest = require("./models/ContactRequest");
const GroupRequest   = require("./models/GroupRequest");

const { logger, requestLogger } = require("./utils/logger");
const { loginRateLimiter, clearAttempts } = require("./middleware/rateLimiter");

const apiRoutes = require("./routes/api");

// ─────────────────────────────────────────────────────────────
// EXPRESS
// ─────────────────────────────────────────────────────────────

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

app.use("/api", apiRoutes);

const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────
// REDIS
// ─────────────────────────────────────────────────────────────

let redis = null;
let redisReady = false;

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_AUTH = process.env.REDIS_AUTH || null;

if (REDIS_HOST) {
  redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_AUTH || undefined,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    enableOfflineQueue: false
  });

  redis.on("ready", () => {
    redisReady = true;
    logger.info("REDIS_CONNECTED");
  });

  redis.on("error", (err) => {
    redisReady = false;
    logger.error("REDIS_ERROR", { error: err.message });
  });

  redis.on("close", () => {
    redisReady = false;
    logger.warn("REDIS_DISCONNECTED");
  });
} else {
  logger.warn("REDIS_SKIPPED", {
    reason: "REDIS_HOST not set"
  });
}

// ─────────────────────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────────────────────

const io = require("socket.io")(server, {
  cors: { origin: "*" }
});

if (REDIS_HOST) {
  try {
    const { createAdapter } = require("@socket.io/redis-adapter");

    const pub = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_AUTH || undefined
    });

    const sub = pub.duplicate();

    io.adapter(createAdapter(pub, sub));

    logger.info("SOCKET_IO_REDIS_ADAPTER_ENABLED");
  } catch (e) {
    logger.warn("SOCKET_IO_REDIS_ADAPTER_SKIP", {
      reason: e.message
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      logger.info("DB_CONNECTED", {
        host: mongoose.connection.host
      });
    })
    .catch((err) => {
      logger.error("DB_ERROR", {
        error: err.message
      });

      process.exit(1);
    });

// ─────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────

app.get("/health", async (_, res) => {

  const checks = {};
  let healthy = true;

  const dbState = mongoose.connection.readyState;

  checks.mongodb = dbState === 1 ? "ok" : "degraded";

  if (dbState !== 1) healthy = false;

  if (REDIS_HOST) {
    checks.redis = redisReady ? "ok" : "degraded";

    if (!redisReady) healthy = false;
  } else {
    checks.redis = "not_configured";
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    ts: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function dmKey(a, b) {
  return [a, b].sort().join("::");
}

async function areContacts(a, b) {
  const user = await User.findOne({
    username: a,
    contacts: b
  });

  return !!user;
}

// ─────────────────────────────────────────────────────────────
// PRESENCE
// ─────────────────────────────────────────────────────────────

const AWAY_AFTER = 5 * 60 * 1000;

const presenceMap = new Map();

async function setPresence(username, status) {

  if (redis && redisReady) {

    if (status === "offline") {
      await redis.del(`presence:${username}`);
    } else {
      await redis.setex(`presence:${username}`, 60, status);
    }
  }

  const existing = presenceMap.get(username) || {};

  presenceMap.set(username, {
    ...existing,
    status,
    lastActive: Date.now()
  });
}

async function getPresence(username) {

  if (redis && redisReady) {

    const val = await redis.get(`presence:${username}`)
        .catch(() => null);

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

function touchActivity(username) {

  const data = presenceMap.get(username);

  if (!data) return;

  data.lastActive = Date.now();

  if (data.status === "away") {
    setPresence(username, "online")
        .then(() => broadcastPresence());
  }
}

setInterval(async () => {

  const now = Date.now();

  for (const [username, data] of presenceMap.entries()) {

    if (
        data.status === "online" &&
        now - data.lastActive > AWAY_AFTER
    ) {
      await setPresence(username, "away");
    }
  }

  await broadcastPresence();

}, 60 * 1000);

// ─────────────────────────────────────────────────────────────
// ADMIN ROOM SYNC
// ─────────────────────────────────────────────────────────────

async function syncAdminRooms(username, socketRef) {

  const allRooms = await Room.find({}, "name").lean();

  const allRoomNames = [
    "global",
    ...allRooms.map(r => r.name)
  ];

  await User.updateOne(
      { username },
      { $set: { groups: allRoomNames } }
  );

  if (socketRef) {
    allRoomNames.forEach(room => socketRef.join(room));
  }

  return allRoomNames;
}

// ─────────────────────────────────────────────────────────────
// SOCKET CONNECTION
// ─────────────────────────────────────────────────────────────

io.on("connection", (socket) => {

  logger.info("SOCKET_CONNECTED", {
    socketId: socket.id
  });

  function requireLogin() {

    if (!socket.username) {

      socket.emit("error_msg", "Not authenticated");

      return false;
    }

    return true;
  }

  // ───────────────── LOGIN ─────────────────

  socket.on("login", async ({ username, pin }) => {

    if (!loginRateLimiter(socket.id)) {
      return socket.emit(
          "login_failed",
          "Too many attempts. Try again later."
      );
    }

    try {

      const cleanName = username.trim().toLowerCase();

      let user = await User.findOne({
        username: cleanName
      });

      if (!user) {

        user = await User.create({
          username: cleanName,
          pin,
          isAdmin: cleanName === "admin",
          groups: ["global"]
        });

        logger.info("USER_CREATED", {
          username: cleanName
        });
      }

      if (user.pin !== pin) {
        return socket.emit(
            "login_failed",
            "Invalid username or PIN"
        );
      }

      clearAttempts(socket.id);

      socket.username = cleanName;
      socket.isAdmin  = user.isAdmin;

      socket.join(`user:${cleanName}`);

      let effectiveGroups = user.groups;

      if (user.isAdmin) {

        effectiveGroups = await syncAdminRooms(
            cleanName,
            socket
        );

        const allUsers = await User.find({}, "username");

        for (const u of allUsers) {

          if (u.username !== cleanName) {
            socket.join(`dm:${dmKey(cleanName, u.username)}`);
          }
        }

      } else {

        for (const group of user.groups) {
          socket.join(group);
        }

        for (const contact of user.contacts) {
          socket.join(`dm:${dmKey(cleanName, contact)}`);
        }
      }

      await setPresence(cleanName, "online");

      socket.emit("login_success", {
        username: cleanName,
        isAdmin: user.isAdmin,
        avatarColor: user.avatarColor,
        avatarUrl: user.avatarUrl,
        contacts: user.contacts,
        groups: effectiveGroups
      });

      const history = await Message.find({
        room: "global",
        pending: false
      })
          .sort({ createdAt: 1 })
          .limit(100);

      socket.emit("chat_history", {
        room: "global",
        messages: history
      });

      for (const contact of user.contacts) {

        io.to(`user:${contact}`).emit(
            "presence_update",
            {
              [cleanName]: "online"
            }
        );
      }

      await broadcastPresence();

      logger.info("LOGIN_SUCCESS", {
        username: cleanName
      });

    } catch (err) {

      logger.error("LOGIN_ERROR", {
        error: err.message
      });

      socket.emit(
          "login_failed",
          "Login error"
      );
    }
  });

  // ───────────────── ACTIVITY ─────────────────

  socket.on("activity", () => {

    if (socket.username) {
      touchActivity(socket.username);
    }
  });

  // ───────────────── TYPING ─────────────────

  socket.on("typing", ({ room, dm }) => {

    if (!socket.username) return;

    touchActivity(socket.username);

    if (dm) {

      socket.to(`dm:${dmKey(socket.username, dm)}`)
          .emit("user_typing", {
            username: socket.username,
            dm
          });

    } else {

      socket.to(room || "global")
          .emit("user_typing", {
            username: socket.username,
            room: room || "global"
          });
    }
  });

  // ───────────────── ROOM MESSAGE ─────────────────

  socket.on("send_message", async ({ text, room }) => {

    if (!requireLogin()) return;

    touchActivity(socket.username);

    const targetRoom = (room || "global")
        .trim()
        .toLowerCase();

    try {

      const saved = await Message.create({
        username: socket.username,
        text,
        room: targetRoom
      });

      io.to(targetRoom)
          .emit("new_message", saved.toObject());

    } catch (err) {

      logger.error("MSG_SAVE_ERROR", {
        error: err.message
      });
    }
  });

  // ───────────────── DM ─────────────────

  socket.on("send_dm", async ({ text, to }) => {

    if (!requireLogin()) return;

    touchActivity(socket.username);

    const key = dmKey(socket.username, to);

    const isContact =
        socket.isAdmin ||
        await areContacts(socket.username, to);

    const pending = !isContact;

    try {

      const saved = await Message.create({
        username: socket.username,
        text,
        dmKey: key,
        pending,
        status: "sent"
      });

      socket.join(`dm:${key}`);

      if (!pending) {

        io.to(`user:${to}`)
            .emit("new_dm", saved.toObject());

        socket.emit("new_dm", saved.toObject());

        await Message.updateOne(
            { _id: saved._id },
            { status: "delivered" }
        );

        io.to(`user:${socket.username}`)
            .emit("msg_status_update", {
              messageId: saved._id.toString(),
              status: "delivered"
            });

      } else {

        socket.emit("new_dm", {
          ...saved.toObject(),
          pending: true
        });
      }

    } catch (err) {

      logger.error("DM_SAVE_ERROR", {
        error: err.message
      });
    }
  });

  // ───────────────── LOAD DM ─────────────────

  socket.on("load_dm", async ({ with: otherUser }) => {

    if (!requireLogin()) return;

    const key = dmKey(socket.username, otherUser);

    const isContact =
        socket.isAdmin ||
        await areContacts(socket.username, otherUser);

    socket.join(`dm:${key}`);

    const history = await Message.find({
      dmKey: key,
      ...(isContact ? {} : { pending: false })
    })
        .sort({ createdAt: 1 })
        .limit(100);

    socket.emit("dm_history", {
      dmKey: key,
      messages: history
    });

    socket.emit("mark_read_trigger", {
      dmKey: key
    });
  });

  // ───────────────── READ RECEIPTS ─────────────────

  socket.on("mark_read", async ({ dmKey: key }) => {

    if (!requireLogin()) return;

    const unread = await Message.find({
      dmKey: key,
      username: { $ne: socket.username },
      seenBy: { $ne: socket.username }
    });

    for (const msg of unread) {

      await Message.updateOne(
          { _id: msg._id },
          {
            $addToSet: {
              seenBy: socket.username
            },
            status: "read"
          }
      );

      io.to(`user:${msg.username}`)
          .emit("msg_status_update", {
            messageId: msg._id.toString(),
            status: "read"
          });
    }
  });

  // ───────────────── JOIN ROOM ─────────────────

  socket.on("join_room", async (roomName) => {

    if (!requireLogin()) return;

    const cleanRoom = roomName
        .trim()
        .toLowerCase();

    socket.join(cleanRoom);

    const history = await Message.find({
      room: cleanRoom,
      pending: false
    })
        .sort({ createdAt: 1 })
        .limit(100);

    socket.emit("chat_history", {
      room: cleanRoom,
      messages: history
    });
  });

  // ───────────────── CONTACT REQUEST ─────────────────

  socket.on("send_contact_request", async ({ to }) => {

    if (!requireLogin()) return;

    try {

      const already = await areContacts(
          socket.username,
          to
      );

      if (already) {
        return socket.emit(
            "error_msg",
            "Already contacts"
        );
      }

      const existing = await ContactRequest.findOne({
        from: socket.username,
        to,
        status: "pending"
      });

      if (existing) {
        return socket.emit(
            "contact_request_sent",
            { to }
        );
      }

      await ContactRequest.create({
        from: socket.username,
        to
      });

      socket.emit("contact_request_sent", {
        to
      });

      const req = await ContactRequest.findOne({
        from: socket.username,
        to,
        status: "pending"
      });

      io.to(`user:${to}`)
          .emit("contact_requests", [req]);

    } catch (err) {

      logger.error("CONTACT_REQUEST_ERROR", {
        error: err.message
      });
    }
  });

  // ───────────────── ACCEPT CONTACT ─────────────────

  socket.on("accept_contact_request", async ({ from }) => {

    if (!requireLogin()) return;

    try {

      await ContactRequest.updateOne(
          {
            from,
            to: socket.username,
            status: "pending"
          },
          {
            status: "accepted"
          }
      );

      await User.updateOne(
          { username: socket.username },
          {
            $addToSet: { contacts: from }
          }
      );

      await User.updateOne(
          { username: from },
          {
            $addToSet: {
              contacts: socket.username
            }
          }
      );

      const key = dmKey(socket.username, from);

      socket.join(`dm:${key}`);

      socket.emit("contact_accepted", {
        username: from
      });

      io.to(`user:${from}`)
          .emit("contact_accepted", {
            username: socket.username
          });

    } catch (err) {

      logger.error("CONTACT_ACCEPT_ERROR", {
        error: err.message
      });
    }
  });

  // ───────────────── GET ROOMS ─────────────────

  socket.on("get_rooms", async () => {

    const rooms = await Room.find()
        .sort({ name: 1 });

    socket.emit("rooms_list", rooms);
  });

  // ───────────────── DISCONNECT ─────────────────

  socket.on("disconnect", async () => {

    const username = socket.username;

    if (!username) return;

    await setPresence(username, "offline");

    const user = await User.findOne(
        { username },
        "contacts"
    );

    if (user) {

      for (const contact of user.contacts) {

        io.to(`user:${contact}`)
            .emit("presence_update", {
              [username]: "offline"
            });
      }
    }

    await broadcastPresence();

    logger.info("USER_DISCONNECTED", {
      username
    });
  });

});

module.exports = {
  app,
  server
};