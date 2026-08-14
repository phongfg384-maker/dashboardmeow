const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { Riffy } = require("riffy");
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
const { loadImage } = require("@napi-rs/canvas");

const {
    isPremiumEnabled,
    getPremiumConfig,
    isPremiumMusic247Enabled,
    setPremiumMusic247Enabled,
} = require("./guildConfigManager");
const { isGuildPremiumAdmin } = require("./premiumAccess");
const {
    EMOJI_PLAY, EMOJI_PAUSE, EMOJI_SKIP, EMOJI_STOP, EMOJI_LOOP,
    EMOJI_SHUFFLE, EMOJI_QUEUE, EMOJI_VOLUME, EMOJI_VOLUME_UP, EMOJI_NOWPLAYING,
    EMOJI_LEAVE, EMOJI_247, EMOJI_STATUS, EMOJI_MEMBER,
} = require("./constants");

// Database Thống kê
const MusicStats = require("../models/MusicStats"); 
const trackStartTimes = new Map();

// 📁 Đường dẫn ảnh logo
const SOUNDCLOUD_LOGO_PATH = path.join(__dirname, "soundcloud.png");
const SPOTIFY_LOGO_PATH = path.join(__dirname, "spotify.png");
const YOUTUBE_MUSIC_LOGO_PATH = path.join(__dirname, "YouTubeMusic.png");

// 🌟 DANH SÁCH NODE LAVALINK PUBLIC V4 (Đã bật SSL/WSS, không bị chặn UDP)
const LAVALINK_NODES = [
    {
        name: "Kitsune-Public-Node",
        host: "node.kitsune.wtf",
        port: 443,
        password: "kitsune.wtf",
        secure: true,
    },
    {
        name: "Ajidev-Public-Node",
        host: "lava-v4.ajieblogs.eu.org",
        port: 443,
        password: "https://dsc.gg/ajidevserver",
        secure: true,
    },
    {
        name: "Serenetia-Public-Node",
        host: "lavalinkv4.serenetia.com",
        port: 443,
        password: "https://seretia.link/discord",
        secure: true,
    }
];

const panelUpdateLocks = new Map();
const freeTierTimers = new Map();
const playerDataStore = new Map();
const FREE_TIER_LIMIT_MS = 60 * 60 * 1000;
function resolveTrackUri(track) { return track?.info?.uri ?? track?.uri ?? null; }
function resolveTrackTitle(track) { return track?.info?.title ?? track?.title ?? "Unknown title"; }
function resolveTrackAuthor(track) { return track?.info?.author ?? track?.author ?? "Unknown artist"; }
function resolveTrackThumbnail(track) {
    if (!track?.info) return track?.artworkUrl ?? null;
    return track.info.thumbnail ?? track.rawData?.info?.artworkUrl ?? null;
}
function resolveTrackRequester(track) { return track?.info?.requester ?? track?.userData?.requester; }

function playerSet(guildId, key, value) {
    if (!playerDataStore.has(guildId)) playerDataStore.set(guildId, {});
    playerDataStore.get(guildId)[key] = value;
}
function playerGet(guildId, key) { return playerDataStore.get(guildId)?.[key]; }
function playerClear(guildId) { playerDataStore.delete(guildId); }

