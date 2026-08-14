const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo');
const { EMOJI_VOICE, EMOJI_CATEGORY } = require("../config/constants");

// Models
const GuildConfig = require("../models/guildConfigSchema");
const UserCoin = require("../models/ncoinSchema");
const NcoinTopup = require("../models/ncoinTopupSchema");
const AutoResponderConfig = require("../models/autoResponderSchema");
const AutoReactConfig = require("../models/autoReactSchema");
const AutoRoleReactConfig = require("../models/autoRoleReactSchema");
const TempVC = require("../models/tempVcSchema");
const NSFWChannel = require("../models/nsfwChannelSchema");
const TaiXiuChannel = require("../models/taixiuChannelSchema");
const TopChannel = require("../models/topChannelSchema");
const Sticky = require("../models/Sticky");
const Afk = require("../models/afkSchema");
const ConfessReviewVoice = require("../models/ConfessReviewVoice");
const WarnThreshold = require("../models/WarnThreshold");
const WarnConfig = require("../models/WarnConfig");
const ModCase = require("../models/ModCase");
const Trigger = require("../models/triggerSchema");

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/discord-bot";
mongoose.connect(MONGO_URI)
  .then(() => console.log("[DASHBOARD] Connected to MongoDB"))
  .catch((err) => console.error("[DASHBOARD] MongoDB connection error:", err));

const app = express();
const adminKey = String(process.env.DASHBOARD_KEY || "khoideptraivl").trim();
const BOT_TOKEN = process.env.BOT_TOKEN || "";

// Helpers for Discord API
async function discordAPI(endpoint, options = {}) {
    if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
    const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });
    if (!res.ok) throw new Error(`Discord API Error: ${res.statusText}`);
    return res.json();
}

const CHANNEL_ID_REGEX = /^\d{16,20}$/;

function normalizeString(value) { return String(value || "").trim(); }

function normalizeChannelType(type) {
  if (typeof type === "number" && Number.isFinite(type)) return type;
  const value = String(type || "").trim().toUpperCase();
  if (/^\d+$/.test(value)) return Number(value);
  const typeMap = {
    GUILD_TEXT: 0, TEXT: 0, GUILD_VOICE: 2, VOICE: 2,
    GUILD_CATEGORY: 4, CATEGORY: 4, GUILD_ANNOUNCEMENT: 5, ANNOUNCEMENT: 5,
    ANNOUNCEMENT_THREAD: 10, PUBLIC_THREAD: 11, PRIVATE_THREAD: 12,
    GUILD_STAGE_VOICE: 13, STAGE: 13, GUILD_DIRECTORY: 14,
    GUILD_FORUM: 15, FORUM: 15, GUILD_MEDIA: 16, MEDIA: 16,
  };
  return typeMap[value] ?? -1;
}

const CHANNEL_KIND_GROUPS = {
  text: new Set([0, 5, 15, 16]),
  voice: new Set([2, 13]),
  category: new Set([4]),
};

function getChannelGroup(channelType) {
  const type = normalizeChannelType(channelType);
  if (CHANNEL_KIND_GROUPS.text.has(type)) return "text";
  if (CHANNEL_KIND_GROUPS.voice.has(type)) return "voice";
  if (CHANNEL_KIND_GROUPS.category.has(type)) return "category";
  return "other";
}

function getChannelLabel(channel, parentName = "") {
  const kind = getChannelGroup(channel?.type);
  const name = String(channel?.name || channel?.id || "channel");
  const suffix = parentName ? ` • ${parentName}` : "";
  if (kind === "voice") return `${EMOJI_VOICE} ${name}${suffix}`;
  if (kind === "category") return `${EMOJI_CATEGORY} ${name}`;
  if (kind === "text") return `# ${name}${suffix}`;
  return `• ${name}${suffix}`;
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Use path.join(__dirname, '../public') because this file is in api/
app.use(express.static(path.join(__dirname, "../public")));

app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'meow_hub_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
    const key = String(req.headers["x-admin-key"] || "").trim();
    if (!key || key !== adminKey) {
        return res.status(401).json({ error: "unauthorized", message: "Sai hoac thieu admin key." });
    }
    next();
}

