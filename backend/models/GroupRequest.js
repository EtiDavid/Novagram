const mongoose = require("mongoose");

const groupRequestSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  groupName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

groupRequestSchema.index({ username: 1, groupName: 1 }, { unique: true });
groupRequestSchema.index({ status: 1 });

module.exports = mongoose.model("GroupRequest", groupRequestSchema);