function formatDuration(ms) {
    if (!ms || ms <= 0) return "LIVE";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return [hours, String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")].join(":");
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function formatDurationFull(ms) {
    if (!ms || ms <= 0) return "LIVE";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}
function buildProgressBar(currentMs, totalMs, barLength = 16) { return null; }
function getPlayer(client, guildId) { return client?.manager?.players?.get(guildId) || null; }
function getVoiceChannelId(member) { return member?.voice?.channelId || null; }
function getLoopLabel(loop) { return loop === "track" ? "Track" : loop === "queue" ? "Queue" : "Off"; }

function canControl(client, player, member) {
    if (!player || !player.voiceChannel) return true;
    const channel = member.guild.channels.cache.get(String(player.voiceChannel));
    if (!channel) return true;
    const humans = [...channel.members.values()].filter(m => !m.user.bot);
    if (humans.length === 0) return true;
    return humans[0].id === member.id;
}

function hasConnectedNode(client) {
    try {
        const map = client?.manager?.nodeMap;
        if (!map?.size) return false;
        return [...map.values()].some((node) => node.connected);
    } catch { return false; }
}
async function waitForConnectedNode(client, timeoutMs = 10000, intervalMs = 500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (hasConnectedNode(client)) return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return hasConnectedNode(client);
}
function assertSameVoiceChannel(player, member) {
    const memberChannelId = getVoiceChannelId(member);
    if (!memberChannelId) return "Join a voice channel first.";
    if (player?.voiceChannel && player.voiceChannel !== memberChannelId) return "You must be in the same voice channel as the bot.";
    return null;
}

function isHttpUrl(value) { return /^https?:\/\//i.test(String(value || "").trim()); }
function parseUrlInput(value) {
    const raw = String(value || "").trim();
    if (!isHttpUrl(raw)) return null;
    try { return new URL(raw); } catch { return null; }
}
function normalizeLoopMode(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["track", "queue", "none"].includes(raw) ? raw : null;
}
function parse247Mode(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw || ["toggle", "default"].includes(raw)) return null;
    if (["on", "enable", "enabled", "true", "1"].includes(raw)) return true;
    if (["off", "disable", "disabled", "false", "0"].includes(raw)) return false;
    return null;
}

async function expandShortenUrl(url) {
    try {
        if (!/on\.soundcloud\.com|youtu\.be|bit\.ly|tinyurl\.com/i.test(url)) return url;
        const response = await fetch(url, { method: "HEAD", redirect: "follow" });
        return response.url || url;
    } catch { return url; }
}

async function fetchSpotifyMeta(spotifyUrl) {
    try {
        const match = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
        if (!match) return null;
        const trackId = match[1];
        const res = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.title ? `${data.title} ${data.author_name || ""}`.trim() : null;
    } catch { return null; }
}

// 🎨 Hàm vẽ logo nguồn nhạc bo tròn (Đã sửa lỗi ERR_INVALID_PROTOCOL)
async function drawCircularPlatformIcon(ctx, trackUri, x, y, size = 36) {
    const uri = String(trackUri || "").toLowerCase();
    
    let targetPath = YOUTUBE_MUSIC_LOGO_PATH;
    if (uri.includes("spotify.com")) {
        targetPath = SPOTIFY_LOGO_PATH;
    } else if (uri.includes("soundcloud.com")) {
        targetPath = SOUNDCLOUD_LOGO_PATH;
    } else if (uri.includes("youtube.com") || uri.includes("youtu.be")) {
        targetPath = YOUTUBE_MUSIC_LOGO_PATH;
    }

    try {
        if (fs.existsSync(targetPath)) {
            const imageBuffer = fs.readFileSync(targetPath);
            const iconImg = await loadImage(imageBuffer);

            // ✂️ TẠO VÙNG CẮT HÌNH TRÒN ĐỂ XÓA NỀN TRẮNG VÀ VIỀN VUÔNG
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip(); // Cắt theo đường tròn

            // Vẽ logo lấp đầy ô tròn
            ctx.drawImage(iconImg, x, y, size, size);
            ctx.restore(); // Khôi phục trạng thái canvas
        }
    } catch (error) {
        console.error("Lỗi khi vẽ logo nguồn nhạc bo tròn:", error);
    }
}
                                       
// 📊 Hàm cập nhật thống kê Database
async function updateDatabaseStats(client, guildId) {
    console.log(`\n--- BẮT ĐẦU TEST LƯU DATA CHO GUILD ${guildId} ---`);
    const session = trackStartTimes.get(guildId);
    
    if (!session) {
        console.log(`❌ THẤT BẠI: Không tìm thấy thời gian bắt đầu bài hát.`);
        return;
    }
    
    trackStartTimes.delete(guildId);
    const duration = Date.now() - session.startTime;
    console.log(`⏱️ Thời gian bạn đã nghe: ${duration} ms (${Math.floor(duration/1000)}s)`);
    
    if (duration < 5000) {
        console.log(`❌ THẤT BẠI: Chưa đủ 5 giây, hệ thống hủy lưu.`);
        return;
    }

    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = await guild.channels.fetch(session.voiceChannelId).catch(() => null);
        if (!channel) return;

        const membersInRoom = [...channel.members.values()].filter(m => !m.user.bot);
        if (membersInRoom.length === 0) return;

        const cleanTrackTitle = String(session.trackTitle || "Unknown Track").replace(/[\.\$]/g, "_");

        for (const member of membersInRoom) {
            const incQuery = {};
            incQuery[`servers.${guildId}`] = duration;
            incQuery[`tracks.${cleanTrackTitle}`] = duration;

            for (const friend of membersInRoom) {
                if (friend.id === member.id) continue;
                incQuery[`friends.${friend.id}`] = duration;
            }

            await MusicStats.findOneAndUpdate(
                { userId: member.id },
                { 
                    $inc: incQuery,
                    $set: { lastTrackUri: session.trackUri } 
                },
                { upsert: true, new: true }
            );
        }
        console.log(`[MUSIC STATS] 🎉 ĐÃ LƯU THÀNH CÔNG CHO ${membersInRoom.length} NGƯỜI!\n-----------------------------------------`);
    } catch (err) {
        console.error(`❌ THẤT BẠI: LỖI HỆ THỐNG MONGODB:`, err);
    }
}
async function loadTracks(client, query, requester) {
    let cleanQuery = String(query || "").trim();

    if (/https?:\/\//i.test(cleanQuery)) {
        try { cleanQuery = encodeURI(cleanQuery); } catch (e) { console.error("Lỗi encode URL:", e); }
        if (!/on\.soundcloud\.com/i.test(cleanQuery)) {
            cleanQuery = cleanQuery.replace(/\s+/g, "");
        } else {
            const matchUrl = cleanQuery.match(/https:\/\/on\.soundcloud\.com\/[^\s]+/i);
            if (matchUrl) cleanQuery = matchUrl[0];
        }
    }
    if (/music\.youtube\.com/i.test(cleanQuery)) { cleanQuery = cleanQuery.replace(/music\.youtube\.com/i, "youtube.com"); }
    if (/spotify\.com/i.test(cleanQuery)) {
        const textMeta = await fetchSpotifyMeta(cleanQuery);
        if (textMeta) cleanQuery = textMeta;
    }
    cleanQuery = await expandShortenUrl(cleanQuery);
    const parsedUrl = parseUrlInput(cleanQuery);

    if (parsedUrl) {
        const result = await client.manager.resolve({ query: cleanQuery, requester }).catch(() => null);
        if (result?.tracks?.length && !["error", "empty", "no_matches", "load_failed"].includes(String(result.loadType).toLowerCase())) return result;
    }
    if (!parsedUrl) {
        let result = await client.manager.resolve({ query: cleanQuery, source: "ytmsearch", requester }).catch(() => null);
        let tracks = result?.tracks || [];

        if (tracks.length > 0) {
            if (!/(slowed|remix|reverb|speed|lofi)/i.test(cleanQuery)) {
                const originalTrack = tracks.find(t => !/(slowed|remix|reverb|speed|ultra slowed|lofi)/i.test(resolveTrackTitle(t)));
                if (originalTrack) {
                    result.tracks = [originalTrack, ...tracks.filter(t => t !== originalTrack)];
                    return result;
                }
            }
            return result;
        }

        const ytFallback = await client.manager.resolve({ query: cleanQuery, source: "ytsearch", requester }).catch(() => null);
        if (ytFallback?.tracks?.length) {
            let ytTracks = ytFallback.tracks;
            if (!/(slowed|remix|reverb|speed|lofi)/i.test(cleanQuery)) {
                const originalYt = ytTracks.find(t => !/(slowed|remix|reverb|speed|ultra slowed|lofi)/i.test(resolveTrackTitle(t)));
                if (originalYt) {
                    ytFallback.tracks = [originalYt, ...ytTracks.filter(t => t !== originalYt)];
                }
            }
            return ytFallback;
        }
    }
    return { loadType: null, tracks: [], playlistInfo: null, pluginInfo: {}, exception: null };
}

function buildMusicButtons(player, disabled = false) {
    const paused = Boolean(player?.paused);
    const loop = player?.loop || "none";
    const queueLength = player?.queue?.size || 0;
    const isLive = !player?.current?.duration;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("music:replay").setEmoji(EMOJI_PLAY).setLabel("Replay").setStyle(ButtonStyle.Secondary).setDisabled(disabled || isLive),
        new ButtonBuilder().setCustomId("music:pause").setEmoji(paused ? EMOJI_PLAY : EMOJI_PAUSE).setLabel(paused ? "Resume" : "Pause").setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:skip").setEmoji(EMOJI_SKIP).setLabel("Skip").setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:stop").setEmoji(EMOJI_STOP).setLabel("Stop").setStyle(ButtonStyle.Danger).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:loop").setEmoji(EMOJI_LOOP).setLabel(`Loop: ${getLoopLabel(loop)}`).setStyle(loop !== "none" ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("music:queue").setEmoji(EMOJI_QUEUE).setLabel("Queue").setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:volume_down").setEmoji(EMOJI_VOLUME).setLabel("Vol -").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:volume_up").setEmoji(EMOJI_VOLUME_UP).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        new ButtonBuilder().setCustomId("music:shuffle").setEmoji(EMOJI_SHUFFLE).setLabel("Shuffle").setStyle(ButtonStyle.Secondary).setDisabled(disabled || queueLength < 2),
        new ButtonBuilder().setCustomId("music:leave").setEmoji(EMOJI_LEAVE).setLabel("Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
    return [row1, row2];
}

