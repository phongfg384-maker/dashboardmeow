const GuildConfig = require("./GuildConfig");
const AntiNukeLog = require("./AntiNukeLog");
const AntiNukeQuarantine = require("./AntiNukeQuarantine");

// ── NGƯỠNG KÍCH HOẠT THEO MODE ──────────────────────────
// { số lần hành động cho phép , trong bao nhiêu mili-giây }
const THRESHOLDS = {
    normal:   { count: 3, windowMs: 10_000 },
    strict:   { count: 2, windowMs: 10_000 },
    lockdown: { count: 1, windowMs: 10_000 }, // gần như bắt ngay lần đầu
};

// Bộ nhớ tạm theo dõi hành động gần đây: key = "guildId:userId:actionType" -> [timestamps]
const actionTracker = new Map();

function recordAction(guildId, userId, actionType, mode) {
    const threshold = THRESHOLDS[mode] || THRESHOLDS.normal;
    const key = `${guildId}:${userId}:${actionType}`;
    const now = Date.now();

    const timestamps = (actionTracker.get(key) || []).filter(t => now - t < threshold.windowMs);
    timestamps.push(now);
    actionTracker.set(key, timestamps);

    return timestamps.length >= threshold.count;
}

function clearTracker(guildId, userId, actionType) {
    actionTracker.delete(`${guildId}:${userId}:${actionType}`);
}

// ── LẤY EXECUTOR TỪ AUDIT LOG ───────────────────────────
// Tìm ai vừa thực hiện hành động (xoá kênh, xoá role, ban, add bot...) qua audit log
async function getAuditExecutor(guild, auditLogType, targetId = null, withinMs = 5000) {
    try {
        const audit = await guild.fetchAuditLogs({ type: auditLogType, limit: 5 });
        const entry = audit.entries.find(e => {
            const recent = Date.now() - e.createdTimestamp < withinMs;
            const matchesTarget = targetId ? e.target?.id === targetId : true;
            return recent && matchesTarget;
        });
        return entry || null;
    } catch (err) {
        console.error("[ANTI-NUKE] Failed to fetch audit log:", err);
        return null;
    }
}

// ── KIỂM TRA MIỄN TRỪ (whitelist / chủ server / chính bot) ──
function isExempt(guild, config, userId) {
    if (userId === guild.ownerId) return true;
    if (userId === guild.client.user.id) return true;
    if (config.antiNukeWhitelist?.includes(userId)) return true;
    return false;
}

// ── ÁP DỤNG HÌNH PHẠT ────────────────────────────────────
// executorMember: GuildMember của người vi phạm (phải fetch trước khi gọi)
async function applyPunishment(guild, executorMember, config, actionType, detail = "") {
    const punishment = config.antiNukePunishment || "quarantine";

    try {
        switch (punishment) {
            case "quarantine": {
                // Gỡ toàn bộ role (trừ @everyone) và lưu lại để khôi phục sau
                const roleIds = executorMember.roles.cache
                    .filter(r => r.id !== guild.id)
                    .map(r => r.id);

                if (roleIds.length > 0) {
                    await executorMember.roles.set([], "[ANTI-NUKE] Quarantined - suspicious activity detected");

                    await AntiNukeQuarantine.findOneAndUpdate(
                        { guildId: guild.id, userId: executorMember.id },
                        { guildId: guild.id, userId: executorMember.id, removedRoleIds: roleIds, createdAt: new Date() },
                        { upsert: true }
                    );
                }
                break;
            }

            case "timeout": {
                // Timeout tối đa 28 ngày (giới hạn Discord)
                await executorMember.timeout(28 * 24 * 60 * 60 * 1000, "[ANTI-NUKE] Suspicious activity detected");
                break;
            }

            case "kick": {
                await executorMember.kick("[ANTI-NUKE] Suspicious activity detected");
                break;
            }

            case "ban": {
                await executorMember.ban({ reason: "[ANTI-NUKE] Suspicious activity detected", deleteMessageSeconds: 24 * 60 * 60 });
                break;
            }
        }
    } catch (err) {
        console.error(`[ANTI-NUKE] Failed to apply punishment (${punishment}) on ${executorMember.id}:`, err);
    }

    // Lưu log vào database bất kể áp dụng punishment có thành công hay không (để biết bot ĐÃ cố xử lý)
    await AntiNukeLog.create({
        guildId: guild.id,
        userId: executorMember.id,
        actionType,
        detail,
        punishment,
    }).catch(err => console.error("[ANTI-NUKE] Failed to write log:", err));
}

// ── HÀM CHÍNH: gọi từ mỗi event handler ─────────────────
// Trả về true nếu đã trigger + đã phạt, false nếu chưa tới ngưỡng hoặc được miễn trừ
async function handleSuspiciousAction(guild, executorId, actionType, detail = "") {
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config || !config.antiNuke) return false;
    if (isExempt(guild, config, executorId)) return false;

    const triggered = recordAction(guild.id, executorId, actionType, config.antiNukeMode);
    if (!triggered) return false;

    const executorMember = await guild.members.fetch(executorId).catch(() => null);
    if (!executorMember) return false;
    if (!executorMember.manageable) return false; // role bot thấp hơn không xử lý được, tránh crash

    clearTracker(guild.id, executorId, actionType);
    await applyPunishment(guild, executorMember, config, actionType, detail);
    return true;
}

module.exports = {
    THRESHOLDS,
    getAuditExecutor,
    isExempt,
    applyPunishment,
    handleSuspiciousAction,
};
