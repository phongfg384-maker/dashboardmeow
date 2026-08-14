const { PermissionFlagsBits } = require("discord.js");

const ALLOWED_PREMIUM_OPERATOR_IDS = [
    "1390749103562031337",
    "1464151506025582737",
    "1463162734513225809",
];

function getAllowedPremiumOperatorIds() {
    return [...ALLOWED_PREMIUM_OPERATOR_IDS];
}

function isAllowedPremiumOperator(userId) {
    if (!userId) return false;
    return getAllowedPremiumOperatorIds().includes(String(userId));
}

function isGuildPremiumAdmin(message) {
    const permissions =
        message?.memberPermissions ||
        message?.member?.permissions ||
        message?.member?.permissionsFor?.(message?.guild?.members?.me || null) ||
        null;

    return Boolean(
        message?.guild &&
        permissions?.has?.(PermissionFlagsBits.Administrator)
    );
}

module.exports = {
    getAllowedPremiumOperatorIds,
    isAllowedPremiumOperator,
    isGuildPremiumAdmin,
};
