const mongoose = require("mongoose");

const modNoteSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  authorId: { type: String, required: true },
  authorTag: { type: String, default: "Unknown" },
  content: { type: String, required: true },
  pinned: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.ModNote || mongoose.model("ModNote", modNoteSchema);
