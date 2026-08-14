// historytaixiuSchema.js
const mongoose = require('mongoose');

const historyTaiXiuSchema = new mongoose.Schema({
    dice: {
        type: [Number],
        required: true
    },

    total: {
        type: Number,
        required: true
    },

    resultTaiXiu: {
        type: String,
        enum: ['tai', 'xiu', 'TÀI', 'XỈU'],
        required: true
    },

    resultChanLe: {
        type: String,
        enum: ['chan', 'le', 'CHẴN', 'LẺ'],
        required: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('HistoryTaiXiu', historyTaiXiuSchema);
