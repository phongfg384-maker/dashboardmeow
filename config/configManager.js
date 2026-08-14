// configManager.js
const TaiXiuChannel = require('../models/taixiuChannelSchema');
const logger = console;

async function loadTaiXiuChannelsConfigForGuild(guildId) {
    try {
        const config = await TaiXiuChannel.findOne({ guildId });
        return config ? config.channelIds : [];
    } catch (error) {
        logger.error("Error while loading the Tài Xỉu channel configuration:", error);
        return [];
    }
}

async function saveTaiXiuChannelsConfigForGuild(guildId, channelIds) {
    try {
        await TaiXiuChannel.findOneAndUpdate(
            { guildId },
            { $set: { channelIds: channelIds } },
            { new: true, upsert: true }
        );
    } catch (error) {
        logger.error("Error while saving the Tài Xỉu channel configuration:", error);
    }
}

module.exports = { loadTaiXiuChannelsConfigForGuild, saveTaiXiuChannelsConfigForGuild };
