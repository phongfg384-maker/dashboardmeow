const { AuditLogEvent, Events } = require("discord.js");
const { getAuditExecutor, handleSuspiciousAction } = require("./antiNukeEngine");

/**
 * Gọi hàm này MỘT LẦN duy nhất sau khi client sẵn sàng, ví dụ trong file chính:
 *
 *   const registerAntiNuke = require("./events/antiNukeEvents");
 *   registerAntiNuke(client);
 */
module.exports = function registerAntiNuke(client) {

    // ── XOÁ KÊNH ─────────────────────────────────────────
    client.on(Events.ChannelDelete, async channel => {
        if (!channel.guild) return;
        const entry = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete);
        if (!entry?.executor) return;

        await handleSuspiciousAction(channel.guild, entry.executor.id, "CHANNEL_DELETE", `#${channel.name}`);
    });

    // ── XOÁ ROLE ─────────────────────────────────────────
    client.on(Events.GuildRoleDelete, async role => {
        const entry = await getAuditExecutor(role.guild, AuditLogEvent.RoleDelete);
        if (!entry?.executor) return;

        await handleSuspiciousAction(role.guild, entry.executor.id, "ROLE_DELETE", role.name);
    });

    // ── MASS BAN ─────────────────────────────────────────
    client.on(Events.GuildBanAdd, async ban => {
        const entry = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        if (!entry?.executor) return;

        await handleSuspiciousAction(ban.guild, entry.executor.id, "MASS_BAN", `Banned ${ban.user.tag}`);
    });

    // ── MASS KICK ────────────────────────────────────────
    // guildMemberRemove fires cho cả rời server tự nguyện lẫn bị kick, nên phải đối chiếu audit log
    client.on(Events.GuildMemberRemove, async member => {
        const entry = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
        if (!entry?.executor) return; // không có entry nghĩa là tự rời, bỏ qua

        await handleSuspiciousAction(member.guild, entry.executor.id, "MASS_KICK", `Kicked ${member.user.tag}`);
    });

    // ── TẠO WEBHOOK ──────────────────────────────────────
    client.on(Events.WebhooksUpdate, async channel => {
        const entry = await getAuditExecutor(channel.guild, AuditLogEvent.WebhookCreate);
        if (!entry?.executor) return;

        await handleSuspiciousAction(channel.guild, entry.executor.id, "WEBHOOK_CREATE", `in #${channel.name}`);
    });

    // ── SERVER UPDATE BẤT THƯỜNG (đổi tên, đổi icon, đổi vanity...) ──
    client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
        const entry = await getAuditExecutor(newGuild, AuditLogEvent.GuildUpdate);
        if (!entry?.executor) return;

        await handleSuspiciousAction(newGuild, entry.executor.id, "SERVER_UPDATE", "Guild settings changed");
    });

    // ── THÊM BOT VÀO SERVER ──────────────────────────────
    // Đây là 2 việc riêng: (1) tự kick con bot lạ NGAY, (2) phạt người đã add nó
    client.on(Events.GuildMemberAdd, async member => {
        if (!member.user.bot) return;

        const entry = await getAuditExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
        const executorId = entry?.executor?.id;

        // Không xác định được ai add -> vẫn nên kick bot lạ nếu anti-nuke đang bật, nhưng an toàn thì bỏ qua ở đây
        if (!executorId) return;

        // 1. Kick ngay con bot vừa được thêm (không cần đợi threshold, vì "1 con bot lạ" là đủ nguy hiểm)
        //    handleSuspiciousAction đã tự check config.antiNuke + whitelist + threshold cho NGƯỜI add,
        //    còn việc kick bot xử lý riêng bên dưới để đảm bảo luôn kick bất kể threshold.
        const GuildConfig = require("./GuildConfig");
        const config = await GuildConfig.findOne({ guildId: member.guild.id });

        if (config?.antiNuke && !config.antiNukeWhitelist?.includes(executorId) && executorId !== member.guild.ownerId) {
            if (member.kickable) {
                await member.kick("[ANTI-NUKE] Unauthorized bot addition").catch(() => null);
            }

            // 2. Phạt người đã thêm bot (theo đúng punishment đã cấu hình, và có ghi log DB)
            await handleSuspiciousAction(member.guild, executorId, "BOT_ADD", `Added bot ${member.user.tag}`);
        }
    });
};
