const project = {
  totalDistanceKm: 2010.9096811404852,
  totalElevationM: 39219.78116423186,
  komootTourUrl: "https://www.komoot.com/tour/2745092627?share_token=aMSgEnqZ0U58u6BF6agh7q1F19FuaaKWmipk3lSURDSYrIxkQP&ref=wtd",
  neighboringCountries: ["Germany", "France", "Italy", "Austria", "Liechtenstein"]
};

const rides = [];

const cantonPeaks = [
  { order: 1, canton: "Schaffhausen", peak: "Schmidshau", altitudeM: 870, done: false },
  { order: 2, canton: "Aargau", peak: "Salhöhe Pass", altitudeM: 779, done: false },
  { order: 3, canton: "Basel-Stadt", peak: "St. Chrischona", altitudeM: 522, done: false },
  { order: 4, canton: "Basel-Landschaft", peak: "Waldweid Restaurant", altitudeM: 1023, done: false },
  { order: 5, canton: "Solothurn", peak: "Obergrenchenberg", altitudeM: 1358, done: false },
  { order: 6, canton: "Jura", peak: "Le point de vue", altitudeM: 1177, done: false },
  { order: 7, canton: "Neuchâtel", peak: "Chasseral", altitudeM: 1607, done: false },
  { order: 8, canton: "Geneva", peak: "Moniaz", altitudeM: 517, done: false },
  { order: 9, canton: "Fribourg", peak: "Salzmatt Bergsommer", altitudeM: 1637, done: false },
  { order: 10, canton: "Vaud", peak: "Col de Bretaye", altitudeM: 1805, done: false },
  { order: 11, canton: "Valais", peak: "Nufenen Pass", altitudeM: 2478, done: false },
  { order: 12, canton: "Ticino", peak: "Nufenen Pass", altitudeM: 2478, done: false },
  { order: 13, canton: "Uri", peak: "Furka Pass", altitudeM: 2429, done: false },
  { order: 14, canton: "Bern", peak: "Oberaar Restaurant", altitudeM: 2382, done: false },
  { order: 15, canton: "Lucerne", peak: "Glaubenberg Pass", altitudeM: 1543, done: false },
  { order: 16, canton: "Obwalden", peak: "Tannensee", altitudeM: 1976, done: false },
  { order: 17, canton: "Nidwalden", peak: "Acherli Pass", altitudeM: 1398, done: false },
  { order: 18, canton: "Glarus", peak: "Klausen Pass", altitudeM: 1300, done: false },
  { order: 19, canton: "Graubünden", peak: "Umbrail Pass", altitudeM: 2501, done: false },
  { order: 20, canton: "Appenzell Innerrhoden", peak: "Berggasthaus Scheidegg", altitudeM: 1353, done: false },
  { order: 21, canton: "Appenzell Ausserrhoden", peak: "Schwägalp Pass", altitudeM: 1299, done: false },
  { order: 22, canton: "St. Gallen", peak: "Vorder Höhi Pass", altitudeM: 1537, done: false },
  { order: 23, canton: "Schwyz", peak: "Wildspitz", altitudeM: 1580, done: false },
  { order: 24, canton: "Zug", peak: "Gottschalkenberg", altitudeM: 1164, done: false },
  { order: 25, canton: "Zürich", peak: "Alp Scheidegg", altitudeM: 1196, done: false },
  { order: 26, canton: "Thurgau", peak: "Sternenberg Pass", altitudeM: 952, done: false }
];

const passGallery = [
  {
    name: "Furka Pass",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Furkapass%20westside.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Furka_Pass"
  },
  {
    name: "Nufenen Pass",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Nufenenpass-restaurant.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Nufenen_Pass"
  },
  {
    name: "Umbrail Pass",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Umbrail.jpg",
    sourceUrl: "https://en.wikipedia.org/wiki/Umbrail_Pass"
  }
];

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function renderStats() {
  const statsHost = document.getElementById("stats");

  const completedCantons = cantonPeaks.filter((c) => c.done).length;
  const completedKm = rides.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
  const completedElevation = rides.reduce((sum, r) => sum + (r.elevationM || 0), 0);

  const countriesVisited = new Set();
  rides.forEach((ride) => (ride.countriesVisited || []).forEach((country) => countriesVisited.add(country)));

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
      label: "Countries Visited",
      value: `${countriesVisited.size} / ${project.neighboringCountries.length}`
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
        ? '<span class="complete-icon done" aria-label="Completed">✓</span>'
        : '<span class="complete-icon pending" aria-label="Not completed">✗</span>';

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

renderStats();
renderPassGallery();
renderRides();
renderCantons();
