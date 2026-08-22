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
const TriggerIgnoreConfig = require("../models/TriggerIgnoreConfig");

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/discord-bot";
mongoose.connect(MONGO_URI)
  .then(() => console.log("[DASHBOARD] Connected to MongoDB"))
  .catch((err) => console.error("[DASHBOARD] MongoDB connection error:", err));

const app = express();
const adminKey = String(process.env.DASHBOARD_KEY || "khoideptraivl").trim();
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TOKEN || process.env.DISCORD_TOKEN || "";

// Helpers for Discord API
async function discordAPI(endpoint, options = {}) {
    if (!BOT_TOKEN) {
        console.error("[DISCORD API] Missing BOT_TOKEN/DISCORD_TOKEN environment variable!");
        throw new Error("Missing BOT_TOKEN environment variable.");
    }
    const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json",
            ...options.headers,
        },
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[DISCORD API ERROR] ${res.status} ${res.statusText} on ${endpoint}: ${errText}`);
        throw new Error(`Discord API Error (${res.status}): ${errText || res.statusText}`);
    }
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

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
// Use path.join(__dirname, '../public') because this file is in api/
app.use(express.static(path.join(__dirname, "../public")));

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

app.use(session({
    secret: process.env.SESSION_SECRET || 'meow_hub_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: {
        secure: isProduction,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
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
    if (!res.ok) {
        console.error(`[DISCORD OAUTH] Fetching @me/guilds failed: ${res.status}`);
        throw new Error("discord_guilds_fetch_failed");
    }
    const guilds = await res.json();

    const guildIds = new Set(
        guilds
            .filter((g) => {
                const isOwner = g.owner === true;
                const permissions = BigInt(g.permissions || "0");
                const hasAdmin = (permissions & 8n) === 8n;
                const hasManageGuild = (permissions & 32n) === 32n;
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

// BUG ĐÃ SỬA: trước đây chỉ có route POST cho ticket-config, không có GET.
// Frontend (loadGuildData) gọi GET /ticket-config lúc load trang để điền sẵn form —
// do route không tồn tại nên Promise.all trả về response 404 (HTML, không phải JSON).
// configRes.ok === false nên khối "if (configRes.ok)" bị bỏ qua im lặng, nhưng phần
// NGAY TRƯỚC nó (populate dropdown role/channel) đã chạy xong rồi — nên nếu bạn thấy
// dropdown role trống ngay từ đầu mỗi lần mở trang, khả năng cao do request tổng thể
// bị lỗi mạng/CORS ở bước Promise.all khiến toàn bộ catch() nuốt lỗi và không có gì
// được populate — route GET dưới đây trả JSON hợp lệ, tránh hẳn tình huống đó.
app.get('/api/guilds/:guildId/ticket-config', requireGuildAccess, async (req, res) => {
    try {
        const doc = await GuildConfig.findOne({ guildId: req.params.guildId }).lean();
        res.json({
            channelId: doc?.ticketChannelId || "",
            roleId: doc?.ticketStaffRoleId || "",
            author: doc?.ticketWelcomeMessage || "",
            title: doc?.ticketEmbedTitle || "",
            desc: doc?.ticketEmbedDesc || "",
            footer: doc?.ticketButtonLabel || "",
            color: doc?.ticketEmbedColor || "#FEA166",
            welcomeChannelId: doc?.welcomeChannelId || "",
            welcomeMessage: doc?.welcomeEmbedDesc || "",
            autoRoleId: doc?.autoRoleId || "",
            reactRoleId: doc?.reactRoleId || "",
            buttons: [],
        });
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
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://www.meowbot.xyz/callback'; 

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
            res.redirect('/dashboard'); 
        });
    } catch (error) { res.status(500).send('Failed.'); }
});

app.get('/api/user/guilds', async (req, res) => {
    if (!req.session || !req.session.userToken) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const userGuildsResponse = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${req.session.userToken}` } });
        if (!userGuildsResponse.ok) return res.status(500).json({ error: 'Failed to fetch guilds from Discord' });
        
        const guilds = await userGuildsResponse.json();
        const botGuilds = await discordAPI('/users/@me/guilds').catch((e) => {
            console.error('[BOT GUILDS FETCH ERROR]', e.message);
            return [];
        });
        const botGuildIds = new Set(botGuilds.map(g => String(g.id)));
        
        const result = guilds.filter(g => {
            const isOwner = g.owner === true;
            const permissions = BigInt(g.permissions || "0");
            const hasAdmin = (permissions & 8n) === 8n;
            const hasManageGuild = (permissions & 32n) === 32n;
            return isOwner || hasAdmin || hasManageGuild;
        }).map(g => ({
            id: String(g.id), name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null, botInstalled: botGuildIds.has(String(g.id))
        }));
        res.json(result);
    } catch (error) {
        console.error('[API USER GUILDS ERROR]', error);
        res.status(500).json({ error: 'Err' });
    }
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
        if (!Array.isArray(roles)) {
            console.error(`[ROLES ERROR] Expected array from Discord but got:`, roles);
            return res.status(500).json({ error: "Invalid roles response from Discord API" });
        }
        const filteredRoles = roles
            .filter(r => String(r.id) !== String(req.params.guildId) && r.name !== '@everyone')
            .map(r => ({
                id: String(r.id),
                name: r.name,
                rawPosition: r.position ?? 0,
                color: r.color,
                managed: !!r.managed
            }))
            .sort((a, b) => b.rawPosition - a.rawPosition);
        res.json(filteredRoles);
    } catch (err) {
        console.error(`[GET ROLES ERROR] Guild ID ${req.params.guildId}:`, err.message);
        res.status(500).json({ error: err.message || "Failed to fetch roles" });
    }
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
// TRIGGER IGNORE LIST (channel + role) — dùng chung model với
// lệnh /trigger ignore trên Discord để 2 bên luôn đồng bộ.
// ========================================================
app.get('/api/guilds/:guildId/trigger-ignore', requireGuildAccess, async (req, res) => {
    try {
        const doc = await TriggerIgnoreConfig.findOne({ guildId: req.params.guildId }).lean();
        res.json({ success: true, data: { ignoredChannels: doc?.ignoredChannels || [], ignoredRoles: doc?.ignoredRoles || [] } });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/trigger-ignore/channels', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const channelId = normalizeString(req.body.channelId);
        if (!channelId || !CHANNEL_ID_REGEX.test(channelId)) return res.status(400).json({ error: "invalid_channel" });

        await TriggerIgnoreConfig.findOneAndUpdate(
            { guildId },
            { $addToSet: { ignoredChannels: channelId } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.delete('/api/guilds/:guildId/trigger-ignore/channels/:channelId', requireGuildAccess, async (req, res) => {
    try {
        await TriggerIgnoreConfig.findOneAndUpdate(
            { guildId: req.params.guildId },
            { $pull: { ignoredChannels: req.params.channelId } }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/trigger-ignore/roles', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const roleId = normalizeString(req.body.roleId);
        if (!roleId || !CHANNEL_ID_REGEX.test(roleId)) return res.status(400).json({ error: "invalid_role" });

        await TriggerIgnoreConfig.findOneAndUpdate(
            { guildId },
            { $addToSet: { ignoredRoles: roleId } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.delete('/api/guilds/:guildId/trigger-ignore/roles/:roleId', requireGuildAccess, async (req, res) => {
    try {
        await TriggerIgnoreConfig.findOneAndUpdate(
            { guildId: req.params.guildId },
            { $pull: { ignoredRoles: req.params.roleId } }
        );
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
// NICKNAME MANAGER (suffix / reset hàng loạt)
// Lưu ý: server đông thành viên có thể mất vài phút và có nguy cơ
// bị timeout trên môi trường serverless (Vercel) — dùng lệnh
// /customlastnick trên Discord cho server rất lớn sẽ ổn định hơn.
// ========================================================
const NICKNAME_BATCH_LIMIT = 400; // giới hạn số thành viên xử lý / lần gọi để tránh timeout
const NICKNAME_RATE_DELAY_MS = 350;

async function fetchGuildMembersPage(guildId, limit = 1000, after = "0") {
    return discordAPI(`/guilds/${guildId}/members?limit=${limit}&after=${after}`);
}

app.post('/api/guilds/:guildId/nickname/suffix', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const suffix = normalizeString(req.body.suffix).slice(0, 24);
        if (!suffix) return res.status(400).json({ error: "suffix_required" });

        const guild = await discordAPI(`/guilds/${guildId}`);
        const members = await fetchGuildMembersPage(guildId, 1000);

        let success = 0, failed = 0, skipped = 0;
        let processed = 0;
        for (const m of members) {
            if (processed >= NICKNAME_BATCH_LIMIT) break;
            if (!m.user || m.user.bot || m.user.id === guild.owner_id) { skipped++; continue; }
            processed++;
            const base = m.nick || m.user.global_name || m.user.username;
            let newNick = `${base} ${suffix}`;
            if (newNick.length > 32) newNick = newNick.slice(0, 32);
            try {
                await discordAPI(`/guilds/${guildId}/members/${m.user.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ nick: newNick }),
                });
                success++;
            } catch (e) { failed++; }
            await new Promise(r => setTimeout(r, NICKNAME_RATE_DELAY_MS));
        }

        res.json({
            success: true,
            data: { updated: success, failed, skipped, totalFetched: members.length, truncated: members.length > NICKNAME_BATCH_LIMIT },
        });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

app.post('/api/guilds/:guildId/nickname/reset', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const guild = await discordAPI(`/guilds/${guildId}`);
        const members = await fetchGuildMembersPage(guildId, 1000);

        let success = 0, failed = 0, skipped = 0;
        let processed = 0;
        for (const m of members) {
            if (processed >= NICKNAME_BATCH_LIMIT) break;
            if (!m.user || m.user.bot || !m.nick || m.user.id === guild.owner_id) { skipped++; continue; }
            processed++;
            try {
                await discordAPI(`/guilds/${guildId}/members/${m.user.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ nick: null }),
                });
                success++;
            } catch (e) { failed++; }
            await new Promise(r => setTimeout(r, NICKNAME_RATE_DELAY_MS));
        }

        res.json({
            success: true,
            data: { reset: success, failed, skipped, totalFetched: members.length, truncated: members.length > NICKNAME_BATCH_LIMIT },
        });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

// ========================================================
// EMOJI & STICKER UPLOAD
// ========================================================
const EMOJI_MAX_BYTES = 256 * 1024;
const STICKER_MAX_BYTES = 512 * 1024;
const UPLOAD_NAME_REGEX = /^[a-zA-Z0-9_]{2,32}$/;

function parseDataUrl(dataUrl) {
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(String(dataUrl || ""));
    if (!match) return null;
    const buffer = Buffer.from(match[2], "base64");
    return { mime: match[1], buffer };
}

app.post('/api/guilds/:guildId/upload/emoji', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const name = normalizeString(req.body.name);
        if (!UPLOAD_NAME_REGEX.test(name)) return res.status(400).json({ error: "invalid_name" });

        const parsed = parseDataUrl(req.body.imageDataUrl);
        if (!parsed) return res.status(400).json({ error: "invalid_image" });
        if (parsed.buffer.length > EMOJI_MAX_BYTES) return res.status(400).json({ error: "too_large", message: "Emoji tối đa 256 KB." });

        const created = await discordAPI(`/guilds/${guildId}/emojis`, {
            method: "POST",
            body: JSON.stringify({ name, image: req.body.imageDataUrl }),
        });
        res.json({ success: true, data: created });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

app.post('/api/guilds/:guildId/upload/sticker', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const name = normalizeString(req.body.name).slice(0, 32);
        const tags = normalizeString(req.body.tags).slice(0, 200) || "🙂";
        const description = normalizeString(req.body.description).slice(0, 100) || name;
        if (name.length < 2) return res.status(400).json({ error: "invalid_name" });

        const parsed = parseDataUrl(req.body.imageDataUrl);
        if (!parsed) return res.status(400).json({ error: "invalid_image" });
        if (!["image/png", "image/gif", "image/apng"].includes(parsed.mime)) {
            return res.status(400).json({ error: "invalid_format", message: "Sticker chỉ nhận PNG hoặc GIF." });
        }
        if (parsed.buffer.length > STICKER_MAX_BYTES) return res.status(400).json({ error: "too_large", message: "Sticker tối đa 512 KB." });

        if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN environment variable.");

        // Discord yêu cầu multipart/form-data cho endpoint sticker (khác với emoji dùng JSON base64),
        // nên dùng thẳng fetch/FormData/Blob toàn cục của Node 18+ thay vì discordAPI() helper.
        const form = new FormData();
        form.append("name", name);
        form.append("tags", tags);
        form.append("description", description);
        form.append("file", new Blob([parsed.buffer], { type: parsed.mime }), `sticker.${parsed.mime.split("/")[1]}`);

        const stickerRes = await globalThis.fetch(`https://discord.com/api/v10/guilds/${guildId}/stickers`, {
            method: "POST",
            headers: { Authorization: `Bot ${BOT_TOKEN}` },
            body: form,
        });
        if (!stickerRes.ok) {
            const errText = await stickerRes.text().catch(() => "");
            throw new Error(`Discord API Error (${stickerRes.status}): ${errText}`);
        }
        const created = await stickerRes.json();
        res.json({ success: true, data: created });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

// ========================================================
// SERVER BACKUP & RESTORE
// Dùng đúng thuật toán mã hoá (XOR keystream từ SECRET_KEY) như lệnh
// /backup trên Discord, để 2 bên đọc chung 1 định dạng file .txt.
// LƯU Ý BẢO MẬT: đây là mã hoá đối xứng yếu (không phải chuẩn AEAD),
// và SECRET_KEY đang nằm cứng trong mã nguồn công khai — file backup
// KHÔNG nên coi là "an toàn tuyệt đối" nếu source bị lộ, chỉ nên xem
// là chống đọc nhầm/đọc lướt qua.
// ========================================================
const crypto = require("crypto");
const BACKUP_SECRET_KEY = "HUiuejrPbUudXS3PhD6VyvucELQmF2jj";

function backupKeystream(length) {
    const key = crypto.createHash("sha256").update(BACKUP_SECRET_KEY).digest();
    let out = Buffer.alloc(0);
    let counter = 0;
    while (out.length < length) {
        const counterBuffer = Buffer.alloc(4);
        counterBuffer.writeUInt32BE(counter, 0);
        const hash = crypto.createHash("sha256").update(Buffer.concat([key, counterBuffer])).digest();
        out = Buffer.concat([out, hash]);
        counter++;
    }
    return out.subarray(0, length);
}

function backupEncrypt(data) {
    const raw = Buffer.from(data, "utf8");
    const ks = backupKeystream(raw.length);
    const encrypted = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) encrypted[i] = raw[i] ^ ks[i];
    return encrypted.toString("base64");
}

function backupDecrypt(data) {
    const raw = Buffer.from(data, "base64");
    const ks = backupKeystream(raw.length);
    const decrypted = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) decrypted[i] = raw[i] ^ ks[i];
    return decrypted.toString("utf8");
}

async function requireGuildOwner(req, res, next) {
    try {
        const guild = await discordAPI(`/guilds/${req.params.guildId}`);
        const meRes = await globalThis.fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${req.session.userToken}` },
        });
        const me = await meRes.json();
        if (String(guild.owner_id) !== String(me.id)) {
            return res.status(403).json({ error: "owner_only", message: "Chỉ chủ sở hữu server mới được restore backup." });
        }
        next();
    } catch (err) { res.status(500).json({ error: "err" }); }
}

app.post('/api/guilds/:guildId/backup/create', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const guild = await discordAPI(`/guilds/${guildId}`);
        const roles = await discordAPI(`/guilds/${guildId}/roles`);
        const channels = await discordAPI(`/guilds/${guildId}/channels`);

        const backup = { name: guild.name, roles: [], categories: [], channels: [] };

        const roleNameById = new Map(roles.map(r => [r.id, r.name]));
        roles
            .filter(r => r.name !== "@everyone" && !r.managed)
            .sort((a, b) => b.position - a.position)
            .forEach(r => backup.roles.push({
                name: r.name, color: r.color, hoist: r.hoist,
                permissions: String(r.permissions), mentionable: r.mentionable,
            }));

        const buildPerms = (overwrites) => (overwrites || [])
            .filter(ow => ow.type === 0) // 0 = role overwrite
            .map(ow => ({
                name: ow.id === guildId ? "@everyone" : (roleNameById.get(ow.id) || null),
                type: "role", allow: ow.allow, deny: ow.deny,
            }))
            .filter(p => p.name);

        const categories = channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
        categories.forEach(cat => backup.categories.push({
            name: cat.name, position: cat.position, permissions: buildPerms(cat.permission_overwrites),
        }));

        const categoryNameById = new Map(categories.map(c => [c.id, c.name]));
        channels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position).forEach(ch => backup.channels.push({
            name: ch.name, type: ch.type, topic: ch.topic || null, nsfw: ch.nsfw || false,
            bitrate: ch.bitrate || null, userLimit: ch.user_limit || null, rateLimitPerUser: ch.rate_limit_per_user || null,
            parentName: ch.parent_id ? (categoryNameById.get(ch.parent_id) || null) : null,
            position: ch.position, permissions: buildPerms(ch.permission_overwrites),
        }));

        const encrypted = backupEncrypt(JSON.stringify(backup, null, 2));
        const sanitized = String(guild.name).replace(/[^a-zA-Z0-9_-]/g, "_");
        res.json({
            success: true,
            data: {
                filename: `backup_${sanitized}_${Date.now()}.txt`,
                content: encrypted,
                stats: { roles: backup.roles.length, categories: backup.categories.length, channels: backup.channels.length },
            },
        });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

app.post('/api/guilds/:guildId/backup/restore', requireGuildAccess, requireGuildOwner, async (req, res) => {
    try {
        const { guildId } = req.params;
        const fileText = normalizeString(req.body.content);
        if (!fileText) return res.status(400).json({ error: "content_required" });

        let backupData;
        try {
            backupData = JSON.parse(backupDecrypt(fileText));
        } catch (e) {
            return res.status(400).json({ error: "invalid_backup_file" });
        }
        if (!backupData || !Array.isArray(backupData.roles) || !Array.isArray(backupData.channels)) {
            return res.status(400).json({ error: "corrupted_backup" });
        }

        const roleIdByName = new Map();
        for (const r of backupData.roles.slice().reverse()) {
            try {
                const created = await discordAPI(`/guilds/${guildId}/roles`, {
                    method: "POST",
                    body: JSON.stringify({
                        name: r.name, color: r.color, hoist: r.hoist,
                        permissions: r.permissions || "0", mentionable: r.mentionable,
                    }),
                });
                roleIdByName.set(r.name, created.id);
            } catch (e) {}
        }

        const resolveOverwrites = (perms) => (perms || [])
            .map(p => {
                const id = p.name === "@everyone" ? guildId : roleIdByName.get(p.name);
                if (!id) return null;
                return { id, type: 0, allow: p.allow || "0", deny: p.deny || "0" };
            })
            .filter(Boolean);

        const categoryIdByName = new Map();
        if (Array.isArray(backupData.categories)) {
            for (const cat of backupData.categories) {
                try {
                    const created = await discordAPI(`/guilds/${guildId}/channels`, {
                        method: "POST",
                        body: JSON.stringify({
                            name: cat.name, type: 4, position: cat.position,
                            permission_overwrites: resolveOverwrites(cat.permissions),
                        }),
                    });
                    categoryIdByName.set(cat.name, created.id);
                } catch (e) {}
            }
        }

        let createdChannels = 0, failedChannels = 0;
        for (const ch of backupData.channels) {
            try {
                await discordAPI(`/guilds/${guildId}/channels`, {
                    method: "POST",
                    body: JSON.stringify({
                        name: ch.name, type: ch.type, topic: ch.topic || undefined, nsfw: ch.nsfw || false,
                        bitrate: ch.bitrate || undefined, user_limit: ch.userLimit || undefined,
                        rate_limit_per_user: ch.rateLimitPerUser || undefined,
                        parent_id: ch.parentName ? (categoryIdByName.get(ch.parentName) || undefined) : undefined,
                        permission_overwrites: resolveOverwrites(ch.permissions),
                    }),
                });
                createdChannels++;
            } catch (e) { failedChannels++; }
        }

        res.json({
            success: true,
            data: { rolesCreated: roleIdByName.size, categoriesCreated: categoryIdByName.size, channelsCreated: createdChannels, channelsFailed: failedChannels },
        });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

// ========================================================
// HONEYPOT — tạo kênh bẫy tự động
// ========================================================
app.post('/api/guilds/:guildId/honeypot', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const channelName = normalizeString(req.body.channelName) || "verify-here";
        const guild = await discordAPI(`/guilds/${guildId}`);

        const trapChannel = await discordAPI(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
                name: channelName,
                type: 0,
                position: 0,
                topic: "⚠️ HONEYPOT TRAP - DO NOT TALK HERE. Anyone chatting will be banned automatically.",
                permission_overwrites: [{
                    id: guildId, type: 0,
                    allow: String(0x400 | 0x800 | 0x10000), // ViewChannel | SendMessages | ReadMessageHistory
                    deny: String(0x40),                     // AddReactions
                }],
            }),
        });

        await discordAPI(`/channels/${trapChannel.id}/messages`, {
            method: "POST",
            body: JSON.stringify({
                embeds: [{
                    title: "🍯 HoneyPot System",
                    description: `Kênh bẫy đã được thiết lập trên **${guild.name}**!\n\nBất kỳ ai nhắn tin vào <#${trapChannel.id}> sẽ bị **ban tự động ngay lập tức**.`,
                    color: 0xfea166,
                }],
            }),
        }).catch(() => {});

        res.json({ success: true, data: { channelId: trapChannel.id, channelName: trapChannel.name } });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

// ========================================================
// MASS MANAGER — audit sức khoẻ server (chỉ đọc, không thay đổi gì)
// ========================================================
app.get('/api/guilds/:guildId/mass-manager/audit', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const [roles, channels, members] = await Promise.all([
            discordAPI(`/guilds/${guildId}/roles`),
            discordAPI(`/guilds/${guildId}/channels`),
            discordAPI(`/guilds/${guildId}/members?limit=1000`),
        ]);

        const ADMIN_BIT = 0x8n;
        const adminRoles = roles.filter(r => (BigInt(r.permissions) & ADMIN_BIT) === ADMIN_BIT);

        const textCount = channels.filter(c => c.type === 0).length;
        const voiceCount = channels.filter(c => c.type === 2).length;
        const catCount = channels.filter(c => c.type === 4).length;

        const memberCountByRole = new Map();
        members.forEach(m => (m.roles || []).forEach(rid => memberCountByRole.set(rid, (memberCountByRole.get(rid) || 0) + 1)));
        const unusedRoles = roles.filter(r => r.name !== "@everyone" && !r.managed && !memberCountByRole.get(r.id));

        const botCount = members.filter(m => m.user && m.user.bot).length;

        // Kiểm tra quyền của chính bot trong server.
        let missingPerms = [];
        try {
            const me = await discordAPI(`/guilds/${guildId}/members/@me`);
            const perms = (me.roles || []).reduce((acc, rid) => {
                const role = roles.find(r => r.id === rid);
                return role ? acc | BigInt(role.permissions) : acc;
            }, 0n);
            const NEEDED = { "Manage Roles": 0x10000000n, "Manage Channels": 0x10n, "Kick Members": 0x2n, "Ban Members": 0x4n };
            missingPerms = Object.entries(NEEDED).filter(([, bit]) => (perms & bit) !== bit).map(([label]) => label);
        } catch (e) { /* bỏ qua nếu không lấy được */ }

        res.json({
            success: true,
            data: {
                adminRoles: adminRoles.map(r => r.name),
                channelHealth: { total: channels.length, text: textCount, voice: voiceCount, category: catCount },
                unusedRoles: unusedRoles.map(r => r.name),
                botCount,
                missingPerms,
                memberSampleSize: members.length,
                truncated: members.length >= 1000,
            },
        });
    } catch (err) { res.status(500).json({ error: "err", message: err.message }); }
});

// ========================================================
// PREMIUM STATUS (chỉ xem trạng thái — nâng cấp Premium do chủ bot xử lý riêng)
// ========================================================
// ========================================================
// AI ASSISTANT — bật/tắt AI tự trả lời trong 1 kênh chỉ định,
// chọn model và system prompt tuỳ chỉnh.
// ========================================================
app.get('/api/guilds/:guildId/ai-config', requireGuildAccess, async (req, res) => {
    try {
        const doc = await GuildConfig.findOne({ guildId: req.params.guildId }).lean();
        const ai = doc?.ai || {};
        res.json({
            success: true,
            data: {
                enabled: Boolean(ai.enabled),
                channelId: ai.channelId || "",
                model: ai.model || "llama-3.3-70b-versatile",
                prompt: ai.prompt || "Bạn là một trợ lý ảo thông minh trên Discord.",
            },
        });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

app.post('/api/guilds/:guildId/ai-config', requireGuildAccess, async (req, res) => {
    try {
        const { guildId } = req.params;
        const enabled = Boolean(req.body.enabled);
        const channelId = normalizeString(req.body.channelId);
        const model = normalizeString(req.body.model).slice(0, 100) || "llama-3.3-70b-versatile";
        const prompt = normalizeString(req.body.prompt).slice(0, 2000) || "Bạn là một trợ lý ảo thông minh trên Discord.";

        if (enabled && (!channelId || !CHANNEL_ID_REGEX.test(channelId))) {
            return res.status(400).json({ error: "channel_required", message: "Cần chọn kênh trước khi bật AI." });
        }

        await GuildConfig.findOneAndUpdate(
            { guildId },
            { $set: { "ai.enabled": enabled, "ai.channelId": channelId, "ai.model": model, "ai.prompt": prompt } },
            { upsert: true }
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "err" }); }
});

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

// Front-end routes
const serveIndex = (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'dashboardindex.html'));
app.get('/', serveIndex);
app.get('/landing', serveIndex);

const serveDashboard = (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'user_index.html'));
app.get('/dashboard', serveDashboard);
app.get(['/public/dashboard', '/public/servers', '/servers'], (req, res) => res.redirect(301, '/dashboard'));

const serveConfig = (req, res) => res.sendFile(path.join(__dirname, '../public', 'config.html'));
app.get('/config', serveConfig);
// BUG ĐÃ SỬA: redirect cũ dùng res.redirect(301, '/config') — bỏ luôn query string
// (?guildId=...) trong lúc redirect. Nếu link cũ/bookmark nào trỏ vào /public/config.html?guildId=X
// thì sau redirect sẽ mất sạch guildId, khiến trang /config load lên KHÔNG có guildId,
// và mọi API gọi role/channel/config đều fail cho MỌI server (không phải lỗi riêng của
// từng server) — đúng triệu chứng "không tìm được role ở từng server". Giờ giữ nguyên query string.
app.get(['/public/config', '/public/config.html'], (req, res) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, '/config' + qs);
});

const serveDocs = (req, res) => res.sendFile(path.join(__dirname, '../public', 'user_public', 'docs.html'));
app.get('/docs', serveDocs);
app.get(['/docs.html', '/user_public/docs.html'], (req, res) => res.redirect(301, '/docs'));

app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => res.redirect('/'));
    } else {
        res.redirect('/');
    }
});

// Export cho Vercel Serverless (Khong app.listen)
module.exports = app;
