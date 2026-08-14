const GuildConfig = require("../models/GuildConfig"); // Sửa lại đường dẫn model cho đúng với thư mục của bạn

/**
 * Hàm kiểm tra và xóa link mời Discord
 * @returns {Promise<boolean>} Trả về true nếu tin nhắn vi phạm và bị xóa, ngược lại là false
 */
async function checkAntiLink(message) {
    // 1. Bỏ qua tin nhắn của bot hoặc tin nhắn gửi trong DM
    if (message.author.bot || !message.guild) return false;

    // 2. Bỏ qua nếu người gửi có quyền Administrator
    if (message.member && message.member.permissions.has("Administrator")) return false;

    // 3. Bộ lọc bắt link mời Discord
    const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;

    if (inviteRegex.test(message.content)) {
        // 4. Kiểm tra trạng thái Anti-link của server trong Database
        const config = await GuildConfig.findOne({ guildId: message.guild.id }).lean();
        
        if (config && config.antiLink) {
            // Xóa tin nhắn vi phạm
            await message.delete().catch(() => null);
            
            // Gửi cảnh báo và tự động xóa sau 5 giây
            message.channel.send(`<:x_:1520795540152127689> ${message.author}, bạn không được phép gửi liên kết mời Discord tại máy chủ này!`)
                .then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
            
            // Báo hiệu tin nhắn đã bị hủy diệt
            return true; 
        }
    }
    
    // Báo hiệu tin nhắn an toàn
    return false; 
}

module.exports = { checkAntiLink };
