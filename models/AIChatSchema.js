const mongoose = require("mongoose");

const aiChatSchema = new mongoose.Schema({
    channelId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true
    },
    // Các trường khác nếu bạn cần lưu nội dung chat lịch sử
}, { timestamps: true });

module.exports = mongoose.model("AIChatSchema", aiChatSchema);
