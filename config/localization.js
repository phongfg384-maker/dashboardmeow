module.exports = {
    vi: {
        // Lệnh đổi ngôn ngữ chính (Admin)
        lang_success: "🇻🇳 **Ngôn ngữ hệ thống của Bot đã được chuyển sang TIẾNG VIỆT thành công!**",
        
        // Hệ thống Câu cá (Fishing)
        fish_success: "🎣 {user} vừa câu được một con: {emoji} **{name}**!",
        fish_banggia: "🏪 **BẢNG GIÁ THU MUA THỦY SẢN:**\n> Cá Hề (`clownfish`): 50 xu\n> Mực Ống (`squid`): 120 xu\n> Cá Ngừ (`tuna`): 300 xu\n> Cá Voi Xanh (`whale`): 1,500 xu",
        
        // Hệ thống Đào mỏ (Mining)
        mine_started: "🤖 **KÍCH HOẠT AUTO MINING THÀNH CÔNG!**\nSử dụng thành công `1x Chip Auto Mining`. Máy đào bắt đầu vận hành liên tục trong **1 giờ**.",
        mine_ended: "⚠️ {user} | **Hết thời gian 1 giờ Auto Mining!** Năng lượng từ chip đã cạn kiệt, máy đào tự động tắt.",
        mine_success: "🤖 **[AUTO]** {user} vừa cuốc trúng một khoáng sản: {rare}{emoji} **{name}**!",
        mine_rare: "🚨 **CỰC KỲ QUÝ HIẾM!** ",
        
        // Hệ thống Admin toggle auto
        toggle_auto_on: "⚙️ **Hệ thống Admin:** Đã **ẨN** thông báo tin nhắn spam từ hệ thống auto farm `{type}` toàn server.",
        toggle_auto_off: "⚙️ **Hệ thống Admin:** Đã **HIỆN** lại thông báo tin nhắn từ hệ thống auto farm `{type}` toàn server.",

        // Lỗi chung (Errors)
        no_permission: "❌ Bạn không có quyền quản lý server (`ManageGuild`) để sử dụng lệnh này!",
        invalid_syntax: "❌ Sai cú pháp lệnh! Vui lòng kiểm tra lại hướng dẫn.",
        system_busy: "❌ Hệ thống đang bận hoặc gặp lỗi, vui lòng thử lại sau!"
    },
    en: {
        // Language Command (Admin)
        lang_success: "🇺🇸 **System language of the Bot has been successfully switched to ENGLISH!**",
        
        // Fishing System
        fish_success: "🎣 {user} just caught a: {emoji} **{name}**!",
        fish_banggia: "🏪 **FISH MARKET PRICE BOARD:**\n> Clownfish (`clownfish`): 50 coins\n> Squid (`squid`): 120 coins\n> Tuna (`tuna`): 300 coins\n> Blue Whale (`whale`): 1,500 coins",
        
        // Mining System
        mine_started: "🤖 **AUTO MINING ACTIVATED SUCCESSFULLY!**\nSuccessfully used `1x Auto Mining Chip`. The mining machine starts operating continuously for **1 hour**.",
        mine_ended: "⚠️ {user} | **1-hour Auto Mining has expired!** The chip ran out of power, the machine turned off automatically.",
        mine_success: "🤖 **[AUTO]** {user} just mined an ore: {rare}{emoji} **{name}**!",
        mine_rare: "🚨 **EXTREMELY RARE!** ",
        
        // Admin toggle auto system
        toggle_auto_on: "⚙️ **Admin System:** Successfully **HIDDEN** spam messages from `{type}` auto farm server-wide.",
        toggle_auto_off: "⚙️ **Admin System:** Successfully **SHOWN** messages from `{type}` auto farm server-wide.",

        // Common Errors
        no_permission: "❌ You do not have `ManageGuild` permission to use this command!",
        invalid_syntax: "❌ Invalid syntax! Please check the command usage guide again.",
        system_busy: "❌ The system is busy or encountered an error, please try again later!"
    }
};
