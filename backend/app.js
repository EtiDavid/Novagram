require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");

const Message = require("./models/Message");
const User = require("./models/User");
const Room = require("./models/Room");
const { logger, requestLogger } = require("./utils/logger");


// ===================================================
// IN-MEMORY SESSION TRACKING
// ===================================================
const userSessions = new Map();   // socket.id -> username
const userSockets = new Map();    // username -> Set(socketIds)
const joinedRooms = new Map();    // socket.id -> Set(roomNames)


// ===================================================
// EXPRESS + SOCKET.IO
// ===================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);

const server = http.createServer(app);

const io = require("socket.io")(server, {
  cors: { origin: "*" }
});


// ===================================================
// DATABASE
// ===================================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info("DB_CONNECTED", { db: mongoose.connection.name }))
  .catch(err => logger.error("DB_CONNECTION_ERROR", { error: err.message }));


// ===================================================
// HEALTH CHECK
// ===================================================
app.get("/", (_, res) => res.json({ status: "ok" }));


// ===================================================
// SOCKET LOGIC
// ===================================================
io.on("connection", socket => {

  logger.info("SOCKET_CONNECTED", { socketId: socket.id });


  function requireLogin() {
    if (!socket.username) {
      logger.warn("AUTH_BLOCKED_NO_USER", { socketId: socket.id });
      return false;
    }
    return true;
  }


  // ===================================================
  // LOGIN
  // ===================================================
  socket.on("login", async ({ username, pin }) => {
    try {
      const cleanName = username.trim().toLowerCase();

      let user = await User.findOne({ username: cleanName });

      if (!user) {
        user = await User.create({
          username: cleanName,
          pin,
          isAdmin: cleanName === "admin"
        });

        logger.info("USER_CREATED", { username: cleanName });
      }

      if (user.pin !== pin) {
        logger.warn("LOGIN_FAILED_WRONG_PIN", { username: cleanName });
        return socket.emit("login_failed", "Invalid username or PIN");
      }

      socket.username = cleanName;

      if (!userSockets.has(cleanName)) {
        userSockets.set(cleanName, new Set());
      }
      userSockets.get(cleanName).add(socket.id);
      userSessions.set(socket.id, cleanName);

      logger.info("LOGIN_SUCCESS", {
        username: cleanName,
        socketId: socket.id
      });

      socket.emit("login_success", {
        username: cleanName,
        isAdmin: user.isAdmin
      });

      if (!joinedRooms.has(socket.id)) {
        joinedRooms.set(socket.id, new Set());
      }

      socket.join("global");
      joinedRooms.get(socket.id).add("global");

      const history = await Message.find({ room: "global" }).sort({ createdAt: 1 });
      socket.emit("chat_history", history);

      io.emit("online_users", Array.from(userSockets.keys()));

    } catch (err) {
      logger.error("LOGIN_ERROR", { error: err.message });
      socket.emit("login_failed", "Login error");
    }
  });



  // ===================================================
  // SEND MESSAGE
  // ===================================================
  socket.on("send_message", async ({ text, room }) => {
    if (!requireLogin()) return;

    const targetRoom = (room || "global").toLowerCase();

    try {
      const saved = await Message.create({
        username: socket.username,
        text,
        room: targetRoom
      });

      logger.info("MESSAGE_SENT", {
        from: socket.username,
        room: targetRoom,
        textLength: text?.length || 0
      });

      io.to(targetRoom).emit("new_message", saved);

    } catch (err) {
      logger.error("MESSAGE_SAVE_ERROR", {
        error: err.message,
        room: targetRoom
      });
    }
  });



  // ===================================================
  // JOIN ROOM  (FIXED)
  // ===================================================
  socket.on("join_room", async room => {
    if (!requireLogin()) return;

    const cleanRoom = room.trim().toLowerCase();

    if (!joinedRooms.has(socket.id)) {
      joinedRooms.set(socket.id, new Set());
    }

    const rooms = joinedRooms.get(socket.id);

    // only join socket if new
    if (!rooms.has(cleanRoom)) {
      rooms.add(cleanRoom);
      socket.join(cleanRoom);

      logger.info("ROOM_JOIN", {
        username: socket.username,
        room: cleanRoom
      });
    }

    // ALWAYS fetch history
    try {
      const history = await Message.find({ room: cleanRoom }).sort({ createdAt: 1 });
      socket.emit("chat_history", history);
    } catch (err) {
      logger.error("ROOM_HISTORY_ERROR", { error: err.message });
    }
  });



  // ===================================================
  // TYPING
  // ===================================================
  socket.on("typing", () => {
    if (!requireLogin()) return;
    socket.broadcast.emit("user_typing", socket.username);
  });



  // ===================================================
  // ADMIN — ROOMS
  // ===================================================
  socket.on("get_rooms", async () => {
    const rooms = await Room.find().sort({ name: 1 });
    socket.emit("rooms_list", rooms);
  });


  socket.on("create_room", async name => {
    const cleanName = name.trim().toLowerCase();

    await Room.create({ name: cleanName });

    logger.info("ROOM_CREATED", { name: cleanName });

    const rooms = await Room.find().sort({ name: 1 });
    io.emit("rooms_list", rooms);
  });


  // DELETE ROOM + MESSAGES (FIXED)
  socket.on("delete_room", async name => {
    const cleanName = name.trim().toLowerCase();

    await Room.deleteOne({ name: cleanName });
    await Message.deleteMany({ room: cleanName });

    logger.info("ROOM_AND_MESSAGES_DELETED", { name: cleanName });

    const rooms = await Room.find().sort({ name: 1 });
    io.emit("rooms_list", rooms);
  });



  // ===================================================
  // ADMIN — USERS
  // ===================================================
  socket.on("get_users", async () => {
    const users = await User.find().sort({ username: 1 });
    socket.emit("users_list", users);
  });


  socket.on("delete_user", async username => {
    await User.deleteOne({ username });

    logger.info("USER_DELETED", { username });

    io.emit("users_updated");
  });


  socket.on("reset_pin", async ({ username, newPin }) => {
    await User.updateOne({ username }, { pin: newPin });

    logger.info("USER_PIN_RESET", { username });

    io.emit("users_updated");
  });



  // ===================================================
  // DISCONNECT
  // ===================================================
  socket.on("disconnect", () => {

    const username = userSessions.get(socket.id);

    if (!username) {
      logger.info("SOCKET_DISCONNECTED_NO_LOGIN", { socketId: socket.id });
      return;
    }

    userSessions.delete(socket.id);

    const sockets = userSockets.get(username);

    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(username);
      }
    }

    joinedRooms.delete(socket.id);

    logger.info("USER_DISCONNECTED", {
      username,
      socketId: socket.id
    });

    io.emit("online_users", Array.from(userSockets.keys()));
  });

});


// ===================================================
// START SERVER
// ===================================================
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  logger.info("SERVER_STARTED", {
    port: PORT,
    env: process.env.NODE_ENV || "development"
  });
});
