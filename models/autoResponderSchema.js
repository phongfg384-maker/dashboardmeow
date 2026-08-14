const mongoose = require("mongoose");

const autoResponderRuleSchema = new mongoose.Schema(
  {
    trigger: { type: String, required: true },
    reply: { type: String, required: true },
    matchType: {
      type: String,
      enum: ["contains", "startsWith", "exact", "regex"],
      default: "contains",
    },
    caseSensitive: { type: Boolean, default: false },
    channelIds: { type: [String], default: [] },
  },
  { _id: false }
);

const autoResponderSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    rules: { type: [autoResponderRuleSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutoResponderConfig", autoResponderSchema);
