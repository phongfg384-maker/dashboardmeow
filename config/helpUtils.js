const {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  EMOJI_HOME, EMOJI_FILES, EMOJI_UNITY, EMOJI_SETTING,
  EMOJI_M_, EMOJI_PREMIUM, EMOJI_MODERATOR, EMOJI_MEMBERS,
  EMOJI_MUSIC, EMOJI_OTHER, EMOJI_FUN, EMOJI_D_
} = require("./constants");

// ─────────────────────────────────────────────
//  CATEGORY METADATA
// ─────────────────────────────────────────────
const CATEGORY_META = {
  system:                   { label: "System",             emoji: EMOJI_SETTING,     order: 1 },
  admin:                    { label: "Admin",              emoji: EMOJI_M_,          order: 2 },
  premium:                  { label: "Premium",            emoji: EMOJI_PREMIUM,     order: 3 },
  "admin (only in meow hub)": { label: "Meow Hub Admin",   emoji: EMOJI_MODERATOR,   order: 4 },
  members:                  { label: "Members",            emoji: EMOJI_MEMBERS,     order: 5 },
  fun:                      { label: "Fun",                emoji: EMOJI_FUN,         order: 6 },
  music:                    { label: "Music",              emoji: EMOJI_MUSIC,       order: 7 },
  developer:                { label: "Developer",          emoji: EMOJI_D_,          order: 8 }, // Đã sửa thành "developer"
  other:                    { label: "Other",              emoji: EMOJI_OTHER,       order: 9 }, // Chuyển Other xuống cuối
};

// ─────────────────────────────────────────────
//  DESIGN TOKENS  (discord embed limits)
// ─────────────────────────────────────────────
// Colors
const CLR_ACCENT   = 0xFEA166;   // Meow Hub Ear Color – Embed 
const CLR_SECOND   = 0x4f46e5;   // Deeper indigo – secondary
const CLR_SUCCESS  = 0x22c55e;   // Green – highlights
const CLR_CARD_BG  = 0x1e1e2e;   // Dark navy – field bg (approximated)
const CLR_DIVIDER  = 0x2e2e3e;   // Muted – separator
const CLR_TEXT     = 0xe2e8f0;   // Off-white – primary text
const CLR_MUTED    = 0x94a3b8;   // Muted – secondary text
const CLR_DANGER   = 0xef4444;   // Red – warnings

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const HOME_VALUE  = "home";
const PREV_VALUE  = "help_prev";
const NEXT_VALUE  = "help_next";
const PAGE_SIZE   = 9;

// Visual separators  (double-line box drawing)
const BAR_TOP     = "╔" + "═".repeat(50) + "╗";
const BAR_MID     = "╠" + "═".repeat(50) + "╣";
const BAR_BOT     = "╚" + "═".repeat(50) + "╝";
const BAR_SIDE    = "║";

// ─────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────
function isDashboardRelated(cmd) {
  const s = `${cmd?.name || ""} ${cmd?.description || ""} ${cmd?.category || ""}`.toLowerCase();
  return s.includes("dashboard");
}

function getUniqueCommands(collection) {
  const map = new Map();
  for (const cmd of collection.values()) {
    if (!cmd || !cmd.name) continue;
    map.set(cmd.name, cmd);
  }
  return Array.from(map.values());
}

function normalizeCategory(cat) {
  const key = String(cat || "other").toLowerCase();
  return CATEGORY_META[key] ? key : "other";
}

function groupByCategory(commands) {
  const grouped = new Map();
  for (const cmd of commands) {
    const cat = normalizeCategory(cmd.category);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(cmd);
  }
  return grouped;
}

function getBotAvatarUrl(client) {
  return client?.user?.displayAvatarURL({ size: 1024 }) || null;
}

async function getBotBannerUrl(client) {
  const user = client?.user;
  if (!user) return null;
  const cached = user.bannerURL({ size: 1024 }) || null;
  if (cached) return cached;
  try {
    const fresh = await user.fetch(true);
    return fresh.bannerURL({ size: 1024 }) || null;
  } catch {
    return null;
  }
}

function footerTimestamp() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildStatLine(allCommands) {
  const catCount = new Set(allCommands.map((c) => normalizeCategory(c.category))).size;
  return `**${catCount}** categories  ·  **${allCommands.length}** commands`;
}

function badge(text) {
  return `\`${text}\``;
}

function tag(text) {
  return `\`${text}\``;
}

