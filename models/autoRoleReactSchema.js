const mongoose = require("mongoose");

const autoRoleReactItemSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    emoji: { type: String, required: true }, // normalized key: id:<id> or unicode:<char>
    emojiLabel: { type: String, default: "" }, // display value entered by admin
    roleId: { type: String, required: true },
  },
  { _id: false }
);

const autoRoleReactSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    items: { type: [autoRoleReactItemSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AutoRoleReactConfig", autoRoleReactSchema);
