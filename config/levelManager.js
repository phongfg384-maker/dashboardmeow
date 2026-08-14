const Level = require("../models/levelSchema");
const UserCoin = require("../models/ncoinSchema");

const XP_PER_MSG_MIN = 15;
const XP_PER_MSG_MAX = 30;

function getXPNeed(level) {
    return 150 + ((Math.max(1, level) - 1) * 75);
}

function getRandomXP() {
    return Math.floor(Math.random() * (XP_PER_MSG_MAX - XP_PER_MSG_MIN + 1)) + XP_PER_MSG_MIN;
}

function getTotalXpFromLegacy(level, xp) {
    let total = 0;

    for (let currentLevel = 1; currentLevel < Math.max(1, level); currentLevel++) {
        total += getXPNeed(currentLevel);
    }

    return total + Math.max(0, xp || 0);
}

async function getRank(userId, guildId) {
    const count = await Level.countDocuments({ totalXp: { $gt: 0 } }).lean();
    const user = await Level.findOne({ userId }).lean();
    const rank = user
        ? await Level.countDocuments({ totalXp: { $gt: user.totalXp } }).lean() + 1
        : count + 1;
    return { rank: user ? rank : null, totalMembers: count };
}

async function addXP(userId) {
    let data = await Level.findOne({ userId });
    if (!data) data = await Level.create({ userId });

    if (typeof data.totalXp !== "number" || Number.isNaN(data.totalXp)) {
        data.totalXp = getTotalXpFromLegacy(data.level, data.xp);
    }

    if (typeof data.messageCount !== "number" || Number.isNaN(data.messageCount)) {
        data.messageCount = 0;
    }

    const gainedXp = getRandomXP();

    data.xp += gainedXp;
    data.totalXp += gainedXp;
    data.messageCount += 1;

    let leveledUp = false;
    let reward = 0;
    let leveledCount = 0;

    while (data.xp >= getXPNeed(data.level)) {
        const xpNeed = getXPNeed(data.level);
        data.xp -= xpNeed;
        data.level++;
        leveledUp = true;
        leveledCount++;

        if (data.level % 5 === 0) {
            reward += 1_000_000;
        }
    }

    if (reward > 0) {
        let coin = await UserCoin.findOne({ userId });
        if (!coin) coin = await UserCoin.create({ userId });
        coin.coins += reward;
        await coin.save();
    }

    await data.save();

    return {
        gainedXp,
        leveledUp,
        level: data.level,
        xp: data.xp,
        xpNeed: getXPNeed(data.level),
        reward,
        leveledCount,
        totalXp: data.totalXp,
        messageCount: data.messageCount
    };
}

module.exports = {
    addXP,
    getRank,
    getXPNeed,
    getRandomXP,
    getTotalXpFromLegacy,
    XP_PER_MSG_MIN,
    XP_PER_MSG_MAX
};
