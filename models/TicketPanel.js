const mongoose = require("mongoose");

const buttonSchema = new mongoose.Schema({
  label: { type: String, required: true },
  emoji: { type: String, default: "" },
  style: { type: String, enum: ["Primary", "Secondary", "Success", "Danger"], default: "Primary" }
}, { _id: false });

const ticketPanelSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },

  author: { type: String, default: "" },
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  thumbnail: { type: String, default: null },
  banner: { type: String, default: null },
  footer: { type: String, default: null },

  buttons: { type: [buttonSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.TicketPanel || mongoose.model("TicketPanel", ticketPanelSchema);
