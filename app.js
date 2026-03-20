let project = null;
let rides = [];
let cantonPeaks = [];
let passGallery = [];
let routeProfile = null;

const dataFiles = {
  project: "./data/project.json",
  rides: "./data/rides.json",
  cantonPeaks: "./data/canton-peaks.json",
  passGallery: "./data/pass-gallery.json",
  routeProfile: "./data/route-profile.json"
};

const cantonBadgeLabels = {
  Schaffhausen: "SH",
  Aargau: "AG",
  "Basel Stadt": "BS",
  "Basel Land": "BL",
  Solothurn: "SO",
  Jura: "JU",
  "Neuchâtel": "NE",
  "Genève": "GE",
  Fribourg: "FR",
  Vaud: "VD",
  Valais: "VS",
  Ticino: "TI",
  Uri: "UR",
  Bern: "BE",
  Luzern: "LU",
  Obwalden: "OW",
  Nidwalden: "NW",
  Glarus: "GL",
  "Graubünden": "GR",
  "Appenzell Innerrhoden": "AI",
  "Appenzell Ausserrhoden": "AR",
  "St. Gallen": "SG",
  Schwyz: "SZ",
  Zug: "ZG",
  "Zürich": "ZH",
  Thurgau: "TG"
};

const peakLabelOverrides = {
  Gottschalkenberg: ["Gottschalken-", "berg"]
};

const peakMarkerYOffset = {
  "Furka Pass": 10
};

const peakLabelYOffset = {
  "Furka Pass": 1
};

const peakLabelForceRight = new Set([
  "Gottschalkenberg",
  "Glaubenberg Pass"
]);

const countryVisuals = {
  CH: {
    name: "Switzerland",
    fill: "#dff1e4"
  },
  DE: {
    name: "Germany",
    fill: "#efe7dc"
  },
  FR: {
    name: "France",
    fill: "#e4ebf8"
  },
  IT: {
    name: "Italy",
    fill: "#efe4df"
  },
  AT: {
    name: "Austria",
    fill: "#f4e2e0"
  },
  LI: {
    name: "Liechtenstein",
    fill: "#e3ebf6"
  }
};

const countryNameToCode = {
  Switzerland: "CH",
  Germany: "DE",
  France: "FR",
  Italy: "IT",
  Austria: "AT",
  Liechtenstein: "LI"
};

const summitPhotos = [
  // { canton: "Zürich",  photo: "assets/summit_pictures/zurich-2026-03-01.jpg", date: "2026-03-01", altitudeM: 915, ride: "https://strava.com/activities/...", note: "Windy" },
  { kind: "canton", region: "Schaffhausen", photo: "assets/summit_pictures/schaffhausen-2026-03-07.jpg" },
  { kind: "canton", region: "Aargau", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Basel Stadt", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Basel Land", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Solothurn", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Jura", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Neuchâtel", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Genève", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Fribourg", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Vaud", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Valais", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Ticino", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Uri", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Bern", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Luzern", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Obwalden", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Nidwalden", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Glarus", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Graubünden", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Appenzell Innerrhoden", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Appenzell Ausserrhoden", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "St. Gallen", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Schwyz", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Zug", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Zürich", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "canton", region: "Thurgau", photo: "assets/summit_pictures/locked.jpg" },

  { kind: "country", region: "Germany", photo: "assets/summit_pictures/germany-2026-03-07.jpg" },
  { kind: "country", region: "France", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "country", region: "Italy", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "country", region: "Austria", photo: "assets/summit_pictures/locked.jpg" },
  { kind: "country", region: "Liechtenstein", photo: "assets/summit_pictures/locked.jpg" },
];

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateLabel(value, maxLength = 18) {
  const label = String(value || "").trim();
  if (label.length <= maxLength) {
    return label;
  }
  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function splitPeakLabel(value, maxSingleLineLength = 10) {
  const label = String(value || "").trim();
  if (!label) {
    return [];
  }

  if (peakLabelOverrides[label]) {
    return peakLabelOverrides[label];
  }

  if (label.length <= maxSingleLineLength || !label.includes(" ")) {
    return [truncateLabel(label, 18)];
  }

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return [truncateLabel(label, 18)];
  }

  let bestSplitIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let splitIndex = 1; splitIndex < words.length; splitIndex += 1) {
    const left = words.slice(0, splitIndex).join(" ");
    const right = words.slice(splitIndex).join(" ");
    const score = Math.abs(left.length - right.length);
    if (score < bestScore) {
      bestScore = score;
      bestSplitIndex = splitIndex;
    }
  }

  return [
    truncateLabel(words.slice(0, bestSplitIndex).join(" "), 16),
    truncateLabel(words.slice(bestSplitIndex).join(" "), 16)
  ];
}

function getCompletedKm() {
  return rides.reduce((sum, ride) => sum + (ride.distanceKm || 0), 0);
}

function getCompletedElevation() {
  return rides.reduce((sum, ride) => sum + (ride.elevationM || 0), 0);
}

function getCantonBadgeLabel(canton) {
  if (cantonBadgeLabels[canton]) {
    return cantonBadgeLabels[canton];
  }

  return String(canton || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token[0])
    .join("")
    .toUpperCase();
}

function getCantonLogoPath(canton) {
  const badgeLabel = getCantonBadgeLabel(canton).toLowerCase();
  return getCantonLogoPathFromCode(badgeLabel);
}