function buildQueueEmbed(player) {
    const current = player?.current || null;
    const queueLen = player?.queue?.size || 0;
    const embed = new EmbedBuilder().setColor(0xFEA166).setTitle("<:queue:1502725083456868473> Music Queue");

    if (!current && !queueLen) {
        embed.setDescription("*Queue is empty. Use `/play` to add tracks.*");
        embed.addFields(
            { name: `${EMOJI_STATUS} Status`, value: "`Idle`", inline: true },
            { name: `${EMOJI_QUEUE} Tracks`, value: "`0`", inline: true },
            { name: `${EMOJI_LOOP} Loop`, value: `\`${getLoopLabel(player?.loop)}\``, inline: true }
        );
        return embed;
    }

    if (current) {
        const uri = resolveTrackUri(current);
        const title = resolveTrackTitle(current);
        const author = resolveTrackAuthor(current);
        const thumb = resolveTrackThumbnail(current);
        const nowLine = uri ? `**[${title}](${uri})**\n*${author}*` : `**${title}**\n*${author}*`;
        embed.addFields({ name: `${EMOJI_NOWPLAYING} Now Playing`, value: nowLine, inline: false });
        if (thumb) embed.setThumbnail(thumb);
    }

    embed.addFields(
        { name: `${EMOJI_LOOP} Loop`, value: `\`${getLoopLabel(player?.loop)}\``, inline: true },
        { name: `${EMOJI_VOLUME} Volume`, value: `\`${player?.volume ?? 100}%\``, inline: true },
        { name: `${EMOJI_QUEUE} Total`, value: `\`${queueLen} tracks\``, inline: true }
    );

    if (queueLen > 0) {
        const upcoming = player.queue.slice(0, 15);
        const queueLines = upcoming.map((track, i) => {
            const n = i + 1;
            const num = n < 10 ? `0${n}` : String(n);
            return `\`${num}\` ${resolveTrackTitle(track)} — ${resolveTrackAuthor(track)}`;
        });
        const more = queueLen > 15 ? `\n*...and ${queueLen - 15} more tracks*` : "";
        embed.addFields({ name: "🔊 Up Next", value: queueLines.join("\n") + more, inline: false });
    } else {
        embed.addFields({ name: `${EMOJI_QUEUE} Up Next`, value: "*No tracks in queue*", inline: false });
    }
    embed.setFooter({ text: `Queue | ${queueLen} track${queueLen !== 1 ? "s" : ""} total` });
    return embed;
}

