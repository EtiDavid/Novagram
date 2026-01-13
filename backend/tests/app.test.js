const request = require("supertest");
const mongoose = require("mongoose");

require("dotenv").config({
  path: `.env.test`
});

const { app, server } = require("../app");
const Message = require("../models/Message");
const User = require("../models/User");

let httpServer;

beforeAll(done => {
  httpServer = server.listen(6000, done);
});

afterAll(async () => {
  // Close HTTP + Socket.IO
  await new Promise(resolve => httpServer.close(resolve));

  // Close MongoDB connection
  await mongoose.connection.close(true);

  // Cleanup timers
  jest.clearAllTimers();
});

beforeEach(async () => {
  await Message.deleteMany({});
  await User.deleteMany({});
});

// ============================================
// TEST 1 — HEALTH CHECK
// ============================================
test("health endpoint returns ok", async () => {
  const res = await request(app).get("/health");

  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
});

// ============================================
// TEST 2 — USER AUTO-CREATION
// ============================================
test("user can be created and stored", async () => {
  const user = await User.create({
    username: "testuser",
    pin: "1234"
  });

  expect(user.username).toBe("testuser");
  expect(user.pin).toBe("1234");
});

// ============================================
// TEST 3 — MESSAGE STORAGE
// ============================================
test("messages are stored in DB", async () => {
  await Message.create({
    username: "testuser",
    text: "hello",
    room: "global"
  });

  const messages = await Message.find({});

  expect(messages.length).toBe(1);
  expect(messages[0].text).toBe("hello");
});
