const mongoose = require("mongoose");

const WarnSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    warns: [
        {
            moderatorId: { type: String, required: true },
            reason: { type: String, default: "Không có lý do." },
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

// Tránh lỗi trùng lặp model khi compile lại
module.exports = mongoose.models.UserWarns || mongoose.model("UserWarns", WarnSchema);
