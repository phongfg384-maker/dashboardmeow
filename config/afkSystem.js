const fs = require("fs");
const path = require("path");

// Sửa lại đường dẫn cho đúng vị trí file afk-config.json từ file này
const afkPath = path.join(__dirname, "../afk-config.json");

module.exports = {
    async handleAFK(message) {
        // Bỏ qua tin nhắn từ Bot hoặc ngoài Server
        if (message.author.bot || !message.guild) return;

        // Đọc dữ liệu AFK hiện tại
        let afkData = {};
        if (fs.existsSync(afkPath)) {
            try { 
                afkData = JSON.parse(fs.readFileSync(afkPath, "utf8")); 
            } catch (_) {}
        }

        const guildId = message.guild.id;
        const currentAfkList = afkData[guildId] || {};

        // ────────────────────────────────────────────────────────
        // LOGIC 1: Người đang AFK nhắn tin -> TỰ ĐỘNG TẮT AFK
        // ────────────────────────────────────────────────────────
        if (currentAfkList[message.author.id]) {
            const userAfkInfo = currentAfkList[message.author.id];
            
            // Khôi phục lại biệt danh cũ trước khi AFK
            try {
                await message.member.setNickname(userAfkInfo.oldNickname);
            } catch (_) {}

            // Xóa ID user này khỏi danh sách AFK
            delete afkData[guildId][message.author.id];
            fs.writeFileSync(afkPath, JSON.stringify(afkData, null, 4));

            await message.reply(`👋 Welcome back, the bot has disabled your AFK status.`);
        }

        // ────────────────────────────────────────────────────────
        // LOGIC 2: Ai đó tag trúng người đang AFK -> BOT PHẢN HỒI LÝ DO
        // ────────────────────────────────────────────────────────
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (user) => {
                if (currentAfkList[user.id]) {
                    const info = currentAfkList[user.id];
                    
                    // Trả lời kèm thời gian dạng relative (<t:timestamp:R> tự sinh "X phút trước")
                    await message.reply({
                        content: `⚠️ Member: **${user.username}** currently AFK!\n• **Reason:** ${info.reason}\n• **AFK at:** <t:${info.timestamp}:R>`,
                        allowedMentions: { repliedUser: false } // Tắt thông báo tag ngược lại người chat
                    });
                }
            });
        }
    }
};