function getCantonLogoPathFromCode(code) {
  return `./assets/canton-logos/${String(code || "").toLowerCase()}.png`;
}

function getCountryVisual(code) {
  return countryVisuals[code] || { name: code, fill: "#e8ece9" };
}

function getCountryCode(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const upper = raw.toUpperCase();
  if (countryVisuals[upper]) {
    return upper;
  }

  return countryNameToCode[raw] || "";
}

function buildCountryFlagMarkup(code, x, y, width, height) {
  const safeCode = escapeHtml(String(code || "").toUpperCase());
  const halfHeight = height / 2;
  const thirdHeight = height / 3;
  const thirdWidth = width / 3;

  if (safeCode === "CH") {
    const barWidth = width * 0.18;
    const barHeight = height * 0.58;
    const crossArmWidth = width * 0.52;
    const crossArmHeight = height * 0.18;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="#d52b1e"></rect>
        <rect x="${(centerX - barWidth / 2).toFixed(1)}" y="${(centerY - barHeight / 2).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="1.2" fill="#ffffff"></rect>
        <rect x="${(centerX - crossArmWidth / 2).toFixed(1)}" y="${(centerY - crossArmHeight / 2).toFixed(1)}" width="${crossArmWidth.toFixed(1)}" height="${crossArmHeight.toFixed(1)}" rx="1.2" fill="#ffffff"></rect>
      </g>
    `;
  }

  if (safeCode === "DE") {
    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${thirdHeight.toFixed(1)}" fill="#1f1f1f"></rect>
        <rect x="${x.toFixed(1)}" y="${(y + thirdHeight).toFixed(1)}" width="${width.toFixed(1)}" height="${thirdHeight.toFixed(1)}" fill="#c32e31"></rect>
        <rect x="${x.toFixed(1)}" y="${(y + thirdHeight * 2).toFixed(1)}" width="${width.toFixed(1)}" height="${(height - thirdHeight * 2).toFixed(1)}" fill="#f1c24a"></rect>
      </g>
    `;
  }

  if (safeCode === "FR") {
    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${thirdWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="#2957a4"></rect>
        <rect x="${(x + thirdWidth).toFixed(1)}" y="${y.toFixed(1)}" width="${thirdWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="#ffffff"></rect>
        <rect x="${(x + thirdWidth * 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(width - thirdWidth * 2).toFixed(1)}" height="${height.toFixed(1)}" fill="#d9484d"></rect>
      </g>
    `;
  }

  if (safeCode === "IT") {
    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${thirdWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="#23935a"></rect>
        <rect x="${(x + thirdWidth).toFixed(1)}" y="${y.toFixed(1)}" width="${thirdWidth.toFixed(1)}" height="${height.toFixed(1)}" fill="#ffffff"></rect>
        <rect x="${(x + thirdWidth * 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(width - thirdWidth * 2).toFixed(1)}" height="${height.toFixed(1)}" fill="#d44b45"></rect>
      </g>
    `;
  }

  if (safeCode === "AT") {
    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${thirdHeight.toFixed(1)}" fill="#d9484d"></rect>
        <rect x="${x.toFixed(1)}" y="${(y + thirdHeight).toFixed(1)}" width="${width.toFixed(1)}" height="${thirdHeight.toFixed(1)}" fill="#ffffff"></rect>
        <rect x="${x.toFixed(1)}" y="${(y + thirdHeight * 2).toFixed(1)}" width="${width.toFixed(1)}" height="${(height - thirdHeight * 2).toFixed(1)}" fill="#d9484d"></rect>
      </g>
    `;
  }

  if (safeCode === "LI") {
    const crownWidth = width * 0.34;
    const crownHeight = height * 0.32;
    const crownX = x + width * 0.14;
    const crownY = y + height * 0.14;

    return `
      <g class="profile-country-flag-icon">
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${halfHeight.toFixed(1)}" fill="#1f55a7"></rect>
        <rect x="${x.toFixed(1)}" y="${(y + halfHeight).toFixed(1)}" width="${width.toFixed(1)}" height="${(height - halfHeight).toFixed(1)}" fill="#cf3038"></rect>
        <path d="M${crownX.toFixed(1)} ${(crownY + crownHeight).toFixed(1)} L${(crownX + crownWidth * 0.15).toFixed(1)} ${crownY.toFixed(1)} L${(crownX + crownWidth * 0.4).toFixed(1)} ${(crownY + crownHeight * 0.45).toFixed(1)} L${(crownX + crownWidth * 0.65).toFixed(1)} ${crownY.toFixed(1)} L${(crownX + crownWidth * 0.85).toFixed(1)} ${(crownY + crownHeight * 0.45).toFixed(1)} L${(crownX + crownWidth).toFixed(1)} ${crownY.toFixed(1)} L${(crownX + crownWidth).toFixed(1)} ${(crownY + crownHeight).toFixed(1)} Z" fill="#f5cc5d"></path>
        <rect x="${(crownX + crownWidth * 0.1).toFixed(1)}" y="${(crownY + crownHeight * 0.76).toFixed(1)}" width="${(crownWidth * 0.8).toFixed(1)}" height="${(crownHeight * 0.22).toFixed(1)}" rx="1" fill="#f5cc5d"></rect>
      </g>
    `;
  }

  return `
    <g class="profile-country-flag-icon">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="#d8dfda"></rect>
    </g>
  `;
}

function buildCountryFlagSvg(code, width = 22, height = 15, className = "") {
  const safeClassName = escapeHtml(className);
  const safeCode = String(code || "").toUpperCase();

  let w = width;
  let h = height;
  if (safeCode === "CH") {
    const s = Math.min(width, height);
    w = s;
    h = s;
  }

  return `
    <svg class="${safeClassName}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
      ${buildCountryFlagMarkup(safeCode, 0, 0, w, h)}
    </svg>
  `;
}

function buildKomootEmbedUrl(tourUrl, locale = "de-de") {
  try {
    const url = new URL(tourUrl);
    const tourMatch = url.pathname.match(/\/tour\/(\d+)/);
    if (!tourMatch) {
      return null;
    }

    const tourId = tourMatch[1];
    const shareToken = url.searchParams.get("share_token");
    const base = `https://www.komoot.com/${locale}/tour/${tourId}/embed`;

    if (!shareToken) {
      return base;
    }
    return `${base}?share_token=${encodeURIComponent(shareToken)}`;
  } catch (_error) {
    return null;
  }
}

function renderKomootMap() {
  const mapLink = document.getElementById("komoot-tour-link");
  const mapEmbed = document.getElementById("komoot-tour-embed");

  if (mapLink && project?.komootTourUrl) {
    mapLink.href = project.komootTourUrl;
  }

  const localeFromData =
    typeof project?.komootEmbedLocale === "string" && project.komootEmbedLocale.trim()
      ? project.komootEmbedLocale.trim().toLowerCase()
      : "de-de";

  const embedUrl = buildKomootEmbedUrl(project?.komootTourUrl || "", localeFromData);
  if (mapEmbed && embedUrl) {
    mapEmbed.src = embedUrl;
  }
}

function renderStats() {
  const statsHost = document.getElementById("stats");
  if (!statsHost) {
    return;
  }

  const completedCantons = cantonPeaks.filter((c) => c.done).length;
  const completedKm = getCompletedKm();
  const completedElevation = getCompletedElevation();

  const countriesMentioned = new Set();
  rides.forEach((ride) => {
    const countries =
      Array.isArray(ride.countriesVisited) && ride.countriesVisited.length
        ? ride.countriesVisited
        : ["Switzerland"];
    countries.forEach((country) => countriesMentioned.add(country));
  });

  const kmProgressPct = clampPercent((completedKm / project.totalDistanceKm) * 100);
  const elevProgressPct = clampPercent((completedElevation / project.totalElevationM) * 100);
  const visitedCountryCodes = Array.from(countriesMentioned)
    .map((country) => getCountryCode(country))
    .filter(Boolean)
    .sort((left, right) => {
      const order = ["CH", "DE", "FR", "IT", "AT", "LI"];
      return order.indexOf(left) - order.indexOf(right);
    });

  const cards = [
    {
      label: "Canton Peaks Completed",
      value: `${completedCantons} / ${cantonPeaks.length}`
    },
    {
      label: "Logged Rides",
      value: `${rides.length}`
    },
    {
      label: "Countries visited",
      value: `${countriesMentioned.size}`,
      extraHtml: visitedCountryCodes.length
        ? `<div class="stat-country-flags">${visitedCountryCodes
          .map((countryCode) => buildCountryFlagSvg(countryCode, 24, 16, "stat-country-flag"))
          .join("")}</div>`
        : ""
    },
    {
      label: "KM Progress",
      value: `${formatNumber(completedKm, 1)} / ${formatNumber(project.totalDistanceKm, 1)} km`,
      progress: kmProgressPct
    },
    {
      label: "Elevation Progress",
      value: `${formatNumber(completedElevation)} / ${formatNumber(project.totalElevationM)} m`,
      progress: elevProgressPct
    }
  ];

  statsHost.innerHTML = cards
    .map((card) => {
      const progressHtml =
        typeof card.progress === "number"
          ? `<div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${card.progress.toFixed(1)}%"></div></div><p class="progress-pct">${card.progress.toFixed(1)}%</p></div>`
          : "";

      return `
        <article class="stat">
          <p class="stat-label">${card.label}</p>
          <p class="stat-value">${card.value}</p>
          ${card.extraHtml || ""}
          ${progressHtml}
        </article>
      `;
    })
    .join("");
}

function renderPassGallery() {
  const host = document.getElementById("pass-grid");
  if (!host) {
    return;
  }

  host.innerHTML = passGallery
    .map(
      (pass) => `
      <article class="pass-card">
        <img src="${pass.imageUrl}" alt="${pass.name}">
        <div class="meta">
          <p class="name">${pass.name}</p>
          <p class="source"><a href="${pass.sourceUrl}" target="_blank" rel="noopener noreferrer">Source</a></p>
        </div>
      </article>
    `
    )
    .join("");
}

function renderRides() {
  const host = document.getElementById("ride-list");
  if (!host) {
    return;
  }

  if (!rides.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = rides
    .map((ride) => {
      const strava = ride.stravaUrl
        ? `<a href="${ride.stravaUrl}" target="_blank" rel="noopener noreferrer">Open Strava activity</a>`
        : "Strava link pending.";

      return `
        <article class="ride-card">
          <p class="title">${ride.name}</p>
          <div class="ride-grid">
            <p class="small"><strong>Date:</strong> ${ride.date || "TBD"}</p>
            <p class="small"><strong>Distance:</strong> ${formatNumber(ride.distanceKm || 0, 1)} km</p>
            <p class="small"><strong>Elevation:</strong> ${formatNumber(ride.elevationM || 0)} m</p>
            <p class="small"><strong>Cantons:</strong> ${(ride.cantons || []).join(", ") || "-"}</p>
          </div>
          <p class="small">${strava}</p>
        </article>
      `;
    })
    .join("");
}

function renderCantons() {
  const body = document.getElementById("canton-body");
  if (!body) {
    return;
  }

  body.innerHTML = [...cantonPeaks]
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const completedIcon = c.done
        ? '<span class="complete-icon done" aria-label="Completed">✅</span>'
        : '<span class="complete-icon pending" aria-label="Not completed">❌</span>';

      let stravaCell = '<span class="strava-empty">-</span>';
      if (c.done) {
        stravaCell = c.stravaUrl
          ? `<a class="strava-row-link" href="${c.stravaUrl}" target="_blank" rel="noopener noreferrer"><img class="strava-row-logo" src="./assets/strava-logo.png" alt="Strava activity"></a>`
          : '<img class="strava-row-logo strava-row-logo-muted" src="./assets/strava-logo.png" alt="Strava activity">';
      }

      return `
        <tr>
          <td>${c.order}</td>
          <td>${c.canton}</td>
          <td>${c.peak}</td>
          <td>${formatNumber(c.altitudeM)}</td>
          <td class="completed-cell">${completedIcon}</td>
          <td class="strava-cell">${stravaCell}</td>
        </tr>
      `;
    })
    .join("");
}

