const { EmbedBuilder } = require("discord.js");
const Giveaway = require("../models/giveawaySchema");

const safe = (v, d="N/A") =>
  v === undefined || v === null ? d : String(v);

// ===== EMOJI =====
function getEmojiKeyFromRaw(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const m = v.match(/^<a?:\w+:(\d+)>$/);
  return m ? `id:${m[1]}` : `unicode:${v}`;
}

function getEmojiKeyFromReaction(emoji) {
  if (emoji?.id) return `id:${emoji.id}`;
  if (emoji?.name) return `unicode:${emoji.name}`;
  return null;
}

function resolveEmojiForReact(raw) {
  const v = String(raw || "").trim();
  if (!v) return "🎉";
  const m = v.match(/^<a?:\w+:(\d+)>$/);
  return m ? m[1] : v;
}

// ===== TIME =====
function ts(d) {
  return `<t:${Math.floor(new Date(d).getTime()/1000)}:R>`;
}

// ===== EMBED =====
function buildActiveEmbed(g) {
  return new EmbedBuilder()
    .setColor(0x2f9e44)
    .setTitle("🎉 Giveaway")
    .setDescription([
      `Prize: **${safe(g.prizeText)}**`,
      `Winners: **${safe(g.winnersCount)}**`,
      `End: ${ts(g.endAt)}`,
      `Host: <@${safe(g.hostId)}>` ,
      `React ${safe(g.emojiRaw, "🎉")}`
    ].join("\n"))
    .setFooter({ text: `ID: ${safe(g.messageId, "...")}` });
}

function buildEndedEmbed(g, winners) {
  return new EmbedBuilder()
    .setColor(0x888888)
    .setTitle("Giveaway Ended")
    .setDescription([
      `Prize: ${safe(g.prizeText)}`,
      `Winners: ${safe(winners.join(", "), "None")}`
    ].join("\n"));
}

// ===== LOGIC =====
function pick(arr, n) {
  const a = [...arr], r = [];
  while (r.length < n && a.length) {
    r.push(a.splice(Math.random()*a.length|0,1)[0]);
  }
  return r;
}

async function fetchGiveawayMessage(client, giveaway) {
  const ch = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return null;

  return ch.messages.fetch(giveaway.messageId).catch(() => null);
}

async function finishGiveaway(client, giveaway) {
  giveaway.ended = true;
  giveaway.processing = false;
  giveaway.endedAt = new Date();
  giveaway.winners = pick(giveaway.entrants, giveaway.winnersCount);
  await giveaway.save();

  const msg = await fetchGiveawayMessage(client, giveaway);
  if (msg) {
    await msg.edit({ embeds: [buildEndedEmbed(giveaway, giveaway.winners)] }).catch(() => {});
  }

  return giveaway;
}

async function endGiveawayById(client, id, guildId) {
  const g = await Giveaway.findOne({ messageId:id, guildId, ended:false });
  if (!g) return { ok:false };

  await finishGiveaway(client, g);

  return { ok:true };
}

async function rerollGiveawayById(client, id, guildId) {
  const g = await Giveaway.findOne({ messageId:id, guildId, ended:true });
  if (!g) return { ok:false };

  const winners = pick(g.entrants, g.winnersCount);
  g.winners = winners;
  await g.save();

  return { ok:true };
}

async function handleGiveawayReactionAdd(reaction, user) {
  if (!reaction || !user || user.bot) return;

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  const message = reaction.message;
  if (!message?.guild) return;

  const emojiKey = getEmojiKeyFromReaction(reaction.emoji);
  if (!emojiKey) return;

  const giveaway = await Giveaway.findOne({
    guildId: message.guild.id,
    messageId: message.id,
    ended: false,
  });
  if (!giveaway || giveaway.emojiKey !== emojiKey) return;

  if (!giveaway.entrants.includes(user.id)) {
    giveaway.entrants.push(user.id);
    await giveaway.save();
  }
}

async function handleGiveawayReactionRemove(reaction, user) {
  if (!reaction || !user || user.bot) return;

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  const message = reaction.message;
  if (!message?.guild) return;

  const emojiKey = getEmojiKeyFromReaction(reaction.emoji);
  if (!emojiKey) return;

  const giveaway = await Giveaway.findOne({
    guildId: message.guild.id,
    messageId: message.id,
    ended: false,
  });
  if (!giveaway || giveaway.emojiKey !== emojiKey) return;

  giveaway.entrants = giveaway.entrants.filter((id) => id !== user.id);
  await giveaway.save();
}

async function processDueGiveaways(client) {
  const dueGiveaways = await Giveaway.find({
    ended: false,
    processing: { $ne: true },
    endAt: { $lte: new Date() },
  });

  for (const giveaway of dueGiveaways) {
    const locked = await Giveaway.findOneAndUpdate(
      {
        _id: giveaway._id,
        ended: false,
        processing: { $ne: true },
      },
      { $set: { processing: true } },
      { new: true }
    );

    if (!locked) continue;

    try {
      await finishGiveaway(client, locked);
    } catch (err) {
      locked.processing = false;
      await locked.save().catch(() => {});
      console.error("[GIVEAWAY END ERROR]", err.message);
    }
  }
}

function startGiveawayScheduler(client) {
  if (!client) return;

  if (client.giveawayScheduler) {
    clearInterval(client.giveawayScheduler);
  }

  const tick = async () => {
    try {
      await processDueGiveaways(client);
    } catch (err) {
      console.error("[GIVEAWAY SCHEDULER ERROR]", err.message);
    }
  };

  client.giveawayScheduler = setInterval(tick, 30 * 1000);
  tick().catch(() => {});
}

module.exports = {
  getEmojiKeyFromRaw,
  resolveEmojiForReact,
  buildActiveEmbed,
  endGiveawayById,
  rerollGiveawayById,
  handleGiveawayReactionAdd,
  handleGiveawayReactionRemove,
  startGiveawayScheduler
};
