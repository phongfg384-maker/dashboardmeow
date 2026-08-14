// taixiuChannelSchema.js
const mongoose = require('mongoose');

const taixiuChannelSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true,
    },
    
    channelIds: {
        type: [String],
        default: [],
    },
});

module.exports = mongoose.model('TaiXiuChannel', taixiuChannelSchema);