const mongoose = require("mongoose");

const guildConfigSchema = new mongoose.Schema(
{
    guildId: {
        type: String,
        required: true,
        unique: true,
    },

    prefix: {
        type: String,
        default: "?",
    },

    levelUpMessageEnabled: {
        type: Boolean,
        default: true,
    },

    // ==========================================
    // 🔇 MODERATION CONFIGURATION
    // ==========================================
    muteRoleId: {
        type: String,
        default: null,
    },

    // ==========================================
    // 🔗 VERIFY / ANTI-LINK / TICKET (gộp từ GuildConfig.js cũ)
    // ==========================================
    antiLink: {
        type: Boolean,
        default: false,
    },
    verifyRole: {
        type: String,
        default: null,
    },
    supportRoles: {
        type: [String],
        default: [],
    },

    // ==========================================
    // 🛡️ ANTI-NUKE CONFIGURATION (Dành cho lệnh ?antinuke)
    // ==========================================
    antiNuke: {
        type: Boolean,
        default: false,
    },
    antiNukeMode: {
        type: String,
        enum: ["normal", "strict", "lockdown"],
        default: "normal",
    },
    antiNukePunishment: {
        type: String,
        enum: ["quarantine", "timeout", "kick", "ban"],
        default: "quarantine",
    },
    antiNukeWhitelist: {
        type: [String],
        default: [],
    },

    premium: {
        enabled: {
            type: Boolean,
            default: false,
        },
        setBy: {
            type: String,
            default: null,
        },
        setAt: {
            type: Date,
            default: null,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        botAvatarUrl: {
            type: String,
            default: "",
        },
        prefix: {
            type: String,
            default: "",
        },
        music247Enabled: {
            type: Boolean,
            default: true,
        },
        aiAutomodEnabled: {
            type: Boolean,
            default: false,
        },
    },

    // =========================
    // AI CONFIGURATION
    // =========================
    ai: {
        enabled: {
            type: Boolean,
            default: false,
        },
        channelId: {
            type: String,
            default: "",
        },
        model: {
            type: String,
            default: "llama-3.3-70b-versatile",
        },
        prompt: {
            type: String,
            default: "Bạn là một trợ lý ảo thông minh trên Discord.",
        }
    },

    // =========================
    // ANTI SCAM IMAGE CONFIGURATION
    // =========================
    antiScamImage: {
        type: Boolean,
        default: false,
    },

    // =========================
    // AUTO BYPASS SYSTEM
    // =========================
    autoBypass: {
        type: Boolean,
        default: false,
    },
    autoBypassChannels: {
        type: [String],
        default: [],
    }
},
{
    timestamps: true,
});

// Vá để tránh OverwriteModelError nếu file này lỡ bị require 2 lần
module.exports = mongoose.models.GuildConfig || mongoose.model("GuildConfig", guildConfigSchema);
