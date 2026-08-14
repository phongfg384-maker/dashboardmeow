const mongoose = require("mongoose");

const warnThresholdSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  thresholds: [{
    count: { type: Number, required: true },   // number of warns that triggers this
    action: { type: String, required: true },  // "mute" | "kick" | "ban" | "timeout"
    durationMinutes: { type: Number, default: null } // for mute/timeout
  }]
}, { timestamps: true });

module.exports = mongoose.models.WarnThreshold || mongoose.model("WarnThreshold", warnThresholdSchema);