function buildPanelEmbed(player, options = {}, branding = {}) {
    const current = player?.current || player?.previous || null;
    const ended = Boolean(options.ended);
    const paused = Boolean(player?.paused);
    const playing = Boolean(player?.playing) && !ended;
    const music247Enabled = options.music247Enabled !== false;

    const statusText = ended ? "Ended" : paused ? "Paused" : playing ? "Playing" : "Idle";
    const color = ended ? 0xe74c3c : paused ? 0xf1c40f : playing ? 0x2ecc71 : 0x95a5a6;
    const titleText = ended ? "<:stop:1502743411113853018> Playback Ended" : current ? (paused ? "<:pause:1502724169505308812> Paused" : "<:music:1520293214001565746> Now Playing") : "<:music:1520293214001565746> Music Panel";

    const embed = new EmbedBuilder().setColor(color).setTitle(titleText);

    if (current) {
        const uri = resolveTrackUri(current);
        const trackTitle = resolveTrackTitle(current);
        const author = resolveTrackAuthor(current);
        const trackThumb = resolveTrackThumbnail(current);

        embed.setDescription(`**[${trackTitle}](${uri})**\n*${author}*`);
        embed.addFields(
            { name: `${EMOJI_STATUS} Status`, value: `\`${statusText}\``, inline: true },
            { name: `${EMOJI_VOLUME_UP} Volume`, value: `\`${player?.volume ?? 100}%\``, inline: true },
            { name: `${EMOJI_LOOP} Loop`, value: `\`${getLoopLabel(player?.loop)}\``, inline: true }
        );

        const req = resolveTrackRequester(current);
        embed.addFields(
            { name: `${EMOJI_247} 24/7`, value: music247Enabled ? "`On`" : "`Off`", inline: true },
            { name: `${EMOJI_QUEUE} Queue`, value: `\`${player?.queue?.size || 0} tracks\``, inline: true },
            { name: `${EMOJI_MEMBER} Requested`, value: req ? `\`${req.tag || req.username || "Unknown"}\`` : "\u200b", inline: true }
        );
        if (trackThumb) { try { new URL(trackThumb); embed.setThumbnail(trackThumb); } catch {} }
    } else {
        embed.setDescription("*No track playing. Use `/play` to start.*");
        embed.addFields(
            { name: `${EMOJI_247} 24/7`, value: music247Enabled ? "`On`" : "`Off`", inline: true },
            { name: `${EMOJI_QUEUE} Queue`, value: `\`${player?.queue?.size || 0} tracks\``, inline: true },
            { name: "🔊 Source", value: `\`${player?.volume ?? 100}%\``, inline: true }
        );
    }
    embed.setFooter({ text: ended ? "Use /play or ?play to start again" : "Use buttons below to control playback" });
    if (branding?.botAvatarUrl) embed.setAuthor({ name: branding.botName || "Music Panel", iconURL: branding.botAvatarUrl });
    return embed;
}
function clearFreeTierTimer(guildId) {
    const timer = freeTierTimers.get(guildId);
    if (timer) { clearTimeout(timer); freeTierTimers.delete(guildId); }
}
async function getTextChannel(client, channelId) {
    if (!client || !channelId) return null;
    return client.channels.fetch(channelId).catch(() => null);
}
async function endMusicSession(client, player, options = {}) {
    if (!client || !player) return null;
    const guildId = player.guildId;
    clearFreeTierTimer(guildId);

    const channelId = playerGet(guildId, "panelChannelId") || player.textChannel;
    const panelChannel = await getTextChannel(client, channelId);
    const panelMessageId = playerGet(guildId, "panelMessageId");
    const panelMessage = panelMessageId && panelChannel?.isTextBased() ? await panelChannel.messages.fetch(panelMessageId).catch(() => null) : null;

    const premiumConfig = options.branding ? null : await getPremiumConfig(guildId).catch(() => null);
    const branding = options.branding || { botAvatarUrl: premiumConfig?.botAvatarUrl || "" };
    const endedEmbed = buildPanelEmbed(player, { ended: true }, branding);

    if (panelMessage) await panelMessage.edit({ embeds: [endedEmbed], components: buildMusicButtons(player, true) }).catch(() => null);

    playerSet(guildId, "premiumEnding", true);
    player.destroy(); playerClear(guildId);

    if (options.noticeDescription && panelChannel?.isTextBased()) {
        const notice = new EmbedBuilder().setColor(options.noticeColor || 0xe67e22).setTitle(options.noticeTitle || "Premium required").setDescription(options.noticeDescription);
        await panelChannel.send({ embeds: [notice] }).catch(() => null);
    }
    return { panelChannel };
}

async function scheduleFreeTierLimit(client, player) {
    if (!client || !player) return null;
    const guildId = player.guildId;
    if (!guildId) return null;

    const premiumEnabled = await isPremiumEnabled(guildId).catch(() => false);
    if (premiumEnabled) { clearFreeTierTimer(guildId); return null; }
    if (freeTierTimers.has(guildId)) return null;

    const timer = setTimeout(async () => {
        freeTierTimers.delete(guildId);
        const activePlayer = getPlayer(client, guildId);
        if (!activePlayer) return;
        await endMusicSession(client, activePlayer, {
            noticeTitle: "Premium required",
            noticeDescription: "The free plan reached the 1-hour music limit. Upgrade to premium to remove this limit.",
            noticeColor: 0xe74c3c,
        });
    }, FREE_TIER_LIMIT_MS);
    timer.unref?.(); freeTierTimers.set(guildId, timer);
    return timer;
}

async function upsertMusicPanel(client, player, options = {}) {
    if (!client || !player) return null;
    const guildId = player.guildId;
    const previousLock = panelUpdateLocks.get(guildId) || Promise.resolve();
    let releaseLock;
    const nextLock = new Promise((resolve) => { releaseLock = resolve; });
    const chainedLock = previousLock.then(() => nextLock);
    panelUpdateLocks.set(guildId, chainedLock);
    await previousLock;

    try {
        const channelId = playerGet(guildId, "panelChannelId") || player.textChannel;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return null;

        const premiumConfig = await getPremiumConfig(guildId).catch(() => null);
        const embed = buildPanelEmbed(player, options, { botAvatarUrl: premiumConfig?.botAvatarUrl || "", music247Enabled: premiumConfig?.music247Enabled !== false });
        const payload = { embeds: [embed], components: buildMusicButtons(player, Boolean(options.ended)) };

        const messageId = playerGet(guildId, "panelMessageId");
        if (messageId && !options.forceSend) {
            const existing = await channel.messages.fetch(messageId).catch(() => null);
            if (existing) { await existing.edit(payload).catch(() => null); return existing; }
        }
        const sent = await channel.send(payload).catch(() => null);
        if (sent) { playerSet(guildId, "panelChannelId", channel.id); playerSet(guildId, "panelMessageId", sent.id); }
        return sent;
    } finally {
        releaseLock?.();
        if (panelUpdateLocks.get(guildId) === chainedLock) panelUpdateLocks.delete(guildId);
    }
}

