const GuildConfig = require("../models/GuildConfig"); // Sửa đường dẫn nếu cần

/**
 * Hàm kiểm tra và xử lý ảnh Scam Crypto
 * @returns {Promise<boolean>} Trả về true nếu phát hiện scam và đã xử lý
 */
async function checkAntiScamImage(message) {
    // 1. Bỏ qua tin nhắn của bot hoặc trong DM riêng
    if (message.author.bot || !message.guild) return false;

    // 2. Bỏ qua Quản trị viên
    if (message.member && message.member.permissions.has("Administrator")) return false;

    // 3. Kiểm tra xem tin nhắn có chứa file đính kèm (Ảnh/Video) không
    if (message.attachments.size > 0) {
        
        // Danh sách tên các file ảnh Scam thường gặp (chuyển về chữ thường để so sánh)
        const scamSignatures = ["1.jpg", "2.jpg", "3.jpg", "4.jpg"];
        let isScam = false;

        // Quét từng file đính kèm trong tin nhắn
        message.attachments.forEach(attachment => {
            if (scamSignatures.includes(attachment.name.toLowerCase())) {
                isScam = true;
            }
        });

        // 4. Nếu phát hiện trùng khớp tên file Scam
        if (isScam) {
            // Kiểm tra xem Server có bật tính năng này không
            const config = await GuildConfig.findOne({ guildId: message.guild.id }).select("antiScamImage").lean();
            
            if (config && config.antiScamImage) {
                try {
                    // Xóa tin nhắn chứa ảnh lừa đảo
                    await message.delete().catch(() => null);

                    // THỰC THI SOFTBAN (Ban để xóa tin nhắn diện rộng, sau đó Unban lập tức)
                    await message.guild.members.ban(message.author.id, { 
                        reason: "[Auto-Mod] Gửi ảnh lừa đảo Crypto (Scam Image)", 
                        deleteMessageSeconds: 86400 // Xóa sạch tin nhắn của người này trong 24h qua
                    });
                    await message.guild.members.unban(message.author.id, "Hoàn tất Softban (Chỉ xóa tin nhắn)");

                    // Gửi thông báo
                    message.channel.send(`<:check:1503444330411589652> Hệ thống đã tự động **Softban** \`${message.author.username}\` vì gửi ảnh lừa đảo tiền điện tử!`)
                        .then(msg => setTimeout(() => msg.delete().catch(() => null), 8000));

                    return true; // Báo hiệu đã xử lý xong
                } catch (err) {
                    console.error("[ANTI-SCAM ERROR]: Không thể softban người dùng.", err);
                }
            }
        }
    }
    
    return false; // An toàn, không có ảnh lừa đảo
}

module.exports = { checkAntiScamImage };
