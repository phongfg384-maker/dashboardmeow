const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  key: { type: String, required: true },
  value: { type: Number, default: 0 },
});

counterSchema.index({ guildId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("Counter", counterSchema);
