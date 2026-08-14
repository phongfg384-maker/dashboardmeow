const UserCoin = require("../models/ncoinSchema");

// =========================
// PROFILE
// =========================
async function getProfile(userId) {
    let profile = await UserCoin.findOne({ userId });

    if (!profile) {
        profile = await UserCoin.create({
            userId
        });
    }
    return profile;
}

// =========================
// WALLET
// =========================
// 🛠️ SỬA TẠI ĐÂY: Hàm tự động nhận diện nếu người dùng truyền nhầm guildId vào trước
async function getBalance(guildId, userId) {
    // Nếu chỉ truyền 1 tham số, thì tham số đầu tiên chính là userId
    let finalUserId = guildId; 
    
    // Nếu truyền cả 2 tham số (guildId và userId), thì lấy tham số thứ hai làm userId
    if (userId) {
        finalUserId = userId;
    }

    const profile = await getProfile(finalUserId);
    return profile.coins;
}

async function addCoins(userId, amount) {
    if (amount <= 0)
        return getBalance(userId);

    const profile = await UserCoin.findOneAndUpdate(
        { userId },
        { $inc: { coins: amount } },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
    return profile.coins;
}

async function removeCoins(userId, amount) {
    const profile = await getProfile(userId);

    if (amount <= 0)
        return profile.coins;

    const remove = Math.min(amount, profile.coins);

    const updated = await UserCoin.findOneAndUpdate(
        { userId },
        { $inc: { coins: -remove } },
        { new: true }
    );
    return updated.coins;
}

// =========================
// COMPATIBILITY
// (để game cũ vẫn chạy ngon lành)
// =========================
// 🛠️ SỬA TẠI ĐÂY: Sắp xếp lại tham số để bóc tách đúng userId ra xử lý
async function updateBalance(guildId, userId, amount) {
    let finalUserId = userId;
    let finalAmount = amount;

    // Trường hợp đảo tham số: updateBalance(userId, amount) khi không có guildId
    if (typeof userId === 'number' || typeof userId === 'undefined') {
        finalUserId = guildId;
        finalAmount = userId;
    }

    if (finalAmount >= 0)
        return addCoins(finalUserId, finalAmount);

    return removeCoins(finalUserId, Math.abs(finalAmount));
}

// =========================
// DAILY
// =========================
async function setDaily(userId, timestamp = Date.now()) {
    return UserCoin.findOneAndUpdate(
        { userId },
        { $set: { lastDaily: timestamp } },
        { new: true, upsert: true }
    );
}

// =========================
// WEEKLY
// =========================
async function setWeekly(userId, timestamp = Date.now()) {
    return UserCoin.findOneAndUpdate(
        { userId },
        { $set: { lastWeekly: timestamp } },
        { new: true, upsert: true }
    );
}

// =========================
// BANK
// =========================
async function getBank(userId) {
    const profile = await getProfile(userId);
    return profile.bank;
}

async function deposit(userId, amount) {
    const profile = await getProfile(userId);

    if (amount <= 0)
        return false;

    if (profile.coins < amount)
        return false;

    await UserCoin.findOneAndUpdate(
        { userId },
        { $inc: { coins: -amount, bank: amount } }
    );
    return true;
}

async function withdraw(userId, amount) {
    const profile = await getProfile(userId);

    if (amount <= 0)
        return false;

    if (profile.bank < amount)
        return false;

    await UserCoin.findOneAndUpdate(
        { userId },
        { $inc: { coins: amount, bank: -amount } }
    );
    return true;
}

// =========================
// EXPORT
// =========================
module.exports = {
    getProfile,
    getBalance,
    addCoins,
    removeCoins,
    updateBalance,
    setDaily,
    setWeekly,
    getBank,
    deposit,
    withdraw
};
