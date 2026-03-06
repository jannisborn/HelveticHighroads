let project = null;
let rides = [];
let cantonPeaks = [];
let passGallery = [];

const dataFiles = {
  project: "./data/project.json",
  rides: "./data/rides.json",
  cantonPeaks: "./data/canton-peaks.json",
  passGallery: "./data/pass-gallery.json"
};

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

  const completedCantons = cantonPeaks.filter((c) => c.done).length;
  const completedKm = rides.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
  const completedElevation = rides.reduce((sum, r) => sum + (r.elevationM || 0), 0);

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
      value: `${countriesMentioned.size}`
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
          ${progressHtml}
        </article>
      `;
    })
    .join("");
}

function renderPassGallery() {
  const host = document.getElementById("pass-grid");

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

function showDataLoadError(message) {
  const statsHost = document.getElementById("stats");
  if (!statsHost) {
    return;
  }

  statsHost.innerHTML = `
    <article class="stat">
      <p class="stat-label">Data Load Error</p>
      <p class="stat-value">${message}</p>
    </article>
  `;
}

async function init() {
  try {
    const [projectData, ridesData, cantonPeaksData, passGalleryData] = await Promise.all([
      loadJson(dataFiles.project),
      loadJson(dataFiles.rides),
      loadJson(dataFiles.cantonPeaks),
      loadJson(dataFiles.passGallery)
    ]);

    project = projectData;
    rides = Array.isArray(ridesData) ? ridesData : [];
    cantonPeaks = Array.isArray(cantonPeaksData) ? cantonPeaksData : [];
    passGallery = Array.isArray(passGalleryData) ? passGalleryData : [];

    renderKomootMap();
    renderStats();
    renderPassGallery();
    renderRides();
    renderCantons();
  } catch (error) {
    console.error("Failed to initialize dashboard data.", error);
    showDataLoadError("Could not load data files. Start a local server and reload.");
  }
}

init();
