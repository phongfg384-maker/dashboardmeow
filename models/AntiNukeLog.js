const { Schema, model } = require("mongoose");

const AntiNukeLogSchema = new Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },        // người bị phạt (kẻ thực hiện hành động nguy hiểm)
    actionType: { type: String, required: true },     // ví dụ: CHANNEL_DELETE, ROLE_DELETE, MASS_BAN, BOT_ADD...
    detail: { type: String, default: "" },            // mô tả thêm, vd tên channel/role bị xoá
    punishment: { type: String, required: true },      // quarantine | timeout | kick | ban
    createdAt: { type: Date, default: Date.now },
});

module.exports = model("AntiNukeLog", AntiNukeLogSchema);
