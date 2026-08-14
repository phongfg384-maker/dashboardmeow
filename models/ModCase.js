const mongoose = require("mongoose");

const modCaseSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  caseId: { type: Number, required: true },
  type: { type: String, required: true }, // ban, softban, tempban, kick, warn, mute, timeout, unban, unmute, untimeout, note
  userId: { type: String, required: true },
  userTag: { type: String, default: "Unknown" },
  moderatorId: { type: String, required: true },
  moderatorTag: { type: String, default: "Unknown" },
  reason: { type: String, default: "No reason provided" },
  active: { type: Boolean, default: true } // false once reversed (e.g. unbanned) or expired
}, { timestamps: true });

modCaseSchema.index({ guildId: 1, caseId: 1 }, { unique: true });

async function nextCaseId(guildId) {
  const Model = mongoose.models.ModCase || mongoose.model("ModCase", modCaseSchema);
  const last = await Model.findOne({ guildId }).sort({ caseId: -1 }).lean();
  return last ? last.caseId + 1 : 1;
}

const ModCase = mongoose.models.ModCase || mongoose.model("ModCase", modCaseSchema);
ModCase.nextCaseId = nextCaseId;

module.exports = ModCase;