// Split lines into fields that respect Discord's 1024-char limit per field value
function splitIntoFields(lines, maxLen = 1020) {
  const parts = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) parts.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function buildCommandLine(cmd, prefix) {
  const desc = cmd.description ? ` · *${cmd.description}*` : "";
  return `> **${prefix}${cmd.name}**${desc}`;
}

// ─────────────────────────────────────────────
//  SELECT MENU  (styled)
// ─────────────────────────────────────────────
function buildSelectMenu(selectedValue = HOME_VALUE, disabled = false) {
  const options = [
    {
      label:       "Overview",
      value:       HOME_VALUE,
      emoji:       { id: "1501257063949537280", name: "home" },
      description: "View the help overview",
    },
  ];

  const sortedCategories = Object.entries(CATEGORY_META)
    .sort((a, b) => a[1].order - b[1].order);

  for (const [key, meta] of sortedCategories) {
    options.push({
      label:       meta.label,
      value:       key,
      emoji:       meta.emoji,
      description: `Browse ${meta.label} commands`,
      default:     key === selectedValue,
    });
  }

  if (selectedValue === HOME_VALUE) options[0].default = true;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help-category-select")
      .setPlaceholder("✦  Browse commands by category")
      .setDisabled(disabled)
      .addOptions(options)
  );
}

// ─────────────────────────────────────────────
//  NAVIGATION BUTTONS  (styled)
// ─────────────────────────────────────────────
function buildNavButtons(currentPage, totalPages, category) {
  const hasMultiple = totalPages > 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PREV_VALUE)
      .setLabel("◂  Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1 || !hasMultiple),
    new ButtonBuilder()
      .setCustomId(HOME_VALUE)
      .setLabel("home")
      .setEmoji("<:home1:1501257063949537280>")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(NEXT_VALUE)
      .setLabel("Next  ▸")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages || !hasMultiple),
  );
}

// ─────────────────────────────────────────────
//  PAGE STATE
// ─────────────────────────────────────────────
let _pageCache = new Map();

function getPageCache(msgId)    { return _pageCache.get(msgId) || null; }
function setPageCache(msgId, d) { _pageCache.set(msgId, d); }
function clearPageCache(msgId)  { _pageCache.delete(msgId); }

