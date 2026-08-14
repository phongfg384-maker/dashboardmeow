const mongoose = require("mongoose");

const nsfwChannelSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },
    channelIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("NSFWChannel", nsfwChannelSchema);
