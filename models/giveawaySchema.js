const mongoose = require("mongoose");

const giveawaySchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  hostId: { type: String, required: true },

  prizeType: { type: String, enum: ["ncoin", "custom"], default: "custom" },
  prizeText: { type: String, required: true },
  ncoinAmount: { type: Number, default: 0 },

  winnersCount: { type: Number, default: 1 },
  emojiRaw: { type: String, default: "🎉" },
  emojiKey: { type: String, default: "unicode:🎉" },

  entrants: { type: [String], default: [] },
  winners: { type: [String], default: [] },

  endAt: { type: Date, required: true },
  ended: { type: Boolean, default: false },
  processing: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
});

module.exports = mongoose.model("Giveaway", giveawaySchema);