// ------------------------------------------------------------------
// Xác thực người dùng thực sự có quyền quản lý guildId trong URL
// (trước đây các route /api/guilds/:guildId/* không hề kiểm tra gì,
// nghĩa là bất kỳ ai biết ID server đều đọc/sửa được cấu hình của server đó).
// Middleware này bắt buộc phải đăng nhập Discord OAuth (session.userToken)
// và guild đó phải nằm trong danh sách guild mà user là owner / có
// quyền Administrator hoặc Manage Guild.
// ------------------------------------------------------------------
const guildAccessCache = new Map(); // token -> { guildIds: Set, expires: number }
const GUILD_ACCESS_TTL_MS = 60 * 1000;

async function getAccessibleGuildIds(userToken) {
    const cached = guildAccessCache.get(userToken);
    if (cached && cached.expires > Date.now()) return cached.guildIds;

    const res = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${userToken}` },
    });
    if (!res.ok) throw new Error("discord_guilds_fetch_failed");
    const guilds = await res.json();

    const guildIds = new Set(
        guilds
            .filter((g) => {
                const isOwner = g.owner === true;
                const permissions = parseInt(g.permissions || "0", 10);
                const hasAdmin = (permissions & 0x8) === 0x8;
                const hasManageGuild = (permissions & 0x20) === 0x20;
                return isOwner || hasAdmin || hasManageGuild;
            })
            .map((g) => String(g.id))
    );

    guildAccessCache.set(userToken, { guildIds, expires: Date.now() + GUILD_ACCESS_TTL_MS });
    return guildIds;
}

async function requireGuildAccess(req, res, next) {
    try {
        const token = req.session && req.session.userToken;
        if (!token) return res.status(401).json({ error: "unauthorized", message: "Vui lòng đăng nhập Discord trước." });

        const guildId = String(req.params.guildId || "");
        if (!guildId) return res.status(400).json({ error: "missing_guild_id" });

        const accessible = await getAccessibleGuildIds(token);
        if (!accessible.has(guildId)) {
            return res.status(403).json({ error: "forbidden", message: "Bạn không có quyền quản lý server này." });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: "auth_check_failed" });
    }
}

app.post("/api/login", (req, res) => {
    const key = String(req.body.key || "").trim();
    if (!key) return res.status(400).json({ error: "key_required" });
    if (key !== adminKey) return res.status(401).json({ error: "invalid_key" });
    res.json({ ok: true });
});

// Since Bot is not running here, stats are mocked or fetched via another DB ping mechanism
app.get("/api/bot/stats", requireAuth, (req, res) => {
    res.json({
        ok: true,
        stats: {
            serverCount: "N/A (Vercel)",
            shardCount: 1,
            ping: 0,
            uptime: process.uptime(),
            status: "online",
            version: "1.0.0",
            memory: process.memoryUsage(),
        },
    });
});

app.get("/api/bot/guilds", requireAuth, async (req, res) => {
    try {
        const guilds = await discordAPI("/users/@me/guilds");
        const list = guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon, botInGuild: true }));
        res.json({ ok: true, guilds: list });
    } catch (e) {
        res.status(500).json({ error: "failed_to_fetch_guilds" });
    }
});

app.get("/api/bot/guild/:id/channels", requireAuth, async (req, res) => {
    try {
        const rawChannels = await discordAPI(`/guilds/${req.params.id}/channels`);
        const channels = rawChannels
            .filter(Boolean)
            .map((channel) => ({
                id: String(channel.id),
                name: String(channel.name || channel.id || "channel"),
                type: normalizeChannelType(channel.type),
                kind: getChannelGroup(channel.type),
                position: Number(channel.position || 0),
                parentId: channel.parent_id || "",
            }));
            
        const byId = new Map(channels.map((channel) => [channel.id, channel]));
        const result = channels
            .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "vi"))
            .map((channel) => ({
                ...channel,
                label: getChannelLabel(channel, byId.get(channel.parentId)?.name || ""),
            }));
        res.json({ ok: true, channels: result });
    } catch (err) { res.status(500).json({ error: "failed_to_fetch_channels" }); }
});

app.get("/api/bot/guild/:id/config", requireAuth, async (req, res) => {
    try {
        const guildId = String(req.params.id || "");
        const [doc, autoResponder, autoReact, autoRoleReact, tempVc, nsfw, taixiu, top] = await Promise.all([
            GuildConfig.findOne({ guildId }).lean(), AutoResponderConfig.findOne({ guildId }).lean(),
            AutoReactConfig.findOne({ guildId }).lean(), AutoRoleReactConfig.findOne({ guildId }).lean(),
            TempVC.findOne({ guildId }).lean(), NSFWChannel.findOne({ guildId }).lean(),
            TaiXiuChannel.findOne({ guildId }).lean(), TopChannel.findOne({ guildId }).lean(),
        ]);
        res.json({
            ok: true,
            config: {
                guildId, prefix: doc?.prefix || "?",
                ticket: { channelId: doc?.ticketChannelId || "", categoryId: doc?.ticketCategoryId || "", staffRoleId: doc?.ticketStaffRoleId || "", welcomeMessage: doc?.ticketWelcomeMessage || "", embedTitle: doc?.ticketEmbedTitle || "", embedDesc: doc?.ticketEmbedDesc || "", embedColor: doc?.ticketEmbedColor || "#FEA166", buttonLabel: doc?.ticketButtonLabel || "" },
                autoResponder: { enabled: Boolean(autoResponder?.enabled), rules: Array.isArray(autoResponder?.rules) ? autoResponder.rules : [] },
                autoReact: { enabled: Boolean(autoReact?.enabled), rules: Array.isArray(autoReact?.rules) ? autoReact.rules : [] },
                autoRoleReact: { enabled: Boolean(autoRoleReact?.enabled), items: Array.isArray(autoRoleReact?.items) ? autoRoleReact.items : [] },
                tempVc: { creatorChannelId: tempVc?.creatorChannelId || "", categoryId: tempVc?.categoryId || "" },
                nsfw: { channelIds: Array.isArray(nsfw?.channelIds) ? nsfw.channelIds : [] },
                taixiu: { channelIds: Array.isArray(taixiu?.channelIds) ? taixiu.channelIds : [] },
                top: { channelId: top?.channelId || "", messageId: top?.messageId || "" },
            },
        });
    } catch (err) { res.status(500).json({ error: "failed_to_fetch_config" }); }
});

app.post("/api/bot/guild/:id/config", requireAuth, async (req, res) => {
    try {
        const guildId = String(req.params.id || "");
        const data = req.body;
        if (data.prefix !== undefined) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { prefix: String(data.prefix || "?").trim().slice(0, 5) } }, { upsert: true });
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: "failed_to_update_config" }); }
});

app.post("/api/bot/guild/:id/send-message", requireAuth, async (req, res) => {
    try {
        const { channelId, content } = req.body;
        const msg = await discordAPI(`/channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content: String(content || "") })
        });
        res.json({ ok: true, messageId: msg.id });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

