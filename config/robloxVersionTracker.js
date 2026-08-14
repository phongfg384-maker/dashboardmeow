const { EmbedBuilder } = require("discord.js");

const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = {
  expiresAt: 0,
  data: null,
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchText(url, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "text/html,application/json,text/plain,*/*",
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function parseDeployHistoryTimestamp(historyText, platformLabel, gitHashVersion) {
  if (!historyText || !gitHashVersion) return null;

  const escapedPlatform = platformLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedVersion = gitHashVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `New ${escapedPlatform} version-hidden at ([^\\r\\n]+?), file version:[^\\r\\n]*?git hash: ${escapedVersion}\\s+\\.\\.\\.(?:Done!)?`,
    "g"
  );

  let match = null;
  for (const current of historyText.matchAll(pattern)) {
    match = current;
  }

  if (!match?.[1]) return null;

  const parsed = Date.parse(`${match[1]} UTC`);
  if (Number.isNaN(parsed)) return null;

  return Math.floor(parsed / 1000);
}

function parseGooglePlayVersion(html) {
  const match = html.match(
    /"version"\s*:\s*"(\d+\.\d+\.\d+(?:\.\d+)?)"[^x]{0,200}xdtEp[^"]*"(\d{10})"/
  );

  if (!match) {
    const versionMatch = html.match(/\b(\d+\.\d+\.\d+(?:\.\d+)?)\b/);
    const dateMatch = html.match(/(\d{1,2}\s+\w+\s+\d{4})/);
    if (!versionMatch) {
      throw new Error("Could not parse Google Play version block.");
    }
    return {
      version: versionMatch[1],
      updatedAt: dateMatch ? Math.floor(Date.parse(dateMatch[1]) / 1000) : null,
    };
  }

  return {
    version: match[1],
    updatedAt: Number(match[2]),
  };
}

function parseAppleApp(data) {
  const app = data?.results?.[0];
  if (!app?.version) {
    throw new Error("Could not parse Apple App Store response.");
  }

  return {
    version: app.version,
    updatedAt: app.currentVersionReleaseDate
      ? Math.floor(Date.parse(app.currentVersionReleaseDate) / 1000)
      : null,
  };
}

function formatRelativeTimestamp(unixSeconds) {
  if (!unixSeconds || Number.isNaN(unixSeconds)) {
    return "`Unknown`";
  }

  return `<t:${unixSeconds}:R>`;
}

function buildRobloxVersionsEmbed(data, requestedByTag) {
  return new EmbedBuilder()
    .setColor(0x00a2ff)
    .setTitle("Latest Roblox Versions")
    .setDescription(
      [
        "**Windows**",
        `**Version:** ${data.windows.version}`,
        `**Last Updated:** ${formatRelativeTimestamp(data.windows.updatedAt)}`,
        "",
        "**Mac**",
        `**Version:** ${data.mac.version}`,
        `**Last Updated:** ${formatRelativeTimestamp(data.mac.updatedAt)}`,
        "",
        "**Android**",
        `**Global:** ${data.android.global.version} (${formatRelativeTimestamp(data.android.global.updatedAt)})`,
        `**VNG:** ${data.android.vng.version} (${formatRelativeTimestamp(data.android.vng.updatedAt)})`,
        "",
        "**iOS**",
        `**Global:** ${data.ios.global.version} (${formatRelativeTimestamp(data.ios.global.updatedAt)})`,
        `**VNG:** ${data.ios.vng.version} (${formatRelativeTimestamp(data.ios.vng.updatedAt)})`,
      ].join("\n")
    )
    .setFooter({
      text: requestedByTag ? `Requested by ${requestedByTag}` : "Auto-fetched from live sources",
    })
    .setTimestamp();
}

async function loadRobloxVersions() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return cache.data;
  }

  const [
    windowsInfo,
    macInfo,
    deployHistoryWindows,
    deployHistoryMac,
    androidGlobalHtml,
    androidVngHtml,
    iosGlobalData,
    iosVngData,
  ] = await Promise.all([
    fetchJson("https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer"),
    fetchJson("https://clientsettingscdn.roblox.com/v2/client-version/MacPlayer"),
    fetchText("https://setup.rbxcdn.com/DeployHistory.txt"),
    fetchText("https://setup.rbxcdn.com/mac/DeployHistory.txt"),
    fetchText("https://play.google.com/store/apps/details?id=com.roblox.client&hl=en_US&gl=US"),
    fetchText("https://play.google.com/store/apps/details?id=com.roblox.client.vnggames&hl=vi&gl=VN"),
    fetchJson("https://itunes.apple.com/lookup?id=431946152"),
    fetchJson("https://itunes.apple.com/lookup?id=6474715805&country=vn"),
  ]);

  const data = {
    windows: {
      version: windowsInfo.clientVersionUpload,
      updatedAt: parseDeployHistoryTimestamp(deployHistoryWindows, "WindowsPlayer", windowsInfo.version),
    },
    mac: {
      version: macInfo.clientVersionUpload,
      updatedAt: parseDeployHistoryTimestamp(deployHistoryMac, "Client", macInfo.version),
    },
    android: {
      global: parseGooglePlayVersion(androidGlobalHtml),
      vng: parseGooglePlayVersion(androidVngHtml),
    },
    ios: {
      global: parseAppleApp(iosGlobalData),
      vng: parseAppleApp(iosVngData),
    },
  };

  cache = {
    data,
    expiresAt: now + CACHE_TTL_MS,
  };

  return data;
}

module.exports = {
  buildRobloxVersionsEmbed,
  getRobloxVersions: loadRobloxVersions,
};
