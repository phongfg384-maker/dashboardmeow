const { EmbedBuilder } = require("discord.js");

const SCRIPTBLOX_BASE_URL = "https://scriptblox.com";

function toYesNo(value) {
  return value ? "✅" : "❌";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function truncate(text, maxLen) {
  const input = String(text || "");
  if (input.length <= maxLen) return input;
  return `${input.slice(0, Math.max(0, maxLen - 3))}...`;
}

function toAbsoluteUrl(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return `${SCRIPTBLOX_BASE_URL}${text}`;
  return `${SCRIPTBLOX_BASE_URL}/${text}`;
}

function formatCreatedAt(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScriptCode(scriptText) {
  const raw = String(scriptText || "").trim();
  if (!raw) return "No script content.";
  const maxCodeLen = 920;
  return truncate(raw, maxCodeLen);
}

async function searchScriptBlox(query, options = {}) {
  const q = String(query || "").trim();
  const max = Math.min(Math.max(Number(options.max || 5), 1), 50);
  const page = Math.max(Number(options.page || 1), 1);

  if (!q) {
    throw new Error("Missing query");
  }

  const url = new URL("/api/script/search", SCRIPTBLOX_BASE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("max", String(max));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0; +https://scriptblox.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`ScriptBlox request failed (${response.status})`);
  }

  const payload = await response.json();
  const result = payload?.result || {};
  const scripts = Array.isArray(result.scripts) ? result.scripts : [];

  return {
    query: q,
    scripts,
    page,
    totalPages: Number(result.totalPages || 1),
    nextPage: result.nextPage ?? null,
  };
}

function buildScriptBloxEmbed(data, scriptIndex, requestedByTag) {
  const { query, scripts } = data;
  const embed = new EmbedBuilder()
    .setColor(0xff8c00)
    .setTitle(`ScriptBlox Results: ${query}`)
    .setTimestamp();

  if (requestedByTag) {
    embed.setFooter({ text: `Requested by ${requestedByTag}` });
  }

  if (!scripts.length) {
    embed.setDescription("No scripts were found for this keyword.");
    return embed;
  }

  const safeIndex = Math.min(Math.max(Number(scriptIndex || 0), 0), scripts.length - 1);
  const script = scripts[safeIndex];
  const title = truncate(script.title || "Untitled", 200);
  const gameName = truncate(script?.game?.name || "Unknown game", 80);
  const type = String(script.scriptType || "unknown").toUpperCase();
  const createdAt = formatCreatedAt(script.createdAt);
  const detailLink = script.slug
    ? `${SCRIPTBLOX_BASE_URL}/script/${encodeURI(script.slug)}`
    : `${SCRIPTBLOX_BASE_URL}/api/script/${encodeURIComponent(script._id || "")}`;
  const rawLink = script._id
    ? `${SCRIPTBLOX_BASE_URL}/api/script/raw/${encodeURIComponent(script._id)}`
    : null;
  const imageUrl = toAbsoluteUrl(script.image || script?.game?.imageUrl);
  const scriptCode = formatScriptCode(script.script);

  embed.setTitle(title);
  embed.setDescription(
    [
      `**Game:**`,
      gameName,
      `**Views:**`,
      formatNumber(script.views),
      `**Verified:**`,
      toYesNo(script.verified),
      `**Key Required:**`,
      toYesNo(script.key),
      `**Universal:**`,
      toYesNo(script.isUniversal),
      `**Patched:**`,
      toYesNo(script.isPatched),
      `**Type:**`,
      type,
      `**Created At:**`,
      createdAt,
      `**Links:**`,
      rawLink ? `[Open Page](${detailLink}) | [Raw](${rawLink})` : `[Open Page](${detailLink})`,
    ].join("\n")
  );

  embed.addFields({
    name: "Script Content",
    value: `\`\`\`lua\n${scriptCode}\n\`\`\``,
  });

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  const footerBase = requestedByTag ? `Requested by ${requestedByTag}` : "ScriptBlox";
  const scriptId = script?._id ? ` | ID Script: ${script._id}` : "";
  embed.setFooter({
    text: `${footerBase}${scriptId}`,
  });

  return embed;
}

module.exports = {
  searchScriptBlox,
  buildScriptBloxEmbed,
};
