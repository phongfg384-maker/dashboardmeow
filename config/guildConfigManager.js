const GuildConfig = require("../models/guildConfigSchema"); 

// =========================
// GET CONFIG
// =========================

async function getGuildConfig(guildId) {
    if (!guildId) return null;
    return GuildConfig.findOne({ guildId }).catch(() => null);
}

// =========================
// LEVEL SYSTEM
// =========================

async function isLevelUpMessageEnabled(guildId) {
    const config = await getGuildConfig(guildId);
    return config?.levelUpMessageEnabled !== false;
}

async function setLevelUpMessageEnabled(guildId, enabled) {
    if (!guildId) return null;

    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: {
                levelUpMessageEnabled: Boolean(enabled)
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    ).catch(() => null);
}

// =========================
// PREMIUM SYSTEM
// =========================

async function getPremiumConfig(guildId) {
    const config = await getGuildConfig(guildId);
    return config?.premium || null;
}

function getDefaultPrefix(fallbackPrefix = "?") {
    const value = String(fallbackPrefix || "").trim();
    return value || "?";
}

async function getEffectivePrefix(guildId, fallbackPrefix = "?") {
    const defaultPrefix = getDefaultPrefix(fallbackPrefix);

    if (!guildId) return defaultPrefix;

    const premiumEnabled = await isPremiumEnabled(guildId).catch(() => false);
    if (!premiumEnabled) return defaultPrefix;

    const premium = await getPremiumConfig(guildId);
    const customPrefix = String(premium?.prefix || "").trim();

    if (!customPrefix) return defaultPrefix;

    return customPrefix;
}

async function isPremiumEnabled(guildId) {
    const premium = await getPremiumConfig(guildId);

    if (premium?.enabled !== true) return false;

    const expiresAt = premium?.expiresAt ? new Date(premium.expiresAt) : null;

    if (!expiresAt) return true;
    if (expiresAt.getTime() > Date.now()) return true;

    await GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $set: { "premium.enabled": false }
        }
    );

    return false;
}

async function setPremiumEnabled(guildId, enabled, meta = {}) {
    if (!guildId) return null;

    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: {
                "premium.enabled": Boolean(enabled),
                "premium.setBy": meta.setBy || null,
                "premium.setAt": new Date(),
                "premium.expiresAt": meta.expiresAt || null
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
}

async function setPremiumBotAvatarUrl(guildId, avatarUrl) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { "premium.botAvatarUrl": avatarUrl }
        },
        { new: true, upsert: true }
    );
}

async function setPremiumAiAutomodEnabled(guildId, enabled) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { "premium.aiAutomodEnabled": Boolean(enabled) }
        },
        { new: true, upsert: true }
    );
}

async function setPremiumPrefix(guildId, prefix) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { "premium.prefix": prefix }
        },
        { new: true, upsert: true }
    );
}

async function isPremiumMusic247Enabled(guildId) {
    const premium = await getPremiumConfig(guildId);
    if (premium?.enabled !== true) return false;
    return premium?.music247Enabled !== false;
}

async function setPremiumMusic247Enabled(guildId, enabled) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { "premium.music247Enabled": Boolean(enabled) }
        },
        { new: true, upsert: true }
    );
}

// =========================
// AI SYSTEM
// =========================

async function getAIConfig(guildId) {
    const config = await getGuildConfig(guildId);
    return config?.ai || null;
}

async function isAIEnabled(guildId) {
    const ai = await getAIConfig(guildId);
    return ai?.enabled === true;
}

async function getAIChannel(guildId) {
    const ai = await getAIConfig(guildId);
    return ai?.channelId || null;
}

async function setAIChannel(guildId, channelId) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: {
                "ai.enabled": true,
                "ai.channelId": channelId
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
}

async function removeAIChannel(guildId) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $set: {
                "ai.enabled": false,
                "ai.channelId": ""
            }
        },
        { new: true }
    );
}

async function setAIModel(guildId, model) {
    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $set: { "ai.model": model }
        },
        { new: true }
    );
}

async function getAIPrompt(guildId) {
    const ai = await getAIConfig(guildId);
    return ai?.prompt || "Bạn là một trợ lý ảo thông minh trên Discord.";
}

async function setAIPrompt(guildId, prompt) {
    if (!guildId) return null;

    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { "ai.prompt": prompt }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    ).catch(() => null);
}

// =========================
// ANTI SCAM IMAGE
// =========================

async function isAntiScamImageEnabled(guildId) {
    const config = await getGuildConfig(guildId);
    return config?.antiScamImage === true;
}

async function setAntiScamImage(guildId, enabled) {
    if (!guildId) return null;

    return GuildConfig.findOneAndUpdate(
        { guildId },
        {
            $setOnInsert: { guildId },
            $set: { antiScamImage: Boolean(enabled) }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    ).catch(() => null);
}

// =========================
// EXPORT ALL FUNCTIONS
// =========================

module.exports = {
    getGuildConfig,

    isLevelUpMessageEnabled,
    setLevelUpMessageEnabled,

    getPremiumConfig,
    getEffectivePrefix,
    isPremiumEnabled,
    setPremiumEnabled,
    setPremiumBotAvatarUrl,
    setPremiumAiAutomodEnabled,
    setPremiumPrefix,
    isPremiumMusic247Enabled,
    setPremiumMusic247Enabled,

    getAIConfig,
    isAIEnabled,
    getAIChannel,
    setAIChannel,
    removeAIChannel,
    setAIModel,
    getAIPrompt,
    setAIPrompt,

    isAntiScamImageEnabled,
    setAntiScamImage
};
