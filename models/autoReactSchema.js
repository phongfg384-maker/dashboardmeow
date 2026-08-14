const mongoose = require("mongoose");

const autoReactRuleSchema = new mongoose.Schema(
  {
    trigger: { type: String, required: true },
    emoji: { type: String, required: true }, // Unicode emoji or Discord emoji id
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

const autoReactSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    rules: { type: [autoReactRuleSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutoReactConfig", autoReactSchema);