async function editInteractionPanel(interaction, player, options = {}) {
    if (!interaction?.message || !player) return null;
    const premiumConfig = await getPremiumConfig(player.guildId).catch(() => null);
    const payload = {
        embeds: [buildPanelEmbed(player, options, { botAvatarUrl: premiumConfig?.botAvatarUrl || "", music247Enabled: premiumConfig?.music247Enabled !== false })],
        components: buildMusicButtons(player, Boolean(options.ended)),
    };
    return interaction.message.edit(payload).catch(() => null);
}

async function riffyAdvanceSkip(player, client) {
    await updateDatabaseStats(client, player.guildId).catch(() => null);
    if (player.current) playerSet(player.guildId, "prevTrack", player.current);
    player.stop();
    if (player.queue.length > 0) { await player.play().catch(() => null); return false; }
    clearFreeTierTimer(player.guildId);
    if (!playerGet(player.guildId, "premiumEnding")) await upsertMusicPanel(client, player, { ended: true }).catch(() => null);
    return true;
}

async function ensurePlayablePlayer(client, guild, member, channel) {
    const voiceChannelId = getVoiceChannelId(member);
    if (!voiceChannelId) return { error: "Join a voice channel first." };
    if (!hasConnectedNode(client)) {
        const ready = await waitForConnectedNode(client, 10000, 500);
        if (!ready) return { error: "Music node is not ready yet." };
    }
    const existing = getPlayer(client, guild.id);
    if (existing) {
        const sameVoiceError = assertSameVoiceChannel(existing, member);
        if (sameVoiceError) return { error: sameVoiceError };
        existing.setTextChannel(channel.id); return { player: existing };
    }
    const player = client.manager.createConnection({ guildId: guild.id, voiceChannel: voiceChannelId, textChannel: channel.id, deaf: true, mute: false });
    return { player };
}

async function playTracks(client, guild, member, channel, query) {
    const { player, error } = await ensurePlayablePlayer(client, guild, member, channel);
    if (error) return { error };

    const resolve = await loadTracks(client, query, member.user);
    const loadType = String(resolve?.loadType || "").toLowerCase();
    const tracks = Array.isArray(resolve?.tracks) ? resolve.tracks : [];
    if (!tracks.length || ["error", "empty", "no_matches", "load_failed"].includes(loadType)) return { error: "No tracks found." };

    const isPlaylist = loadType.includes("playlist");
    if (isPlaylist) { for (const t of tracks) player.queue.add(t); } else { player.queue.add(tracks[0]); }
    if (!player.playing && !player.paused) await player.play().catch(() => null);

    const embed = new EmbedBuilder().setColor(0xFEA166);
    if (isPlaylist) {
        embed.setTitle("<:queue:1502725083456868473> Playlist Added").setDescription(`Added **${resolve.playlistInfo?.name || "Playlist"}** (\`${tracks.length}\` tracks).`);
    } else {
        embed.setTitle("<:music:1520293214001565746> Track Added").setDescription(`**[${resolveTrackTitle(tracks[0])}](${resolveTrackUri(tracks[0]) || query})**\n*by ${resolveTrackAuthor(tracks[0])}*`);
        const thumb = resolveTrackThumbnail(tracks[0]); if (thumb) embed.setThumbnail(thumb);
    }
    return { player, embed };
}

