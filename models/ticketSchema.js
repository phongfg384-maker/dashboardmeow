const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  authorId: { type: String, required: true },
  authorTag: { type: String, required: true },
  content: { type: String, default: "" },
  timestamp: { type: Date, required: true },
  attachments: { type: [String], default: [] },
});

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },

  ticketId: { type: Number, required: true },
  categoryName: { type: String, required: true },
  categoryEmoji: { type: String, default: "" },

  ownerId: { type: String, required: true },
  ownerTag: { type: String, required: true },

  subject: { type: String, default: "" },

  addedUsers: { type: [String], default: [] },

  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
  closedBy: { type: String, default: null },
  closedByTag: { type: String, default: null },

  status: { type: String, enum: ["open", "closed", "deleted"], default: "open" },

  transcript: { type: [messageSchema], default: null },
});

module.exports = mongoose.model("Ticket", ticketSchema);
