const mongoose = require("mongoose");

// Danh sách kênh / role được BỎ QUA khỏi hệ thống Auto-Responder (Trigger).
// - ignoredChannels: tin nhắn gửi trong các kênh này sẽ không kích hoạt trigger nào.
// - ignoredRoles: thành viên sở hữu bất kỳ role nào trong danh sách này sẽ không
//   kích hoạt trigger, dù đang ở kênh nào.
// Mỗi guild chỉ có 1 document duy nhất.
const triggerIgnoreConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    ignoredChannels: { type: [String], default: [] },
    ignoredRoles: { type: [String], default: [] },
});

module.exports = mongoose.model("TriggerIgnoreConfig", triggerIgnoreConfigSchema);