async function pauseTrack(client, guild, member) {
    const player = getPlayer(client, guild.id); if (!player) return { error: "Nothing is playing." };
    if (assertSameVoiceChannel(player, member)) return { error: assertSameVoiceChannel(player, member) };
    if (!canControl(client, player, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền điều khiển Bot." };
    await player.pause(true).catch(() => null); await upsertMusicPanel(client, player); return { player, summary: "Playback paused." };
}
async function resumeTrack(client, guild, member) {
    const player = getPlayer(client, guild.id); if (!player) return { error: "Nothing is playing." };
    if (assertSameVoiceChannel(player, member)) return { error: assertSameVoiceChannel(player, member) };
    if (!canControl(client, player, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền điều khiển Bot." };
    await player.pause(false).catch(() => null); await upsertMusicPanel(client, player); return { player, summary: "Playback resumed." };
}
async function skipTrack(client, guild, member) {
    const player = getPlayer(client, guild.id); if (!player) return { error: "Nothing is playing." };
    if (assertSameVoiceChannel(player, member)) return { error: assertSameVoiceChannel(player, member) };
    if (!canControl(client, player, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền Skip." };
    const endedEarly = await riffyAdvanceSkip(player, client); if (!endedEarly) await upsertMusicPanel(client, player); return { player, summary: "Skipped track." };
}
async function stopTrack(client, guild, member) {
    const player = getPlayer(client, guild.id); if (!player) return { error: "Nothing is playing." };
    if (assertSameVoiceChannel(player, member)) return { error: assertSameVoiceChannel(player, member) };
    if (!canControl(client, player, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền Stop nhạc." };
    
    await updateDatabaseStats(client, guild.id).catch(() => null);
    player.queue.clear(); player.stop(); await upsertMusicPanel(client, player); return { player, summary: "Playback stopped." };
}
async function leaveVoice(client, guild, member) {
    const player = getPlayer(client, guild.id); if (!player) return { error: "Nothing is playing." };
    if (assertSameVoiceChannel(player, member)) return { error: assertSameVoiceChannel(player, member) };
    if (!canControl(client, player, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền Kick Bot." };
    
    await updateDatabaseStats(client, guild.id).catch(() => null);

    clearFreeTierTimer(guild.id);
    const pMsgId = playerGet(guild.id, "panelMessageId"), pChId = playerGet(guild.id, "panelChannelId");
    const pChan = pChId ? await client.channels.fetch(pChId).catch(() => null) : null;
    const pMsg = pMsgId && pChan?.isTextBased() ? await pChan.messages.fetch(pMsgId).catch(() => null) : null;
    
    if (player.voiceChannel) {
        await client.rest.delete(`/channels/${player.voiceChannel}/voice-status`).catch(() => null);
    }
    
    if (pMsg) await pMsg.edit({ embeds: [buildPanelEmbed(player, { ended: true })], components: buildMusicButtons(player, true) }).catch(() => null);
    playerSet(guild.id, "premiumEnding", true); player.destroy(); playerClear(guild.id); return { summary: "Left channel." };
}
async function showQueue(client, guild) { const p = getPlayer(client, guild.id); return p ? { player: p, embed: buildQueueEmbed(p) } : { error: "Nothing playing." }; }
async function showNowPlaying(client, guild, member) {
    const p = getPlayer(client, guild.id); if (!p) return { error: "Nothing playing." };
    if (assertSameVoiceChannel(p, member)) return { error: assertSameVoiceChannel(p, member) };
    await upsertMusicPanel(client, p, { forceSend: true }); return { player: p, summary: "Panel refreshed!" };
}
async function setVolume(client, guild, member, volume) {
    const p = getPlayer(client, guild.id); if (!p) return { error: "Nothing playing." };
    if (assertSameVoiceChannel(p, member)) return { error: assertSameVoiceChannel(p, member) };
    if (!canControl(client, p, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền chỉnh Volume." };
    if (!Number.isFinite(Number(volume)) || volume < 0 || volume > 1000) return { error: "Volume 0-1000." };
    p.setVolume(Math.floor(volume)); await upsertMusicPanel(client, p); return { player: p, summary: `Volume: ${volume}.` };
}
async function toggleLoop(client, guild, member, mode) {
    const p = getPlayer(client, guild.id); if (!p) return { error: "Nothing playing." };
    if (assertSameVoiceChannel(p, member)) return { error: assertSameVoiceChannel(p, member) };
    if (!canControl(client, p, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền chỉnh Loop." };
    let nMode = normalizeLoopMode(mode);
    if (!nMode) { const c = p.loop || "none"; nMode = c === "none" ? "track" : c === "track" ? "queue" : "none"; }
    p.setLoop(nMode); await upsertMusicPanel(client, p); return { player: p, summary: `Loop: ${getLoopLabel(nMode)}.` };
}
async function shuffleQueue(client, guild, member) {
    const p = getPlayer(client, guild.id); if (!p) return { error: "Nothing playing." };
    if (assertSameVoiceChannel(p, member)) return { error: assertSameVoiceChannel(p, member) };
    if (!canControl(client, p, member)) return { error: "Bạn không phải người vào phòng trước nên không có quyền Shuffle." };
    if (!p.queue.size) return { error: "Empty queue." };
    p.queue.shuffle(); await upsertMusicPanel(client, p); return { player: p, summary: "Shuffled." };
}
async function adjustVolumeBy(client, guild, member, delta) {
    const p = getPlayer(client, guild.id); if (!p) return { error: "Nothing playing." };
    if (assertSameVoiceChannel(p, member)) return { error: assertSameVoiceChannel(p, member) };
    if (!canControl(client, p, member)) return { error: "Quyền điều khiển bị từ chối." };
    const nVol = Math.max(0, Math.min(1000, (p.volume || 100) + delta)); p.setVolume(nVol); await upsertMusicPanel(client, p); return { player: p, summary: `Volume: ${nVol}.` };
}
async function setMusic247Mode(client, guild, member, modeValue) {
    if (!isGuildPremiumAdmin({ guild, member })) return { error: "Admin only." };
    if (!(await isPremiumEnabled(guild.id).catch(() => false))) return { error: "Premium inactive." };
    const next = parse247Mode(modeValue) === null ? !(await isPremiumMusic247Enabled(guild.id).catch(() => true)) : parse247Mode(modeValue);
    await setPremiumMusic247Enabled(guild.id, next).catch(() => null);
    const p = getPlayer(client, guild.id); if (p) await upsertMusicPanel(client, p).catch(() => null);
    return { summary: `24/7: ${next ? "Enabled" : "Disabled"}.` };
}
function commandSpecMap() {
    return {
        play: {
            prefixUsage: "<url|query>", description: "Play music", prefixAliases: ["p"],
            slashOptions: (b) => b.addStringOption((o) => o.setName("url").setDescription("URL").setRequired(false)).addStringOption((o) => o.setName("query").setDescription("Text").setRequired(false)),
            runPrefix: async (c, m, a) => a.join(" ").trim() ? playTracks(c, m.guild, m.member, m.channel, a.join(" ").trim()) : { error: "Usage: ?play <query>" },
            runSlash: async (c, i) => playTracks(c, i.guild, i.member, i.channel, i.options.getString("url")?.trim() || i.options.getString("query")?.trim() || ""),
        },
        pause: { description: "Pause", runPrefix: async (c, m) => pauseTrack(c, m.guild, m.member), runSlash: async (c, i) => pauseTrack(c, i.guild, i.member) },
        resume: { description: "Resume", runPrefix: async (c, m) => resumeTrack(c, m.guild, m.member), runSlash: async (c, i) => resumeTrack(c, i.guild, i.member) },
        skip: { description: "Skip", prefixAliases: ["next"], runPrefix: async (c, m) => skipTrack(c, m.guild, m.member), runSlash: async (c, i) => skipTrack(c, i.guild, i.member) },
        stop: { description: "Stop", runPrefix: async (c, m) => stopTrack(c, m.guild, m.member), runSlash: async (c, i) => stopTrack(c, i.guild, i.member) },
        queue: { description: "Queue", prefixAliases: ["q"], runPrefix: async (c, m) => showQueue(c, m.guild), runSlash: async (c, i) => showQueue(c, i.guild) },
        nowplaying: { description: "Panel", prefixAliases: ["np"], runPrefix: async (c, m) => showNowPlaying(c, m.guild, m.member), runSlash: async (c, i) => showNowPlaying(c, i.guild, i.member) },
        shuffle: { description: "Shuffle", runPrefix: async (c, m) => shuffleQueue(c, m.guild, m.member), runSlash: async (c, i) => shuffleQueue(c, i.guild, i.member) },
        leave: { description: "Leave", runPrefix: async (c, m) => leaveVoice(c, m.guild, m.member), runSlash: async (c, i) => leaveVoice(c, i.guild, i.member) },
        247: {
            description: "Toggle 24/7", prefixUsage: "[on|off]", prefixAliases: ["music247"],
            slashOptions: (b) => b.addStringOption((o) => o.setName("mode").setDescription("Mode").addChoices({ name: "Toggle", value: "toggle" }, { name: "On", value: "on" }, { name: "Off", value: "off" })),
            runPrefix: async (c, m, a) => setMusic247Mode(c, m.guild, m.member, a[0]), runSlash: async (c, i) => setMusic247Mode(c, i.guild, i.member, i.options.getString("mode")),
        },
        volume: {
            prefixUsage: "<0-1000>", description: "Volume",
            slashOptions: (b) => b.addIntegerOption((o) => o.setName("value").setDescription("0-1000").setMinValue(0).setMaxValue(1000).setRequired(true)),
            runPrefix: async (c, m, a) => a[0] ? setVolume(c, m.guild, m.member, Number(a[0])) : { error: "Usage: ?volume <0-1000>" },
            runSlash: async (c, i) => setVolume(c, i.guild, i.member, i.options.getInteger("value", true)),
        },
        loop: {
            prefixUsage: "[mode]", description: "Loop",
            slashOptions: (b) => b.addStringOption((o) => o.setName("mode").setDescription("Mode").addChoices({ name: "Toggle", value: "toggle" }, { name: "Off", value: "none" }, { name: "Track", value: "track" }, { name: "Queue", value: "queue" })),
            runPrefix: async (c, m, a) => toggleLoop(c, m.guild, m.member, String(a[0] || "").trim()),
            runSlash: async (c, i) => toggleLoop(c, i.guild, i.member, i.options.getString("mode") === "toggle" ? "" : i.options.getString("mode") || ""),
        },
    };
}

function createPrefixMusicCommand(name) {
    const spec = commandSpecMap()[name]; if (!spec) return null;
    return {
        name, aliases: spec.prefixAliases || [], description: spec.description, usage: spec.prefixUsage ? `${name} ${spec.prefixUsage}`.trim() : name, category: "music",
        execute: async (message, args) => { const r = await spec.runPrefix(message.client, message, args); await deliverPrefixResult(message, r); return r; },
    };
}
function createSlashMusicCommand(name) {
    const { SlashCommandBuilder } = require("discord.js");
    const spec = commandSpecMap()[name]; if (!spec) return null;
    const builder = new SlashCommandBuilder().setName(name).setDescription(spec.description);
    if (typeof spec.slashOptions === "function") spec.slashOptions(builder);
    return { data: builder, execute: async (i) => { await i.deferReply({ ephemeral: true }).catch(() => null); const r = await spec.runSlash(i.client, i); await deliverSlashResult(i, r); return r; } };
}

async function deliverPrefixResult(message, result) {
    if (!result) return null;
    if (result.error) return message.reply({ embeds: [new EmbedBuilder().setColor("#FF4A4A").setDescription(`<:x_:1520795540152127689> **${result.error}**`)] }).catch(() => null);
    if (result.embed) return message.reply({ embeds: [result.embed] }).catch(() => null);
    if (result.summary) return message.reply({ embeds: [new EmbedBuilder().setColor("#FEA166").setDescription(`<:check:1503444330411589652> **${result.summary}**`)] }).catch(() => null);
}
async function deliverSlashResult(interaction, result) {
    if (!result) return interaction.editReply({ content: "Done." }).catch(() => null);
    if (result.error) return interaction.editReply({ embeds: [new EmbedBuilder().setColor("#FF4A4A").setDescription(`<:x_:1520795540152127689> **${result.error}**`)], content: "" }).catch(() => null);
    if (result.embed) return interaction.editReply({ embeds: [result.embed], content: "" }).catch(() => null);
    if (result.summary) return interaction.editReply({ embeds: [new EmbedBuilder().setColor("#FEA166").setDescription(`<:check:1503444330411589652> **${result.summary}**`)], content: "" }).catch(() => null);
}

function setupMusic(client) {
    if (!client || client.manager) return client?.manager || null;
    const riffy = new Riffy(client, LAVALINK_NODES.map((n) => ({ name: n.name, host: n.host, port: Number(n.port), password: n.password, secure: Boolean(n.secure) })), {
        send: (p) => { const g = client.guilds.cache.get(p?.d?.guild_id); if (g) g.shard.send(p); }, defaultSearchPlatform: "ytmsearch", restVersion: "v4", bypassChecks: { nodeFetchInfo: true },
    });
    client.manager = riffy; client.riffy = riffy;
    client.on("raw", (packet) => riffy.updateVoiceState(packet));
    riffy.on("nodeConnect", (n) => console.log(`[MUSIC] Connected: ${n.name}`));
    
    riffy.on("trackStart", async (p) => { 
        await scheduleFreeTierLimit(client, p).catch(() => null); 
        await upsertMusicPanel(client, p).catch(() => null); 
        
        trackStartTimes.set(p.guildId, {
            startTime: Date.now(),
            trackTitle: resolveTrackTitle(p.current),
            trackUri: resolveTrackUri(p.current), 
            voiceChannelId: p.voiceChannel
        });

        if (p?.current && p.voiceChannel) {
            const isVoiceStatusOn = global.musicStatusConfig?.[p.guildId] !== false;
            if (isVoiceStatusOn) {
                const songTitle = resolveTrackTitle(p.current);
                const songArtist = resolveTrackAuthor(p.current);
                
                await client.rest.put(`/channels/${p.voiceChannel}/voice-status`, {
                    body: { status: `🎶 ${songTitle} - ${songArtist}` }
                }).catch(() => null);
            }
        }
    });

    riffy.on("trackEnd", async (p) => {
        await updateDatabaseStats(client, p.guildId).catch(() => null);
    });
    
    riffy.on("queueEnd", async (p) => { 
        await updateDatabaseStats(client, p.guildId).catch(() => null);

        if (p.current) playerSet(p.guildId, "prevTrack", p.current); 
        clearFreeTierTimer(p.guildId); 
        
        if (p.voiceChannel) {
            await client.rest.delete(`/channels/${p.voiceChannel}/voice-status`).catch(() => null);
        }
        
        if (!playerGet(p.guildId, "premiumEnding")) await upsertMusicPanel(client, p, { ended: true }).catch(() => null); 
    });
    return riffy;
}

async function handleMusicButtonInteraction(interaction, client) {
    if (!interaction?.guildId || !interaction.customId?.startsWith("music:")) return false;
    const action = interaction.customId.slice("music:".length), p = getPlayer(client, interaction.guildId);
    if (!p) { await interaction.reply({ content: "Nothing playing.", ephemeral: true }).catch(() => null); return true; }
    if (action !== "queue" && assertSameVoiceChannel(p, interaction.member)) { await interaction.reply({ content: assertSameVoiceChannel(p, interaction.member), ephemeral: true }).catch(() => null); return true; }
    if (action === "queue") { await interaction.reply({ embeds: [buildQueueEmbed(p)], ephemeral: true }).catch(() => null); return true; }
    
    if (!canControl(client, p, interaction.member)) {
        await interaction.reply({ content: "❌ Bạn phải là người tham gia phòng trước nhất mới được quyền sử dụng Panel điều khiển này.", ephemeral: true }).catch(() => null);
        return true;
    }

    await interaction.deferUpdate().catch(() => null);
    if (action === "pause") { await p.pause(!p.paused); await editInteractionPanel(interaction, p); }
    if (action === "skip") { 
        await updateDatabaseStats(client, interaction.guildId).catch(() => null);
        await riffyAdvanceSkip(p, client); 
        await editInteractionPanel(interaction, p); 
    }
    if (action === "replay" && p.current) { p.queue.add(p.current); p.stop(); }
    if (action === "stop") { 
        await updateDatabaseStats(client, interaction.guildId).catch(() => null);
        p.queue.clear(); p.stop(); await editInteractionPanel(interaction, p); 
    }
    if (action === "loop") { const next = p.loop === "none" ? "track" : p.loop === "track" ? "queue" : "none"; p.setLoop(next); await editInteractionPanel(interaction, p); }
    if (action === "shuffle") { p.queue.shuffle(); await editInteractionPanel(interaction, p); }
    if (action === "volume_down") { p.setVolume(Math.max(0, (p.volume || 100) - 10)); await editInteractionPanel(interaction, p); }
    if (action === "volume_up") { p.setVolume(Math.min(1000, (p.volume || 100) + 10)); await editInteractionPanel(interaction, p); }
    if (action === "nowplaying") await upsertMusicPanel(client, p, { forceSend: true });
    if (action === "leave") { 
        await updateDatabaseStats(client, interaction.guildId).catch(() => null);
        clearFreeTierTimer(p.guildId); 
        if (p.voiceChannel) {
            await client.rest.delete(`/channels/${p.voiceChannel}/voice-status`).catch(() => null);
        }
        playerSet(p.guildId, "premiumEnding", true); p.destroy(); playerClear(p.guildId); 
        await interaction.message.edit({ embeds: [buildPanelEmbed(p, { ended: true })], components: buildMusicButtons(p, true) }).catch(() => null); 
    }
    return true;
}

module.exports = {
    LAVALINK_NODES, setupMusic, getPlayer, formatDuration, buildQueueEmbed, buildPanelEmbed,
    upsertMusicPanel, editInteractionPanel, createPrefixMusicCommand, createSlashMusicCommand,
    handleMusicButtonInteraction, endMusicSession, scheduleFreeTierLimit, clearFreeTierTimer,
    playTracks, pauseTrack, resumeTrack, skipTrack, stopTrack, leaveVoice, showQueue,
    showNowPlaying, setVolume, toggleLoop, shuffleQueue, adjustVolumeBy,
    drawCircularPlatformIcon 
};
                                       