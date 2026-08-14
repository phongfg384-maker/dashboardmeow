const mongoose = require("mongoose");

const ticketSettingsSchema = new mongoose.Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
    },

    enabled: {
      type: Boolean,
      default: true,
    },

    panelChannelId: {
      type: String,
      default: null,
    },
    panelMessageId: {
      type: String,
      default: null,
    },

    logChannelId: {
      type: String,
      default: null,
    },

    supportRoleId: {
      type: String,
      default: null,
    },

    language: {
      type: String,
      enum: ["vi", "en"],
      default: "vi",
    },

    maxTicketsPerUser: {
      type: Number,
      default: 5,
    },

    categories: {
      type: [
        {
          name: { type: String, required: true },
          emoji: { type: String, default: "📩" },
          description: { type: String, default: "" },
        },
      ],
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TicketSettings", ticketSettingsSchema);