const AIChatSchema = require("../models/AIChatSchema");
const GiveawaySchema = require("../models/giveawaySchema");
const TicketSchema = require("../models/ticketSchema");

app.get("/api/data/:collection", requireAuth, async (req, res) => {
    try {
        const { collection } = req.params;
        const modelMap = { 
            guildconfigs: GuildConfig, usercoints: UserCoin, ncointopups: NcoinTopup, 
            autoresponders: AutoResponderConfig, autoreacts: AutoReactConfig, 
            autorolereacts: AutoRoleReactConfig, tempvcs: TempVC, nsfwchannels: NSFWChannel, 
            taixiuchannels: TaiXiuChannel, topchannels: TopChannel,
            aichats: AIChatSchema, giveaways: GiveawaySchema, tickets: TicketSchema
        };
        if (!modelMap[collection]) return res.status(400).json({ error: "invalid" });
        const docs = await modelMap[collection].find(req.query.guildId ? { guildId: String(req.query.guildId) } : {}).lean().limit(100);
        res.json({ ok: true, data: docs });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.get('/api/guilds/:guildId/advanced-config', requireGuildAccess, async (req, res) => {
    try {
        const config = await GuildConfig.findOne({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: { welcomeChannelId: config?.welcomeChannelId || "", autoRoleId: config?.autoRoleId || "", reactRoleId: config?.reactRoleId || "", welcomeMessage: config?.ticketWelcomeMessage || "" } });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/ticket-config', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const data = req.body;

        if (data.channelId && data.buttons) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { ticketChannelId: normalizeString(data.channelId), ticketStaffRoleId: normalizeString(data.roleId), ticketWelcomeMessage: normalizeString(data.author), ticketEmbedTitle: normalizeString(data.title), ticketEmbedDesc: normalizeString(data.desc), ticketEmbedColor: normalizeString(data.color || "#FEA166"), ticketButtonLabel: normalizeString(data.footer) } }, { upsert: true });
            
            // Re-written Discord.js send logic to pure REST API for Vercel
            const embed = {
                title: data.title || "Tạo Ticket",
                description: data.desc || "Bấm nút dưới để tạo ticket.",
                color: parseInt((data.color || "#FEA166").replace('#', ''), 16) || 16687462
            };
            if (data.author) embed.author = { name: data.author };
            if (data.thumbnail) { try { new URL(data.thumbnail); embed.thumbnail = { url: data.thumbnail }; } catch(e){} }
            if (data.banner) { try { new URL(data.banner); embed.image = { url: data.banner }; } catch(e){} }
            
            const components = [{
                type: 1, // ActionRow
                components: data.buttons.map(btn => ({
                    type: 2, // Button
                    style: btn.style === 'Secondary' ? 2 : 1,
                    label: btn.label,
                    custom_id: `ticket:${btn.customId}`,
                    emoji: btn.emoji ? { name: btn.emoji } : undefined
                }))
            }];

            await discordAPI(`/channels/${data.channelId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ embeds: [embed], components })
            }).catch(() => {});
            return res.json({ success: true });
        }

        if (data.welcomeChannelId) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { welcomeChannelId: normalizeString(data.welcomeChannelId), welcomeEmbedAuthor: normalizeString(data.welcomeAuthor), welcomeEmbedTitle: normalizeString(data.welcomeTitle), welcomeEmbedDesc: normalizeString(data.welcomeMessage), welcomeEmbedThumb: normalizeString(data.welcomeThumb), welcomeEmbedBanner: normalizeString(data.welcomeBanner), welcomeEmbedFooter: normalizeString(data.welcomeFooter), welcomeEmbedColor: normalizeString(data.welcomeColor) } }, { upsert: true });
            return res.json({ success: true });
        }

        if (data.autoRoleId) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { autoRoleId: normalizeString(data.autoRoleId) } }, { upsert: true });
            return res.json({ success: true });
        }

        if (data.reactRoleId) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { reactRoleId: normalizeString(data.reactRoleId) } }, { upsert: true });
            return res.json({ success: true });
        }

        if (data.reactRoleChannelId && data.reactionRoles) {
            const embed = {
                title: data.reactTitle || "Self Roles",
                description: data.reactDesc || "React để chọn role.",
                color: 16687462 // #FEA166
            };
            const msg = await discordAPI(`/channels/${data.reactRoleChannelId}/messages`, {
                method: 'POST',
                body: JSON.stringify({ embeds: [embed] })
            }).catch(() => null);

            if (msg && msg.id) {
                const items = [];
                for (const item of data.reactionRoles) {
                    if (item.emoji && item.roleId) {
                        // For standard emojis, encodeURIComponent is needed
                        const emojiEncoded = encodeURIComponent(item.emoji);
                        await discordAPI(`/channels/${data.reactRoleChannelId}/messages/${msg.id}/reactions/${emojiEncoded}/@me`, {
                            method: 'PUT'
                        }).catch(() => {});
                        items.push({ channelId: normalizeString(data.reactRoleChannelId), messageId: String(msg.id), roleId: normalizeString(item.roleId), emoji: `unicode:${item.emoji}`, emojiLabel: item.emoji });
                    }
                }
                await AutoRoleReactConfig.findOneAndUpdate({ guildId }, { $set: { enabled: true, items } }, { upsert: true });
            }
            return res.json({ success: true });
        }

        if (data.aiChannelId) {
            await GuildConfig.findOneAndUpdate({ guildId }, { $set: { aiChannelId: normalizeString(data.aiChannelId), aiSystemPrompt: normalizeString(data.aiPrompt) } }, { upsert: true });
            return res.json({ success: true });
        }
        return res.status(400).json({ error: "Invalid data" });
    } catch (err) { return res.status(500).json({ error: "err" }); }
});

// ========================================================
// CONFIG CHO LUỒNG WEB CÔNG KHAI (OAUTH2)
// ========================================================
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1491052906496131296'; 
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'Bj7U3xcyhqzxbVYTgtoo8RGPfHM6BIk4'; 
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://dashboardmeow.vercel.app/callback'; 

app.get('/public/login', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
    res.redirect(discordAuthUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code parameter.');
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const tokenData = await tokenResponse.json();
        if (!req.session) return res.status(500).send('Session missing.');
        req.session.userToken = tokenData.access_token;
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            res.redirect('/public/dashboard'); 
        });
    } catch (error) { res.status(500).send('Failed.'); }
});

app.get('/api/user/guilds', async (req, res) => {
    if (!req.session || !req.session.userToken) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const userGuildsResponse = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.userToken}` } });
        if (!userGuildsResponse.ok) return res.status(500).json({ error: 'Failed to fetch guilds from Discord' });
        
        const guilds = await userGuildsResponse.json();
        const botGuilds = await discordAPI('/users/@me/guilds').catch(() => []);
        const botGuildIds = new Set(botGuilds.map(g => g.id));
        
        const result = guilds.filter(g => {
            const isOwner = g.owner === true;
            const permissions = parseInt(g.permissions || "0");
            const hasAdmin = (permissions & 0x8) === 0x8;
            const hasManageGuild = (permissions & 0x20) === 0x20;
            return isOwner || hasAdmin || hasManageGuild;
        }).map(g => ({
            id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null, botInstalled: botGuildIds.has(String(g.id))
        }));
        res.json(result);
    } catch (error) { res.status(500).json({ error: 'Err' }); }
});

