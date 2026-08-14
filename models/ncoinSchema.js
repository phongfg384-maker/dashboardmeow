const mongoose = require("mongoose");

const userCoinSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true, // 🚀 O(1) Tìm kiếm cực nhanh theo ID người dùng
    },

    coins: {
        type: Number,
        default: 0,
        min: 0,
        index: true, // 🚀 TỐI ƯU: Tăng tốc độ load bảng xếp hạng (Leaderboard) Top Xu
    },

    // ===== BANK =====
    bank: {
        type: Number,
        default: 0,
        min: 0,
    },

    // ===== MYSTERY BOXES (Lootbox & Weaponsbox) =====
    lootbox: {
        type: Number,
        default: 0,
        min: 0,
    },

    weaponsbox: {
        type: Number,
        default: 0,
        min: 0,
    },

    // ===== WORK SYSTEM =====
    lastWorkDay: {
        type: String,
        default: null,
    },

    workType: {
        type: String,
        enum: ["normal", "overtime"],
        default: null,
    },

    workEndTime: {
        type: Number,
        default: 0,
    },

    // ===== DAILY / WEEKLY =====
    lastDaily: {
        type: Number,
        default: 0,
    },

    lastWeekly: {
        type: Number,
        default: 0,
    },

    // ===== INVENTORY =====
    inventory: [
        {
            _id: false, // 💡 TỐI ƯU: Tắt tự sinh _id cho từng vật phẩm để nhẹ Database, giảm RAM tiêu thụ
            itemId: {
                type: String,
                required: true,
            },
            amount: {
                type: Number,
                default: 1,
                min: 1,
            },
        },
    ],

    // ===== ACHIEVEMENTS =====
    achievements: {
        type: [String],
        default: [],
    },

    // ===== BADGES =====
    badges: {
        type: [String],
        default: [],
    },

    // ===== DAILY MISSIONS =====
    dailyMissions: {
        _id: false, // 💡 TỐI ƯU: Tắt tự sinh _id thừa cho cụm object nhiệm vụ
        dayKey: {
            type: String,
            default: null,
            index: true, // 🚀 TỐI ƯU: Tìm kiếm nhanh khi bot quét reset nhiệm vụ mỗi ngày
        },

        taixiuGames: {
            type: Number,
            default: 0,
            min: 0,
        },

        messagesInNnk: {
            type: Number,
            default: 0,
            min: 0,
        },

        claimedDailyReward: {
            type: Boolean,
            default: false,
        },

        lastClaimAt: {
            type: Number,
            default: 0,
        },
    },

}, {
    timestamps: true, // Tự động thêm createdAt và updatedAt
    versionKey: false // 💡 TỐI ƯU: Tắt bỏ trường "__v" mặc định của Mongoose giúp sạch JSON payload
});

module.exports = mongoose.model("UserCoin", userCoinSchema);
