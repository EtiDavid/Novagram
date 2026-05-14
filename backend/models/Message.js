const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },

  // Group message
  room: {
    type: String,
    default: null
  },

  // DM thread key — sorted pair "alice::bob"
  dmKey: {
    type: String,
    default: null
  },

  // Message delivery status
  // "sent"      — saved to DB, not yet delivered to recipient socket
  // "delivered" — recipient socket received it (online)
  // "read"      — recipient has seen it (opened the conversation)
  status: {
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent"
  },

  // List of usernames who have read this message
  seenBy: {
    type: [String],
    default: []
  },

  // Pending messages (contact request not yet accepted)
  pending: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageSchema.index({ room: 1, createdAt: 1 });
messageSchema.index({ dmKey: 1, createdAt: 1 });
messageSchema.index({ dmKey: 1, status: 1 });

module.exports = mongoose.model("Message", messageSchema);
