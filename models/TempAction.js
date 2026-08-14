const mongoose = require("mongoose");

const tempActionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, required: true }, // "ban" or "mute" (role-based)
  expiresAt: { type: Date, required: true },
  reason: { type: String, default: "No reason provided" },
  moderatorId: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.models.TempAction || mongoose.model("TempAction", tempActionSchema);
