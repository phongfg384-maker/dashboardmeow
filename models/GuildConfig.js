// File này CHỈ re-export model từ guildConfigSchema.js (nơi định nghĩa schema thật duy nhất).
// Lý do: trước đây 2 file cùng đăng ký mongoose.model("GuildConfig", ...) với 2 schema KHÁC NHAU,
// khiến field nào của file require SAU luôn bị Mongoose âm thầm bỏ qua khi lưu.
// Giữ file này lại để không phải sửa require() ở những nơi đã dùng "../../models/GuildConfig".
module.exports = require("./guildConfigSchema");
