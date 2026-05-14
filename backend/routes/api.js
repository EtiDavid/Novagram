const express = require("express");
const router  = express.Router();
const User    = require("../models/User");
const { getPresignedUploadUrl } = require("../utils/s3");

// ── GET /api/users — public user list (username + avatar only)
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "username avatarColor avatarUrl").sort({ username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/search?q=term
router.get("/users/search", async (req, res) => {
  try {
    const q     = (req.query.q || "").toLowerCase().trim();
    const me    = (req.query.me || "").toLowerCase().trim();
    if (!q) return res.json([]);

    const users = await User.find(
      { username: { $regex: q, $options: "i" }, ...(me ? { username: { $ne: me } } : {}) },
      "username avatarColor avatarUrl"
    ).limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/avatar/presign — get a presigned S3 upload URL
// Body: { username, contentType }
router.post("/avatar/presign", async (req, res) => {
  try {
    const { username, contentType } = req.body;
    if (!username || !contentType) return res.status(400).json({ error: "username and contentType required" });

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(contentType)) return res.status(400).json({ error: "Invalid file type" });

    const result = await getPresignedUploadUrl(username, contentType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/avatar — save public URL after upload completes
// Body: { username, avatarUrl }
router.patch("/avatar", async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;
    if (!username || !avatarUrl) return res.status(400).json({ error: "username and avatarUrl required" });

    await User.updateOne({ username }, { avatarUrl });
    res.json({ success: true, avatarUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
