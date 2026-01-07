const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  createdBy: String
});

module.exports = mongoose.model("Room", roomSchema);
