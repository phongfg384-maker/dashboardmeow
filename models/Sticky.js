const mongoose = require("mongoose");

const stickySchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
    index: true,
  },
  content: {
    type: String,
    required: true,
  },
  lastMessageId: {
    type: String,
    default: null,
  },
  cooldown: {
    type: Number,
    default: 1, // gửi lại sau 1 tin nhắn
  },
  counter: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

stickySchema.index(
  { guildId: 1, channelId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Sticky", stickySchema);