const { Schema, model } = require("mongoose");

const AntiNukeQuarantineSchema = new Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    removedRoleIds: { type: [String], default: [] }, // role đã bị gỡ, dùng để restore bằng ?antinuke restore @user
    createdAt: { type: Date, default: Date.now },
});

// Một user chỉ giữ 1 bản ghi quarantine gần nhất mỗi guild
AntiNukeQuarantineSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model("AntiNukeQuarantine", AntiNukeQuarantineSchema);
