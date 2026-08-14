// historyManager.js
const HistoryTaiXiu = require('../models/historytaixiuSchema');
const logger = console;

async function saveTaiXiuHistory(dice, total, resultTaiXiu, resultChanLe) {
    try {
        const newHistory = new HistoryTaiXiu({
            dice: dice,
            total: total,
            resultTaiXiu: resultTaiXiu,
            resultChanLe: resultChanLe,
        });
        await newHistory.save();
    } catch (error) {
        logger.error("Error while saving Tài Xỉu history:", error);
    }
}

async function getRecentTaiXiuHistory(limit = 10) {
    try {
        const history = await HistoryTaiXiu.find()
            .sort({ createdAt: -1 })
            .limit(limit);
        return history;
    } catch (error) {
        logger.error("Error while fetching recent Tài Xỉu history:", error);
        return [];
    }
}


module.exports = { saveTaiXiuHistory, getRecentTaiXiuHistory };