function buildElevationTicks(minElevationM, maxElevationM) {
  const step = 100;
  const firstTick = Math.ceil(minElevationM / step) * step;
  const ticks = [];

  for (let value = firstTick; value <= maxElevationM; value += step) {
    ticks.push(value);
  }

  return ticks;
}

function buildDistanceTicks(totalKm) {
  const step = 100;
  const ticks = [];

  for (let value = step; value < totalKm; value += step) {
    ticks.push(Number(value.toFixed(3)));
  }
  return ticks;
}

function buildProfileSlice(samples, targetKm) {
  if (!samples.length) {
    return [];
  }

  const clampedKm = clampNumber(targetKm, 0, samples[samples.length - 1].km);
  if (clampedKm <= samples[0].km) {
    return [{ ...samples[0], km: clampedKm }];
  }

  const slice = [];

  for (let idx = 0; idx < samples.length; idx += 1) {
    const current = samples[idx];
    if (current.km < clampedKm) {
      slice.push(current);
      continue;
    }

    if (Math.abs(current.km - clampedKm) < 0.001) {
      slice.push(current);
      break;
    }

    const previous = slice.length ? slice[slice.length - 1] : samples[Math.max(idx - 1, 0)];
    const spanKm = current.km - previous.km;
    const ratio = spanKm <= 0 ? 0 : (clampedKm - previous.km) / spanKm;
    const interpolatedElevation =
      previous.elevationM + (current.elevationM - previous.elevationM) * ratio;

    slice.push({
      km: Number(clampedKm.toFixed(3)),
      elevationM: Number(interpolatedElevation.toFixed(1))
    });
    break;
  }

  return slice.length ? slice : [...samples];
}