app.get('/api/guilds/:guildId/channels', requireGuildAccess, async (req, res) => {
    try {
        const channels = await discordAPI(`/guilds/${req.params.guildId}/channels`);
        res.json(channels.filter(ch => ch.type === 0).map(ch => ({ id: ch.id, name: ch.name, type: ch.type })));
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.get('/api/guilds/:guildId/roles', requireGuildAccess, async (req, res) => {
    try {
        const roles = await discordAPI(`/guilds/${req.params.guildId}/roles`);
        res.json(roles.filter(r => r.id !== req.params.guildId && r.name !== '@everyone' && !r.managed).map(r => ({ id: r.id, name: r.name, rawPosition: r.position })).sort((a,b)=>b.rawPosition-a.rawPosition));
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// AUTO-RESPONDER (TRIGGER) — dùng đúng model "Trigger" mà lệnh
// slash /trigger trên Discord đang thao tác, để dashboard và bot
// đồng bộ dữ liệu với nhau.
// ========================================================
app.get('/api/guilds/:guildId/triggers', requireGuildAccess, async (req, res) => {
    try {
        const items = await Trigger.find({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: items });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

const VALID_MATCH_TYPES = new Set(["exact", "includes", "startswith", "regex"]);

app.post('/api/guilds/:guildId/triggers', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const triggerWord = normalizeString(req.body.triggerWord).slice(0, 100);
        const response = normalizeString(req.body.response).slice(0, 1800);
        const matchType = VALID_MATCH_TYPES.has(req.body.matchType) ? req.body.matchType : "exact";

        if (!triggerWord) return res.status(400).json({ error: "trigger_word_required" });
        if (!response) return res.status(400).json({ error: "response_required" });

        if (matchType === "regex") {
            try { new RegExp(triggerWord); }
            catch (e) { return res.status(400).json({ error: "invalid_regex" }); }
        }

        await Trigger.findOneAndUpdate(
            { guildId, triggerWord },
            { $set: { response, matchType, addedBy: req.session.userToken ? "dashboard" : undefined } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) {
        if (err && err.code === 11000) return res.status(409).json({ error: "duplicate_trigger" });
        res.status(500).json({ error: "err" });
    }
});

app.delete('/api/guilds/:guildId/triggers/:triggerWord', requireGuildAccess, async (req, res) => {
    try {
        await Trigger.deleteOne({ guildId: req.params.guildId, triggerWord: req.params.triggerWord });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// ECONOMY (NCOIN) — Ncoin là ví tiền TOÀN CỤC theo userId (không
// tách theo guildId trong schema hiện tại). Để tránh admin của
// server A chỉnh sửa được ví của người không liên quan gì tới
// server A, route dưới đây luôn xác minh userId đó thực sự đang
// là member của guildId trước khi cho xem/sửa.
// ========================================================
async function assertGuildMember(guildId, userId) {
    try {
        await discordAPI(`/guilds/${guildId}/members/${userId}`);
        return true;
    } catch (e) {
        return false;
    }
}

app.get('/api/guilds/:guildId/economy/:userId', requireGuildAccess, async (req, res) => {
    try {
        const { guildId, userId } = req.params;
        const isMember = await assertGuildMember(guildId, userId);
        if (!isMember) return res.status(404).json({ error: "not_a_member", message: "User này không phải thành viên của server." });

        const doc = await UserCoin.findOne({ userId }).lean();
        res.json({
            success: true,
            data: {
                userId,
                coins: doc?.coins || 0,
                bank: doc?.bank || 0,
                lootbox: doc?.lootbox || 0,
                weaponsbox: doc?.weaponsbox || 0,
            },
        });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/economy/:userId/adjust', requireGuildAccess, async (req, res) => {
    try {
        const { guildId, userId } = req.params;
        const isMember = await assertGuildMember(guildId, userId);
        if (!isMember) return res.status(404).json({ error: "not_a_member", message: "User này không phải thành viên của server." });

        const amount = parseInt(req.body.amount, 10);
        if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: "invalid_amount" });

        const current = await UserCoin.findOne({ userId }).lean();
        const currentCoins = current?.coins || 0;
        if (amount < 0 && currentCoins + amount < 0) {
            return res.status(400).json({ error: "insufficient_balance", message: `Người dùng chỉ có ${currentCoins} Ncoin.` });
        }

        const updated = await UserCoin.findOneAndUpdate(
            { userId },
            { $inc: { coins: amount } },
            { upsert: true, new: true }
        );
        res.json({ success: true, data: { coins: updated.coins } });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// STICKY MESSAGES
// ========================================================
app.get('/api/guilds/:guildId/sticky', requireGuildAccess, async (req, res) => {
    try {
        const items = await Sticky.find({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: items });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/sticky', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const channelId = normalizeString(req.body.channelId);
        const content = normalizeString(req.body.content);
        const cooldown = Math.min(50, Math.max(1, parseInt(req.body.cooldown, 10) || 1));
        if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) return res.status(400).json({ error: "invalid_channel" });
        if (!content) return res.status(400).json({ error: "content_required" });

        await Sticky.findOneAndUpdate(
            { guildId, channelId },
            { $set: { content, cooldown }, $setOnInsert: { lastMessageId: null, counter: 0 } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.delete('/api/guilds/:guildId/sticky/:channelId', requireGuildAccess, async (req, res) => {
    try {
        await Sticky.deleteOne({ guildId: req.params.guildId, channelId: req.params.channelId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// AFK SYSTEM (chỉ xem / gỡ AFK hộ thành viên, không có "cấu hình" riêng)
// ========================================================
app.get('/api/guilds/:guildId/afk', requireGuildAccess, async (req, res) => {
    try {
        const items = await Afk.find({ guildId: req.params.guildId }).sort({ timestamp: -1 }).limit(100).lean();
        res.json({ success: true, data: items });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.delete('/api/guilds/:guildId/afk/:userId', requireGuildAccess, async (req, res) => {
    try {
        await Afk.deleteOne({ guildId: req.params.guildId, userId: req.params.userId });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// CONFESSION CONFIG
// ========================================================
app.get('/api/guilds/:guildId/confess-config', requireGuildAccess, async (req, res) => {
    try {
        const doc = await ConfessReviewVoice.findOne({ guildId: req.params.guildId }).lean();
        res.json({
            success: true,
            data: {
                confessChannel: doc?.confessChannel || "",
                reviewChannel: doc?.reviewChannel || "",
                voiceChannel: doc?.voiceChannel || "",
            },
        });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/confess-config', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const confessChannel = normalizeString(req.body.confessChannel);
        const reviewChannel = normalizeString(req.body.reviewChannel);
        const voiceChannel = normalizeString(req.body.voiceChannel);
        await ConfessReviewVoice.findOneAndUpdate(
            { guildId },
            { $set: { confessChannel, reviewChannel, voiceChannel } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// WARN THRESHOLD (auto-punishment)
// ========================================================
const VALID_THRESHOLD_ACTIONS = new Set(["mute", "kick", "ban", "timeout"]);

app.get('/api/guilds/:guildId/warn-threshold', requireGuildAccess, async (req, res) => {
    try {
        const doc = await WarnThreshold.findOne({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: { thresholds: doc?.thresholds || [] } });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/warn-threshold', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const raw = Array.isArray(req.body.thresholds) ? req.body.thresholds : [];
        const thresholds = raw
            .map((t) => ({
                count: Math.max(1, parseInt(t.count, 10) || 0),
                action: VALID_THRESHOLD_ACTIONS.has(t.action) ? t.action : "mute",
                durationMinutes: t.durationMinutes ? Math.max(1, parseInt(t.durationMinutes, 10)) : null,
            }))
            .filter((t) => t.count > 0)
            .sort((a, b) => a.count - b.count);

        await WarnThreshold.findOneAndUpdate({ guildId }, { $set: { thresholds } }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// MODERATION CASE LOG (chỉ xem — case được tạo từ lệnh slash trên Discord)
// ========================================================
app.get('/api/guilds/:guildId/mod-cases', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const filter = { guildId };
        if (req.query.userId) filter.userId = normalizeString(req.query.userId);
        if (req.query.type) filter.type = normalizeString(req.query.type);

        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const cases = await ModCase.find(filter).sort({ caseId: -1 }).limit(limit).lean();
        res.json({ success: true, data: cases });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.get('/api/guilds/:guildId/warns/:userId', requireGuildAccess, async (req, res) => {
    try {
        const doc = await WarnConfig.findOne({ guildId: req.params.guildId, userId: req.params.userId }).lean();
        res.json({ success: true, data: doc?.warns || [] });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// ========================================================
// PREMIUM STATUS (chỉ xem trạng thái — nâng cấp Premium do chủ bot xử lý riêng)
// ========================================================
app.get('/api/guilds/:guildId/premium', requireGuildAccess, async (req, res) => {
    try {
        const doc = await GuildConfig.findOne({ guildId: req.params.guildId }).lean();
        const premium = doc?.premium || {};
        res.json({
            success: true,
            data: {
                enabled: Boolean(premium.enabled),
                expiresAt: premium.expiresAt || null,
                botAvatarUrl: premium.botAvatarUrl || "",
                prefix: premium.prefix || "",
                music247Enabled: premium.music247Enabled !== false,
                aiAutomodEnabled: Boolean(premium.aiAutomodEnabled),
            },
        });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// Chỉ cho phép chủ server SỬA phần branding khi guild đã Premium — không tự bật Premium qua route này.
app.post('/api/guilds/:guildId/premium', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const doc = await GuildConfig.findOne({ guildId }).lean();
        if (!doc?.premium?.enabled) {
            return res.status(403).json({ error: "not_premium", message: "Server chưa nâng cấp Premium." });
        }
        const botAvatarUrl = normalizeString(req.body.botAvatarUrl);
        const prefix = normalizeString(req.body.prefix).slice(0, 5);
        const aiAutomodEnabled = Boolean(req.body.aiAutomodEnabled);
        const music247Enabled = req.body.music247Enabled !== false;

        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: {
                "premium.botAvatarUrl": botAvatarUrl,
                "premium.prefix": prefix,
                "premium.aiAutomodEnabled": aiAutomodEnabled,
                "premium.music247Enabled": music247Enabled,
            } }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

// Front-end routes for single-page-app
const serveIndex = (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'dashboardindex.html'));
app.get('/', serveIndex);
app.get('/dashboard', serveIndex);
app.get('/landing', serveIndex);

const serveDashboard = (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'user_index.html'));
app.get('/public/servers', serveDashboard);
app.get('/public/dashboard', serveDashboard);

const serveConfig = (req, res) => res.sendFile(path.join(__dirname, '../public', 'config.html'));
app.get('/public/config.html', serveConfig);
app.get('/public/config', serveConfig);

app.get('/user_public/docs.html', (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'docs.html')));

app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => res.redirect('/dashboard'));
    } else {
        res.redirect('/dashboard');
    }
});

// Export cho Vercel Serverless (Khong app.listen)
module.exports = app;
