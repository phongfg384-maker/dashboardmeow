const LEVEL_ROLES = [10, 50, 100, 175, 200];

async function handleLevelRole(member, level) {
    if (!LEVEL_ROLES.includes(level)) return;

    const name = `Level ${level}`;
    let role = member.guild.roles.cache.find(r => r.name === name);

    if (!role) {
        role = await member.guild.roles.create({
            name,
            color: "Random"
        });
    }

    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
    }
}

module.exports = handleLevelRole;