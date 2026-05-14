const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 32
  },
  pin: {
    type: String,
    required: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  avatarColor: {
    type: String,
    default: () => {
      const colors = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7",
                      "#DDA0DD","#98D8C8","#F7DC6F","#BB8FCE","#85C1E9"];
      return colors[Math.floor(Math.random() * colors.length)];
    }
  },

  // S3 URL for profile picture — null until uploaded
  avatarUrl: {
    type: String,
    default: null
  },

  // Accepted contacts list — usernames
  contacts: {
    type: [String],
    default: []
  },

  // Groups the user is a member of
  groups: {
    type: [String],
    default: ["global"]
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

//userSchema.index({ username: 1 });

module.exports = mongoose.model("User", userSchema);