// ─────────────────────────────────────────────
//  INTRO / HOME EMBED  (fields-based, rich)
// ─────────────────────────────────────────────
function buildIntroEmbed(client, prefix, allCommands, bannerUrl) {
  const botName  = client?.user?.username || "Bot";
  const avatar   = getBotAvatarUrl(client);
  const grouped  = groupByCategory(allCommands);
  const catCount = new Set(allCommands.map((c) => normalizeCategory(c.category))).size;
  const ts       = footerTimestamp();

  const sortedCategories = Object.entries(CATEGORY_META)
    .sort((a, b) => a[1].order - b[1].order);

  // Build category field lines (grouped in pairs of 2 for inline feel)
  const catFieldLines = [];
  for (const [key, meta] of sortedCategories) {
    const count = grouped.get(key)?.length ?? 0;
    if (count === 0) continue;
    catFieldLines.push(`${meta.emoji}  **${meta.label}**  ·  ${count} cmd${count !== 1 ? "s" : ""}`);
  }

  const catFieldParts = splitIntoFields(catFieldLines, 1020);

  // Build quick-ref field
  const quickRefLines = [
    `> **Prefix:** ${badge(prefix)}`,
    `> **Command help:** ${badge(`${prefix}help <command>`)}`,
    `> **Total:** ${buildStatLine(allCommands)}`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setColor(CLR_ACCENT)
    .setAuthor({
      name:    `${botName}  ·  Help Center`,
      iconURL: avatar,
    })
    .setTitle("HELP MENU")
    .setThumbnail(avatar)
    .setDescription(
      [
        `> Welcome to **${botName}** — browse all available commands below.`,
        `> Use the **dropdown menu** to filter by category.`,
      ].join("\n")
    )
    .addFields(
      {
        name:  `${EMOJI_FILES}  Categories`,
        value: catFieldParts[0] || "*No categories available.*",
        inline: false,
      },
      ...catFieldParts.slice(1).map((part, i) => ({
        name:  "\u200b",
        value:  part,
        inline: false,
      })),
      {
        name:  `${EMOJI_UNITY} Quick Reference`,
        value: quickRefLines,
        inline: false,
      }
    )
    .setFooter({
      text:    `${botName}  ·  ${ts}  ·  ${catCount} categories  ·  ${allCommands.length} commands`,
      iconURL: avatar,
    })
    .setTimestamp();

  if (bannerUrl) embed.setImage(bannerUrl);

  return embed;
}

// ─────────────────────────────────────────────
//  CATEGORY EMBED  (rich, paginated)
// ─────────────────────────────────────────────
function buildCategoryEmbed(client, prefix, categoryKey, allCommands, bannerUrl, page = 1) {
  const meta       = CATEGORY_META[categoryKey] || CATEGORY_META.other;
  const grouped    = groupByCategory(allCommands);
  const cmds       = (grouped.get(categoryKey) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const totalPages = Math.max(1, Math.ceil(cmds.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(1, page), totalPages);
  const start      = (safePage - 1) * PAGE_SIZE;
  const pageCmds   = cmds.slice(start, start + PAGE_SIZE);

  const botName    = client?.user?.username || "Bot";
  const avatar     = getBotAvatarUrl(client);
  const ts         = footerTimestamp();

  const fieldLines = pageCmds.map((cmd) => buildCommandLine(cmd, prefix));
  const fieldParts = splitIntoFields(fieldLines, 1020);

  const embed = new EmbedBuilder()
    .setColor(CLR_ACCENT)
    .setAuthor({
      name:    `${botName}  ·  Help Center`,
      iconURL: avatar,
    })
    .setTitle(`${meta.emoji}  ${meta.label}  ·  Page ${safePage} / ${totalPages}`)
    .setThumbnail(avatar)
    .setDescription(
      [
        `> **${cmds.length}** command${cmds.length !== 1 ? "s" : ""} in this category.`,
        `> Use ${badge(`${prefix}help <command>`)} for details.`,
      ].join("\n")
    )
    .addFields(
      ...fieldParts.map((part, idx) => ({
        name:   fieldParts.length > 1 ? `${meta.emoji}  Commands  (${idx + 1} / ${fieldParts.length})` : `${meta.emoji}  Commands`,
        value:   part,
        inline:  false,
      }))
    )
    .setFooter({
      text:    `${botName}  ·  ${ts}`,
      iconURL: avatar,
    })
    .setTimestamp();

  if (bannerUrl) embed.setImage(bannerUrl);

  return { embed, totalPages, safePage, pageCmds, sortedCmds: cmds };
}

// ─────────────────────────────────────────────
//  SINGLE COMMAND EMBED  (detailed, styled)
// ─────────────────────────────────────────────
function buildCommandEmbed(client, prefix, cmd, bannerUrl) {
  const catKey   = normalizeCategory(cmd.category);
  const meta     = CATEGORY_META[catKey] || CATEGORY_META.other;
  const botName  = client?.user?.username || "Bot";
  const avatar   = getBotAvatarUrl(client);
  const ts       = footerTimestamp();
  const usage    = cmd.usage ? badge(`${prefix}${cmd.name} ${cmd.usage}`) : badge(`${prefix}${cmd.name}`);
  const aliases  = Array.isArray(cmd.aliases) && cmd.aliases.length
    ? cmd.aliases.map((a) => badge(a)).join("  ")
    : `*None*`;

  const embed = new EmbedBuilder()
    .setColor(CLR_ACCENT)
    .setAuthor({
      name:    `${botName}  ·  Command Details`,
      iconURL: avatar,
    })
    .setTitle(`${meta.emoji}  /${cmd.name}`)
    .setThumbnail(avatar)
    .setDescription(
      [
        `> ${cmd.description || "*No description provided.*"}`,
      ].join("\n")
    )
    .addFields(
      {
        name:   "🏷️  Category",
        value:  `${meta.emoji}  ${meta.label}`,
        inline: true,
      },
      {
        name:   "🔧  Usage",
        value:  usage,
        inline: true,
      },
      {
        name:   "\u200b",
        value:  "\u200b",
        inline: true,
      },
      {
        name:   "🔀  Aliases",
        value:  aliases,
        inline: false,
      }
    )
    .setFooter({
      text:    `${botName}  ·  ${ts}  ·  ${prefix}help to return`,
      iconURL: avatar,
    })
    .setTimestamp();

  if (bannerUrl) embed.setImage(bannerUrl);

  return embed;
}

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────
module.exports = {
  CATEGORY_META,
  HOME_VALUE,
  PREV_VALUE,
  NEXT_VALUE,
  PAGE_SIZE,
  ComponentType,
  getUniqueCommands,
  isDashboardRelated,
  buildSelectMenu,
  buildNavButtons,
  buildIntroEmbed,
  buildCategoryEmbed,
  buildCommandEmbed,
  getBotBannerUrl,
  getPageCache,
  setPageCache,
  clearPageCache,
};
