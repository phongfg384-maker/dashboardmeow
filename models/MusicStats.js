const mongoose = require("mongoose");

const MusicStatsSchema = new mongoose.Schema({
    // ID của người dùng Discord (Dùng làm khóa chính duy nhất)
    userId: { type: String, required: true, unique: true },
    
    // Lưu trữ Map tích lũy thời gian nghe ở từng Server (Key: Guild ID - Value: Miliseconds)
    servers: { type: Map, of: Number, default: {} },
    
    // Lưu trữ Map tích lũy thời gian nghe chung với bạn bè cùng phòng voice (Key: User ID - Value: Miliseconds)
    friends: { type: Map, of: Number, default: {} },
    
    // Lưu trữ Map tích lũy thời gian nghe của từng bài hát (Key: Tên bài hát chuẩn hóa - Value: Miliseconds)
    tracks: { type: Map, of: Number, default: {} }
});

module.exports = mongoose.model("MusicStats", MusicStatsSchema);
