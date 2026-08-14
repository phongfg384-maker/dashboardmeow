const mongoose = require("mongoose");

const levelSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    totalXp: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 }
});

module.exports = mongoose.model("UserLevel", levelSchema);
