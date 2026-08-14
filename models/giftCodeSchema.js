const mongoose = require('mongoose');

const giftCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    maxUses: { type: Number, default: 0 }, // 0 = vô hạn
    usedBy: { type: [String], default: [] }, // Danh sách ID các member đã dùng
    createdAt: { type: Date, default: Date.now },
    
    // Thêm trường này để xử lý tự động xóa sau 3 ngày
    expireAt: { type: Date, default: null } 
});

// Tạo TTL (Time-To-Live) Index cho trường expireAt
// Khi expireAt được set một mốc thời gian, MongoDB sẽ tự động xóa bản ghi này khi đến giờ
giftCodeSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('GiftCode', giftCodeSchema);
