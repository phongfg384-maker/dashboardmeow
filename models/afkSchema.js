const mongoose = require("mongoose");

const afkSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: "No reason provided",
    },
    timestamp: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    oldNickname: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

afkSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.Afk || mongoose.model("Afk", afkSchema);
