const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: String,
  username: String,
  room: String,

  deliveredTo: {
    type: [String],
    default: []
  },

  seenBy: {
    type: [String],
    default: []
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Message", messageSchema);
