const mongoose = require("mongoose");

// Tracks pending/accepted/rejected contact requests between users
const contactRequestSchema = new mongoose.Schema({
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

contactRequestSchema.index({ from: 1, to: 1 }, { unique: true });
contactRequestSchema.index({ to: 1, status: 1 });

module.exports = mongoose.model("ContactRequest", contactRequestSchema);