function buildSvgLinePath(points) {
  if (!points.length) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function buildSvgAreaPath(points, baselineY) {
  if (points.length < 2) {
    return "";
  }

  return `${buildSvgLinePath(points)} L${points[points.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} L${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

function assignMarkerRows(markers, rowCount = 4, minGap = 148) {
  const rowLastX = Array.from({ length: rowCount }, () => -Infinity);

  return markers.map((marker) => {
    let rowIndex = rowLastX.findIndex((lastX) => marker.x - lastX >= minGap);
    if (rowIndex === -1) {
      const minLastX = Math.min(...rowLastX);
      rowIndex = rowLastX.indexOf(minLastX);
    }

    rowLastX[rowIndex] = marker.x;
    return { ...marker, rowIndex };
  });
}

function renderElevationProfile() {
  const host = document.getElementById("route-profile-svg");
  if (!host) {
    return;
  }

  if (!routeProfile || !Array.isArray(routeProfile.samples) || !routeProfile.samples.length) {
    host.innerHTML = "";
    return;
  }

  const samples = routeProfile.samples;
  const waypoints = Array.isArray(routeProfile.waypoints) ? routeProfile.waypoints : [];
  const countrySections = Array.isArray(routeProfile.countrySections) ? routeProfile.countrySections : [];
  const cantonSections = Array.isArray(routeProfile.cantonSections) ? routeProfile.cantonSections : [];
  const meta = routeProfile.meta || {};
  const totalKm = Number(meta.tourDistanceKm || project?.totalDistanceKm || samples[samples.length - 1].km || 0);
  if (!totalKm) {
    host.innerHTML = "";
    return;
  }

  const completedKm = clampNumber(getCompletedKm(), 0, totalKm);

  const width = 1600;
  const height = 548;
  const margin = {
    top: 118,
    right: 30,
    bottom: 126,
    left: 62
  };
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const countryBandHeight = 38;
  const cantonBandHeight = 34;
  const countryBandTop = plotBottom + 18;
  const countryBandBottom = countryBandTop + countryBandHeight;
  const cantonBandTop = countryBandBottom + 12;
  const cantonBandBottom = cantonBandTop + cantonBandHeight;

  host.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const rawMinElevationM = Number(meta.minElevationM ?? Math.min(...samples.map((sample) => sample.elevationM)));
  const rawMaxElevationM = Number(meta.maxElevationM ?? Math.max(...samples.map((sample) => sample.elevationM)));
  const rawElevationRange = Math.max(1, rawMaxElevationM - rawMinElevationM);
  const elevationPadding = rawElevationRange * 0.08;
  const minElevationM = Math.max(0, rawMinElevationM - elevationPadding);
  const maxElevationM = 2800;
  const elevationRangeM = Math.max(1, maxElevationM - minElevationM);

  const xForKm = (km) => plotLeft + (km / totalKm) * plotWidth;
  const yForElevation = (elevationM) => {
    const clampedElevationM = clampNumber(elevationM, minElevationM, maxElevationM);
    return plotTop + ((maxElevationM - clampedElevationM) / elevationRangeM) * plotHeight;
  };

  const allPoints = samples.map((sample) => ({
    x: xForKm(sample.km),
    y: yForElevation(sample.elevationM)
  }));
  const completedSamples = buildProfileSlice(samples, completedKm);
  const completedPoints = completedSamples.map((sample) => ({
    x: xForKm(sample.km),
    y: yForElevation(sample.elevationM)
  }));

  const currentSample = completedSamples[completedSamples.length - 1] || samples[0];
  const currentPoint = {
    x: xForKm(currentSample.km),
    y: yForElevation(currentSample.elevationM)
  };

  const elevationTicks = buildElevationTicks(minElevationM, maxElevationM);

  const markers = cantonPeaks
    .map((peak) => {
      const hasProfileKm = Number.isFinite(Number(peak.profileKm));
      const waypoint =
        Number.isInteger(peak.profileWaypointIndex) && waypoints[peak.profileWaypointIndex]
          ? waypoints[peak.profileWaypointIndex]
          : null;
      const markerKm = hasProfileKm
        ? clampNumber(Number(peak.profileKm), 0, totalKm)
        : waypoint
          ? Number(waypoint.km || 0)
          : NaN;

      if (!Number.isFinite(markerKm)) {
        return null;
      }

      const markerElevationM = Number(peak.altitudeM || waypoint?.elevationM || 0);

      return {
        canton: peak.canton,
        peak: peak.peak,
        altitudeM: peak.altitudeM,
        done: Boolean(peak.done),
        km: markerKm,
        x: xForKm(markerKm),
        y: yForElevation(markerElevationM)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);

  const laidOutMarkers = assignMarkerRows(markers);
  const nufenenMarkers = laidOutMarkers
    .filter((marker) => marker.peak === "Nufenen Pass")
    .sort((a, b) => a.km - b.km);
  const nufenenLayout =
    nufenenMarkers.length === 2
      ? {
        boxCenterX: (nufenenMarkers[0].x + nufenenMarkers[1].x) / 2,
        topRowIndex: Math.min(nufenenMarkers[0].rowIndex, nufenenMarkers[1].rowIndex)
      }
      : null;

  const gridHtml = elevationTicks
    .map((tick) => {
      const y = yForElevation(tick);
      let extraClass = "";
      if (tick === 1000 || tick === 2000) {
        extraClass = " profile-grid-line-key";
      } else if (tick === 500 || tick === 1500 || tick === 2500) {
        extraClass = " profile-grid-line-mid";
      }
      return `<line class="profile-grid-line${extraClass}" x1="${plotLeft}" y1="${y.toFixed(1)}" x2="${plotRight}" y2="${y.toFixed(1)}"></line>`;
    })
    .join("");

  const elevationLabelsHtml = [500, 1000, 1500, 2000, 2500]
    .filter((tick) => tick >= minElevationM && tick <= maxElevationM)
    .map((tick) => {
      const y = yForElevation(tick);
      return `<text class="profile-elevation-label" x="${(plotLeft - 10).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end">${formatNumber(tick)} m</text>`;
    })
    .join("");

  const countrySectionsRectsHtml = countrySections
    .map((section, index) => {
      const countryCode = String(section.countryCode || "").toUpperCase();
      const visual = getCountryVisual(countryCode);
      const startKm = clampNumber(Number(section.startKm || 0), 0, totalKm);
      const endKm = clampNumber(Number(section.endKm || 0), 0, totalKm);
      const sectionStartX = xForKm(startKm);
      const sectionEndX = xForKm(endKm);
      const sectionWidth = Math.max(1.6, sectionEndX - sectionStartX);
      const completedEndKm = clampNumber(Math.min(completedKm, endKm), startKm, endKm);
      const completedWidth = Math.max(0, xForKm(completedEndKm) - sectionStartX);
      const clipPathId = `profile-country-clip-${index}`;
      const title = escapeHtml(
        `${visual.name} (${countryCode}) • ${formatNumber(startKm, 1)}-${formatNumber(endKm, 1)} km`
      );

      return `
        <g class="profile-country-section">
          <title>${title}</title>
          <clipPath id="${clipPathId}">
            <rect x="${sectionStartX.toFixed(1)}" y="${countryBandTop.toFixed(1)}" width="${sectionWidth.toFixed(1)}" height="${countryBandHeight.toFixed(1)}" rx="10"></rect>
          </clipPath>
          <rect class="profile-country-block" x="${sectionStartX.toFixed(1)}" y="${countryBandTop.toFixed(1)}" width="${sectionWidth.toFixed(1)}" height="${countryBandHeight.toFixed(1)}" rx="10" fill="${visual.fill}"></rect>
          ${completedWidth > 0
          ? `<rect class="profile-country-block profile-country-block-complete" x="${sectionStartX.toFixed(1)}" y="${countryBandTop.toFixed(1)}" width="${completedWidth.toFixed(1)}" height="${countryBandHeight.toFixed(1)}" clip-path="url(#${clipPathId})"></rect>`
          : ""
        }
        </g>
      `;
    })
    .join("");

  const countryBoundariesHtml = countrySections
    .slice(1)
    .map((section) => {
      const x = xForKm(clampNumber(Number(section.startKm || 0), 0, totalKm));
      return `<line class="profile-country-boundary" x1="${x.toFixed(1)}" y1="${(countryBandTop - 4).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(countryBandBottom + 4).toFixed(1)}"></line>`;
    })
    .join("");

  let skippedFirstGermanyFlag = false;
  const countryLabelsHtml = countrySections
    .map((section) => {
      const countryCode = String(section.countryCode || "").toUpperCase();
      if (countryCode === "DE" && !skippedFirstGermanyFlag) {
        skippedFirstGermanyFlag = true;
        return "";
      }
      const startKm = clampNumber(Number(section.startKm || 0), 0, totalKm);
      const endKm = clampNumber(Number(section.endKm || 0), 0, totalKm);
      const centerX = (xForKm(startKm) + xForKm(endKm)) / 2;
      const flagWidth = 31;
      const flagHeight = 21;
      const flagX = centerX - flagWidth / 2;
      const flagY = countryBandTop + (countryBandHeight - flagHeight) / 2;

      return `
        <g class="profile-country-label">
          ${buildCountryFlagMarkup(countryCode, flagX, flagY, flagWidth, flagHeight)}
        </g>
      `;
    })
    .join("");

  const cantonSectionsRectsHtml = cantonSections
    .map((section, index) => {
      const sectionType = String(section.type || "");
      const startKm = clampNumber(Number(section.startKm || 0), 0, totalKm);
      const endKm = clampNumber(Number(section.endKm || 0), 0, totalKm);
      const sectionStartX = xForKm(startKm);
      const sectionEndX = xForKm(endKm);
      const sectionWidth = Math.max(1.6, sectionEndX - sectionStartX);
      const completedEndKm = clampNumber(Math.min(completedKm, endKm), startKm, endKm);
      const completedWidth = Math.max(0, xForKm(completedEndKm) - sectionStartX);
      const clipPathId = `profile-canton-clip-${index}`;
      const isSwissCanton = sectionType === "canton" && String(section.countryCode || "").toUpperCase() === "CH";
      const fill = isSwissCanton ? "#e7efe9" : "#d7dcd8";
      const title = isSwissCanton
        ? escapeHtml(
          `${section.cantonName || section.cantonCode || ""} (${String(section.cantonCode || "").toUpperCase()}) • ${formatNumber(startKm, 1)}-${formatNumber(endKm, 1)} km`
        )
        : escapeHtml(
          `${String(section.countryCode || "").toUpperCase()} • ${formatNumber(startKm, 1)}-${formatNumber(endKm, 1)} km`
        );

      return `
        <g class="profile-canton-section">
          <title>${title}</title>
          <clipPath id="${clipPathId}">
            <rect x="${sectionStartX.toFixed(1)}" y="${cantonBandTop.toFixed(1)}" width="${sectionWidth.toFixed(1)}" height="${cantonBandHeight.toFixed(1)}" rx="8"></rect>
          </clipPath>
          <rect class="profile-canton-block" x="${sectionStartX.toFixed(1)}" y="${cantonBandTop.toFixed(1)}" width="${sectionWidth.toFixed(1)}" height="${cantonBandHeight.toFixed(1)}" rx="8" fill="${fill}"></rect>
          ${completedWidth > 0
          ? `<rect class="profile-canton-block profile-canton-block-complete" x="${sectionStartX.toFixed(1)}" y="${cantonBandTop.toFixed(1)}" width="${completedWidth.toFixed(1)}" height="${cantonBandHeight.toFixed(1)}" clip-path="url(#${clipPathId})"></rect>`
          : ""
        }
        </g>
      `;
    })
    .join("");

  const cantonBoundariesHtml = cantonSections
    .slice(1)
    .map((section) => {
      const x = xForKm(clampNumber(Number(section.startKm || 0), 0, totalKm));
      return `<line class="profile-canton-boundary" x1="${x.toFixed(1)}" y1="${(cantonBandTop - 3).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(cantonBandBottom + 3).toFixed(1)}"></line>`;
    })
    .join("");

  const cantonLabelsHtml = cantonSections
    .map((section) => {
      const sectionType = String(section.type || "");
      const isSwissCanton = sectionType === "canton" && String(section.countryCode || "").toUpperCase() === "CH";
      if (!isSwissCanton) {
        return "";
      }

      const startKm = clampNumber(Number(section.startKm || 0), 0, totalKm);
      const endKm = clampNumber(Number(section.endKm || 0), 0, totalKm);
      const sectionWidth = Math.max(0, xForKm(endKm) - xForKm(startKm));
      const logoSize = Math.max(10, Math.min(24, cantonBandHeight - 4, sectionWidth - 4));
      if (logoSize < 10.5) {
        return "";
      }

      const centerX = (xForKm(startKm) + xForKm(endKm)) / 2;
      const logoX = centerX - logoSize / 2;
      const logoY = cantonBandTop + (cantonBandHeight - logoSize) / 2;

      return `
        <g class="profile-canton-label">
          <image class="profile-canton-logo" href="${escapeHtml(getCantonLogoPathFromCode(section.cantonCode || ""))}" x="${logoX.toFixed(1)}" y="${logoY.toFixed(1)}" width="${logoSize.toFixed(1)}" height="${logoSize.toFixed(1)}" preserveAspectRatio="xMidYMid meet"></image>
        </g>
      `;
    })
    .join("");

  const markersHtml = laidOutMarkers
    .map((marker) => {
      const flagWidth = 38;
      const flagHeight = 27;
      const isNufenenPair = marker.peak === "Nufenen Pass" && nufenenLayout;
      const nufenenIndex = isNufenenPair ? nufenenMarkers.findIndex((candidate) => candidate.canton === marker.canton) : -1;
      const markerYOffset = peakMarkerYOffset[marker.peak] || 0;
      const flagY = isNufenenPair
        ? 16 + (nufenenLayout.topRowIndex + nufenenIndex) * 30
        : 16 + marker.rowIndex * 30 + markerYOffset;
      const poleTopY = flagY + 1;
      const labelLines = isNufenenPair ? [] : splitPeakLabel(marker.peak, 10);
      const labelToLeft = !peakLabelForceRight.has(marker.peak) && marker.x > width - 245;
      const flagCenterX = isNufenenPair ? nufenenLayout.boxCenterX : marker.x;
      const flagX = flagCenterX - flagWidth / 2;
      const labelGap = 3;
      const nameX = labelToLeft ? flagX - labelGap : flagX + flagWidth + labelGap;
      const nameAnchor = labelToLeft ? "end" : "start";
      const nameY =
        flagY +
        (labelLines.length > 1 ? 9.6 : 15.4) +
        (peakLabelYOffset[marker.peak] || 0);
      const labelHtml = labelLines
        .map((line, index) => {
          const attrs =
            index === 0
              ? `x="${nameX.toFixed(1)}" y="${nameY.toFixed(1)}"`
              : `x="${nameX.toFixed(1)}" dy="11.8"`;
          return `<tspan ${attrs}>${escapeHtml(line)}</tspan>`;
        })
        .join("");
      const escapedTitle = escapeHtml(
        `${marker.canton} • ${marker.peak} • ${formatNumber(marker.km, 1)} km • ${formatNumber(marker.altitudeM)} m`
      );

      return `
        <g class="profile-marker ${marker.done ? "is-done" : "is-pending"}">
          <title>${escapedTitle}</title>
          <line class="profile-marker-pole" x1="${flagCenterX.toFixed(1)}" y1="${poleTopY.toFixed(1)}" x2="${marker.x.toFixed(1)}" y2="${marker.y.toFixed(1)}"></line>
          <circle class="profile-marker-dot" cx="${marker.x.toFixed(1)}" cy="${marker.y.toFixed(1)}" r="4.7"></circle>
          <rect class="profile-marker-flag" x="${flagX.toFixed(1)}" y="${flagY.toFixed(1)}" width="${flagWidth}" height="${flagHeight}" rx="7"></rect>
          <image class="profile-marker-logo" href="${escapeHtml(getCantonLogoPath(marker.canton))}" x="${(flagX + 6).toFixed(1)}" y="${(flagY + 2.5).toFixed(1)}" width="${(flagWidth - 12).toFixed(1)}" height="${(flagHeight - 5).toFixed(1)}" preserveAspectRatio="xMidYMid meet"></image>
          ${labelHtml ? `<text class="profile-marker-name" text-anchor="${nameAnchor}">${labelHtml}</text>` : ""}
        </g>
      `;
    })
    .join("");
  const nufenenSharedLabelHtml = nufenenLayout
    ? (() => {
      const flagWidth = 38;
      const flagHeight = 27;
      const topFlagY = 16 + nufenenLayout.topRowIndex * 30;
      const bottomFlagY = topFlagY + 30;
      const labelLines = splitPeakLabel("Nufenen Pass", 10);
      const flagX = nufenenLayout.boxCenterX - flagWidth / 2;
      const nameX = flagX + flagWidth + 3;
      const centerY = ((topFlagY + flagHeight / 2) + (bottomFlagY + flagHeight / 2)) / 2;
      const nameY = centerY - (labelLines.length > 1 ? 5.3 : 0);
      const labelHtml = labelLines
        .map((line, index) => {
          const attrs =
            index === 0
              ? `x="${nameX.toFixed(1)}" y="${nameY.toFixed(1)}"`
              : `x="${nameX.toFixed(1)}" dy="11.8"`;
          return `<tspan ${attrs}>${escapeHtml(line)}</tspan>`;
        })
        .join("");

      return `<text class="profile-marker-name" text-anchor="start">${labelHtml}</text>`;
    })()
    : "";

  const profileLinePath = buildSvgLinePath(allPoints);
  const profileAreaPath = buildSvgAreaPath(allPoints, plotBottom);
  const completedLinePath = buildSvgLinePath(completedPoints);
  const completedAreaPath = buildSvgAreaPath(completedPoints, plotBottom);

  host.innerHTML = `
    <title id="route-profile-title">Whole trip elevation profile</title>
    <desc id="route-profile-desc">A full-route elevation profile with completed progress, country sections, canton sections, and canton peak markers.</desc>
    <defs>
      <linearGradient id="profile-area-fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2ea85f" stop-opacity="0.30"></stop>
        <stop offset="100%" stop-color="#2ea85f" stop-opacity="0.03"></stop>
      </linearGradient>
      <linearGradient id="profile-complete-fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#135f38" stop-opacity="0.58"></stop>
        <stop offset="100%" stop-color="#135f38" stop-opacity="0.10"></stop>
      </linearGradient>
    </defs>
    <rect class="profile-bg" x="0" y="0" width="${width}" height="${height}" rx="24"></rect>
    ${gridHtml}
    ${elevationLabelsHtml}
    <line class="profile-baseline" x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}"></line>
    <path class="profile-area" d="${profileAreaPath}"></path>
    ${completedAreaPath ? `<path class="profile-area profile-area-complete" d="${completedAreaPath}"></path>` : ""}
    <path class="profile-line" d="${profileLinePath}"></path>
    ${completedLinePath ? `<path class="profile-line profile-line-complete" d="${completedLinePath}"></path>` : ""}
    ${countrySectionsRectsHtml}
    ${countryBoundariesHtml}
    ${cantonSectionsRectsHtml}
    ${cantonBoundariesHtml}
    ${completedKm > 0
      ? `
      <line class="profile-progress-line" x1="${currentPoint.x.toFixed(1)}" y1="${plotTop}" x2="${currentPoint.x.toFixed(1)}" y2="${cantonBandBottom.toFixed(1)}"></line>
      <circle class="profile-progress-dot" cx="${currentPoint.x.toFixed(1)}" cy="${currentPoint.y.toFixed(1)}" r="6.2"></circle>
    `
      : ""
    }
    ${markersHtml}
    ${nufenenSharedLabelHtml}
    ${countryLabelsHtml}
    ${cantonLabelsHtml}
  `;
}

function showDataLoadError(message) {
  const statsHost = document.getElementById("stats");
  const profileHost = document.getElementById("route-profile-svg");

  if (statsHost) {
    statsHost.innerHTML = `
      <article class="stat">
        <p class="stat-label">Data Load Error</p>
        <p class="stat-value">${message}</p>
      </article>
    `;
  }

  if (profileHost) {
    profileHost.innerHTML = "";
  }
}

async function init() {
  try {
    const [projectData, ridesData, cantonPeaksData, passGalleryData, routeProfileData] = await Promise.all([
      loadJson(dataFiles.project),
      loadJson(dataFiles.rides),
      loadJson(dataFiles.cantonPeaks),
      loadJson(dataFiles.passGallery),
      loadJson(dataFiles.routeProfile)
    ]);

    project = projectData;
    rides = Array.isArray(ridesData) ? ridesData : [];
    cantonPeaks = Array.isArray(cantonPeaksData) ? cantonPeaksData : [];
    passGallery = Array.isArray(passGalleryData) ? passGalleryData : [];
    routeProfile = routeProfileData && typeof routeProfileData === "object" ? routeProfileData : null;

    renderKomootMap();
    renderStats();
    renderElevationProfile();
    renderPassGallery();
    renderRides();
    renderCantons();
    renderSummitPhotos();
  } catch (error) {
    console.error("Failed to initialize dashboard data.", error);
    showDataLoadError("Could not load data files. Start a local server and reload.");
  }
}

function renderSummitPhotos() {
  const root = document.getElementById('summit-photos-root')
    || document.getElementById('summit-photos-grid');
  if (!root || !Array.isArray(summitPhotos)) return;

  const items = [...summitPhotos].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  const cantons = items.filter(it => (it.kind || '').toLowerCase() === 'canton');
  const countries = items.filter(it => (it.kind || '').toLowerCase() === 'country');

  const FALLBACK = 'assets/summit_pictures/locked.jpg';

  const card = (it) => {
    const kind = (it.kind || '').toLowerCase();
    const region = it.region || (kind === 'canton' ? 'Canton' : 'Country');
    const place = it.place ? ` — ${it.place}` : '';
    const imgSrc = (it.photo && String(it.photo).trim()) ? it.photo : FALLBACK;

    const labelText = (kind === 'country')
      ? `${region}`
      : `${region}`;

    const metaParts = [];
    if (it.date) metaParts.push(`Date : ${it.date}`);
    if (Number.isFinite(it.altitudeM)) metaParts.push(`Altitude : ${it.altitudeM} m`);
    if (it.ride) metaParts.push(`Ride : <a href="${it.ride}" target="_blank" rel="noopener">voir</a>`);
    if (it.note) metaParts.push(`Note : ${it.note}`);
    const metaHtml = metaParts.length ? `<div class="summit-card__meta">${metaParts.join(' · ')}</div>` : '';

    return `
      <article class="summit-card">
        <img class="summit-card__img"
             src="${imgSrc}"
             alt="${labelText}"
             loading="lazy"
             onerror="this.onerror=null;this.src='${FALLBACK}'">
        <span class="summit-card__label">${labelText}</span>
        ${metaHtml}
      </article>
    `;
  };

  const cantonGrid = cantons.map(card).join('');
  const countryGrid = countries.map(card).join('');

  root.innerHTML = `
    ${cantons.length ? `
      <div class="summit-photos__group">
        <h3 class="subheading">Cantons</h3>
        <div class="summit-photos__grid">${cantonGrid}</div>
      </div>
    ` : ''}

    ${countries.length ? `
      <div class="summit-photos__group">
        <h3 class="subheading">Countries</h3>
        <div class="summit-photos__grid">${countryGrid}</div>
      </div>
    ` : ''}
  `;
}
``

init();
