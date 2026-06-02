const STORAGE_KEY = "road-ledger-state-v2";
const SUPABASE_URL = "https://lzbymvbbhpqmgpggrxaj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_mEK9Y8QpniN3g62SH8CYog_ODItP59c";
const API_URL = `${SUPABASE_URL}/functions/v1/road-ledger-api`;
const BACKUP_CSV_VERSION = "1";
const BACKUP_CSV_COLUMNS = [
  "backupVersion",
  "recordType",
  "id",
  "vehicleId",
  "date",
  "currency",
  "homeCity",
  "countryCode",
  "consumptionMode",
  "theme",
  "name",
  "fuelType",
  "tankSize",
  "distanceUnit",
  "registrationNumber",
  "make",
  "yearOfManufacture",
  "monthOfFirstRegistration",
  "engineCapacity",
  "co2Emissions",
  "estimatedConsumptionLPer100km",
  "estimatedConsumptionMpgUk",
  "lookupSource",
  "odometer",
  "liters",
  "totalCost",
  "pricePerLiter",
  "station",
  "isPartial",
  "notes",
  "efficiency",
  "startOdometer",
  "endOdometer",
  "distance",
  "category",
  "litersUsed",
  "startLocation",
  "endLocation",
  "weatherLabel",
  "weatherTempC",
  "weatherWindKph",
];

const defaultState = {
  session: {
    profileId: "",
    profileKey: "",
    nickname: "",
    lastSyncedAt: "",
    syncState: "disconnected",
    syncMessage: "",
  },
  settings: {
    currency: "GBP",
    homeCity: "",
    countryCode: "",
    consumptionMode: "lPer100km",
    theme: "light",
  },
  vehicles: [],
  fillUps: [],
  trips: [],
  weatherCache: {},
};

const weatherCodes = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  95: "Thunderstorm",
};

let state = loadState();
let syncInFlight = false;
let vehicleLookupResult = null;

const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  chartGrid: document.querySelector("#chartGrid"),
  insightList: document.querySelector("#insightList"),
  vehicleForm: document.querySelector("#vehicleForm"),
  vehicleList: document.querySelector("#vehicleList"),
  plateLookupBtn: document.querySelector("#plateLookupBtn"),
  vehicleLookupStatus: document.querySelector("#vehicleLookupStatus"),
  vehicleLookupSummary: document.querySelector("#vehicleLookupSummary"),
  fillUpForm: document.querySelector("#fillUpForm"),
  fillUpTableBody: document.querySelector("#fillUpTableBody"),
  tripForm: document.querySelector("#tripForm"),
  tripTableBody: document.querySelector("#tripTableBody"),
  settingsForm: document.querySelector("#settingsForm"),
  vehicleFilter: document.querySelector("#vehicleFilter"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  weatherSummary: document.querySelector("#weatherSummary"),
  seedDemoBtn: document.querySelector("#seedDemoBtn"),
  statCardTemplate: document.querySelector("#statCardTemplate"),
  profileForm: document.querySelector("#profileForm"),
  profileNickname: document.querySelector("#profileNickname"),
  profileTitle: document.querySelector("#profileTitle"),
  profileMeta: document.querySelector("#profileMeta"),
  syncBadge: document.querySelector("#syncBadge"),
  syncNowBtn: document.querySelector("#syncNowBtn"),
  switchProfileBtn: document.querySelector("#switchProfileBtn"),
  themeToggleBtn: document.querySelector("#themeToggleBtn"),
};

void init();

async function init() {
  applyTheme();
  recomputeEfficiencies();
  bindEvents();
  syncFormsFromState();
  render();

  if (hasProfileSession()) {
    try {
      await loadRemoteState();
    } catch (error) {
      setSyncState("warn", error.message || "Could not load your saved profile.");
      render();
    }
  }

  await refreshWeatherSummary();
}

function bindEvents() {
  elements.themeToggleBtn.addEventListener("click", toggleTheme);
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.syncNowBtn.addEventListener("click", () => void syncRemoteState(true));
  elements.switchProfileBtn.addEventListener("click", handleSwitchProfile);
  elements.vehicleForm.addEventListener("submit", handleVehicleSubmit);
  elements.plateLookupBtn.addEventListener("click", () => void handlePlateLookup());
  elements.vehicleForm.registrationNumber.addEventListener("input", handleRegistrationInput);
  elements.fillUpForm.addEventListener("submit", (event) => void handleFillUpSubmit(event));
  elements.tripForm.addEventListener("submit", (event) => void handleTripSubmit(event));
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.vehicleFilter.addEventListener("change", render);
  elements.exportBtn.addEventListener("click", exportBackup);
  elements.importInput.addEventListener("change", importBackup);
  elements.seedDemoBtn.addEventListener("click", () => void seedDemoData());
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return cloneDefaultState();
    }

    return mergeState(JSON.parse(raw));
  } catch {
    return cloneDefaultState();
  }
}

function cloneDefaultState() {
  return structuredClone(defaultState);
}

function mergeState(incoming = {}) {
  return {
    ...cloneDefaultState(),
    ...incoming,
    session: { ...defaultState.session, ...(incoming.session || {}) },
    settings: { ...defaultState.settings, ...(incoming.settings || {}) },
    weatherCache: { ...defaultState.weatherCache, ...(incoming.weatherCache || {}) },
    vehicles: Array.isArray(incoming.vehicles) ? incoming.vehicles : [],
    fillUps: Array.isArray(incoming.fillUps) ? incoming.fillUps : [],
    trips: Array.isArray(incoming.trips) ? incoming.trips : [],
  };
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncFormsFromState() {
  elements.settingsForm.currency.value = state.settings.currency;
  elements.settingsForm.homeCity.value = state.settings.homeCity;
  elements.settingsForm.countryCode.value = state.settings.countryCode;
  elements.settingsForm.consumptionMode.value = state.settings.consumptionMode;
  elements.fillUpForm.date.value = getLocalDateString();
  elements.tripForm.date.value = getLocalDateString();
  elements.profileNickname.value = state.session.nickname || "";
  elements.vehicleForm.distanceUnit.value = "mi";
  elements.vehicleForm.fuelType.value = "Petrol";
  resetVehicleLookupUi();
}

function render() {
  renderVehicleOptions();
  renderProfile();
  renderVehicleList();
  renderStats();
  renderCharts();
  renderInsights();
  renderFuelTable();
  renderTripTable();
  updateFormAvailability();
}

function renderProfile() {
  const connected = hasProfileSession();
  elements.profileTitle.textContent = connected
    ? `${state.session.nickname}'s garage`
    : "Create your garage";

  if (state.session.syncState === "ok") {
    elements.syncBadge.className = "status-badge good";
    elements.syncBadge.textContent = "Synced";
  } else if (state.session.syncState === "warn") {
    elements.syncBadge.className = "status-badge warn";
    elements.syncBadge.textContent = "Needs attention";
  } else {
    elements.syncBadge.className = "status-badge muted";
    elements.syncBadge.textContent = "Not connected";
  }

  if (!connected) {
    elements.profileMeta.innerHTML =
      `<span class="meta">Pick a nickname once on this browser. We will keep the linked profile ID locally and sync your vehicles, trips, and fuel logs to Supabase.</span>${
        state.session.syncMessage ? `<span class="meta">${escapeHtml(state.session.syncMessage)}</span>` : ""
      }`;
    return;
  }

  elements.profileMeta.innerHTML = `
    <span class="meta">Connected as <strong>${escapeHtml(state.session.nickname)}</strong></span>
    <span class="meta profile-id">Profile ID: ${escapeHtml(state.session.profileId)}</span>
    <span class="meta">Last sync: ${state.session.lastSyncedAt ? escapeHtml(formatDateTime(state.session.lastSyncedAt)) : "Pending"}</span>
    ${state.session.syncMessage ? `<span class="meta">${escapeHtml(state.session.syncMessage)}</span>` : ""}
  `;
}

function renderVehicleOptions() {
  const selectedFilter = elements.vehicleFilter.value || "all";
  const selectedFuelVehicle = elements.fillUpForm.vehicleId?.value || "";
  const selectedTripVehicle = elements.tripForm.vehicleId?.value || "";
  const filterOptions = ['<option value="all">All vehicles</option>']
    .concat(
      state.vehicles.map(
        (vehicle) =>
          `<option value="${vehicle.id}">${escapeHtml(vehicle.name)}</option>`
      )
    )
    .join("");
  const vehicleOptions = state.vehicles
    .map(
      (vehicle) =>
        `<option value="${vehicle.id}">${escapeHtml(vehicle.name)}</option>`
    )
    .join("");

  elements.vehicleFilter.innerHTML = filterOptions;
  elements.vehicleFilter.value = state.vehicles.some(
    (vehicle) => vehicle.id === selectedFilter
  )
    ? selectedFilter
    : "all";

  elements.fillUpForm.vehicleId.innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';
  elements.tripForm.vehicleId.innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';

  if (state.vehicles.some((vehicle) => vehicle.id === selectedFuelVehicle)) {
    elements.fillUpForm.vehicleId.value = selectedFuelVehicle;
  }
  if (state.vehicles.some((vehicle) => vehicle.id === selectedTripVehicle)) {
    elements.tripForm.vehicleId.value = selectedTripVehicle;
  }
}

function renderVehicleList() {
  if (!state.vehicles.length) {
    elements.vehicleList.innerHTML = '<p class="empty">No vehicles yet.</p>';
    return;
  }

  elements.vehicleList.innerHTML = state.vehicles
    .map((vehicle) => {
      const tripCount = state.trips.filter((trip) => trip.vehicleId === vehicle.id).length;
      const registrationMeta = vehicle.registrationNumber
        ? ` · ${escapeHtml(formatRegistrationForDisplay(vehicle.registrationNumber))}`
        : "";
      const consumptionMeta = describeVehicleConsumption(vehicle);
      return `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(vehicle.name)}</strong>
            <span class="meta">${escapeHtml(vehicle.fuelType)} · ${vehicle.distanceUnit.toUpperCase()}${
              vehicle.tankSize ? ` · ${vehicle.tankSize}L tank` : ""
            }${registrationMeta}</span>
            ${consumptionMeta ? `<span class="meta">${escapeHtml(consumptionMeta)}</span>` : ""}
          </div>
          <span class="chip">${countVehicleEntries(vehicle.id)} fill-ups · ${tripCount} trips</span>
        </div>
      `;
    })
    .join("");
}

function renderStats() {
  const filteredFillUps = getFilteredFillUps();
  const filteredTrips = getFilteredTrips();
  const totals = summarizeEntries(filteredFillUps, filteredTrips);
  const stats = [
    {
      label: "Total spend",
      value: formatCurrency(totals.totalSpend),
      meta: `${filteredFillUps.length} fill-ups · ${filteredTrips.length} trips`,
    },
    {
      label: "Fuel purchased",
      value: `${formatNumber(totals.totalLiters, 1)} L`,
      meta: `${formatCurrency(totals.averagePricePerLiter)}/L average`,
    },
    {
      label: "Trip distance",
      value: formatDistance(totals.tripDistance, totals.distanceUnit),
      meta: filteredTrips.length
        ? `${formatDistance(totals.averageTripDistance, totals.distanceUnit)} average`
        : "No trips yet",
    },
    {
      label: "Average efficiency",
      value: totals.averageEfficiencyLabel,
      meta: totals.bestEfficiencyLabel
        ? `Best ${totals.bestEfficiencyLabel}`
        : "Add two full fill-ups to calculate",
    },
    {
      label: "Trip fuel use",
      value: totals.tripEfficiencyLabel,
      meta: totals.tripLiters ? `${formatNumber(totals.tripLiters, 1)} L logged` : "Optional in trip form",
    },
    {
      label: "Average trip cost",
      value: formatCurrency(totals.averageTripCost),
      meta: filteredTrips.length ? "Across extra trip costs" : "Add tolls, parking, or fees",
    },
  ];

  elements.statsGrid.innerHTML = "";
  for (const stat of stats) {
    const node = elements.statCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = stat.label;
    node.querySelector(".stat-value").textContent = stat.value;
    node.querySelector(".stat-meta").textContent = stat.meta;
    elements.statsGrid.append(node);
  }
}

function renderCharts() {
  const fillUps = getFilteredFillUps();
  const trips = getFilteredTrips();
  const fillUpVehicleUnit = getCurrentFilterUnit(fillUps);
  const tripVehicleUnit = getCurrentFilterUnitFromTrips(trips);
  const efficiencyValues = fillUps
    .filter((entry) => Number.isFinite(entry.efficiency))
    .map((entry) =>
      normalizeEfficiency(
        entry.efficiency,
        getVehicleById(entry.vehicleId)?.distanceUnit || fillUpVehicleUnit
      )
    );
  const priceValues = fillUps
    .map((entry) => entry.pricePerLiter)
    .filter((value) => Number.isFinite(value));
  const monthlySpendSeries = buildMonthlySpendSeries(fillUps, trips);
  const monthlySpendValues = monthlySpendSeries.map((item) => item.value);
  const tripDistanceValues = trips
    .map((trip) => normalizeTripDistance(trip, tripVehicleUnit))
    .filter((value) => Number.isFinite(value));

  const chartCards = [
    renderChartCard(
      "Efficiency",
      state.settings.consumptionMode.toUpperCase(),
      buildEfficiencyMetrics(efficiencyValues),
      renderLineChart(efficiencyValues, "var(--accent)", {
        yFormatter: (value) => formatAxisNumber(value, 1),
        xStartLabel: "Start",
        xEndLabel: "Now",
      })
    ),
    renderChartCard(
      "Fuel price trend",
      "Price per litre",
      buildPriceMetrics(priceValues),
      renderLineChart(priceValues, "var(--sky)", {
        yFormatter: (value) => formatCurrency(value),
        xStartLabel: "Start",
        xEndLabel: "Now",
      })
    ),
    renderChartCard(
      "Monthly spend",
      "Fuel + trip extras",
      buildMonthlySpendMetrics(monthlySpendValues),
      renderBarChart(monthlySpendValues, "var(--sage)", {
        yFormatter: (value) => formatCurrency(value),
        xStartLabel: monthlySpendSeries[0]?.label || "Start",
        xEndLabel: monthlySpendSeries.at(-1)?.label || "Now",
      })
    ),
    renderChartCard(
      "Trip distance",
      tripVehicleUnit === "mi" ? "Miles per trip" : "Kilometres per trip",
      buildTripDistanceMetrics(tripDistanceValues, tripVehicleUnit),
      renderBarChart(tripDistanceValues, "var(--warn)", {
        yFormatter: (value) => formatAxisDistance(value, tripVehicleUnit),
        xStartLabel: "Start",
        xEndLabel: "Now",
      })
    ),
  ];

  elements.chartGrid.innerHTML = chartCards.join("");
}

function renderChartCard(title, meta, metrics, surface) {
  return `
    <article class="chart-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="chart-meta">${escapeHtml(meta)}</div>
      <div class="chart-metrics">${renderChartMetrics(metrics)}</div>
      <div class="chart-surface">${surface}</div>
    </article>
  `;
}

function renderChartMetrics(metrics) {
  if (!metrics.length) {
    return '<p class="empty">Metrics appear as you log more data.</p>';
  }

  return metrics
    .map(
      (metric) => `
        <div class="chart-metric">
          <span class="chart-metric-label">${escapeHtml(metric.label)}</span>
          <strong class="chart-metric-value">${escapeHtml(metric.value)}</strong>
        </div>
      `
    )
    .join("");
}

function buildEfficiencyMetrics(values) {
  if (!values.length) {
    return [];
  }

  const latest = values.at(-1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const best = Math.max(...values);

  return [
    {
      label: "Latest",
      value: formatEfficiencyFromNormalized(latest, state.settings.consumptionMode),
    },
    {
      label: "Average",
      value: formatEfficiencyFromNormalized(average, state.settings.consumptionMode),
    },
    {
      label: "Best",
      value: formatEfficiencyFromNormalized(best, state.settings.consumptionMode),
    },
  ];
}

function buildPriceMetrics(values) {
  if (!values.length) {
    return [];
  }

  const latest = values.at(-1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const highest = Math.max(...values);

  return [
    {
      label: "Latest",
      value: `${formatCurrency(latest)}/L`,
    },
    {
      label: "Average",
      value: `${formatCurrency(average)}/L`,
    },
    {
      label: "Peak",
      value: `${formatCurrency(highest)}/L`,
    },
  ];
}

function buildMonthlySpendMetrics(values) {
  if (!values.length) {
    return [];
  }

  const latest = values.at(-1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const highest = Math.max(...values);

  return [
    {
      label: "Latest month",
      value: formatCurrency(latest),
    },
    {
      label: "Monthly avg",
      value: formatCurrency(average),
    },
    {
      label: "Peak month",
      value: formatCurrency(highest),
    },
  ];
}

function buildTripDistanceMetrics(values, unit) {
  if (!values.length) {
    return [];
  }

  const latest = values.at(-1);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const longest = Math.max(...values);

  return [
    {
      label: "Latest trip",
      value: formatDistance(latest, unit),
    },
    {
      label: "Average",
      value: formatDistance(average, unit),
    },
    {
      label: "Longest",
      value: formatDistance(longest, unit),
    },
  ];
}

function renderLineChart(values, color, options = {}) {
  if (values.length < 2) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = min + (max - min) / 2;
  const yFormatter = options.yFormatter || ((value) => formatNumber(value, 1));
  const points = values
    .map((value, index) => {
      const x = 32 + (index / Math.max(values.length - 1, 1)) * 118;
      const y = 74 - ((value - min) / Math.max(max - min, 1)) * 54;
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${renderChartAxes({
        minLabel: yFormatter(min),
        midLabel: yFormatter(mid),
        maxLabel: yFormatter(max),
        xStartLabel: options.xStartLabel || "1",
        xEndLabel: options.xEndLabel || String(values.length),
      })}
      <polyline
        fill="none"
        stroke="${color}33"
        stroke-width="8"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
      <polyline
        fill="none"
        stroke="${color}"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
    </svg>
  `;
}

function renderBarChart(values, color, options = {}) {
  if (!values.length) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const max = Math.max(...values, 1);
  const mid = max / 2;
  const yFormatter = options.yFormatter || ((value) => formatNumber(value, 1));
  const bars = values
    .slice(-8)
    .map((value, index, series) => {
      const barWidth = 112 / series.length;
      const x = 34 + index * barWidth;
      const height = (value / max) * 58;
      return `<rect x="${x}" y="${86 - height}" width="${Math.max(barWidth - 2, 4)}" height="${height}" rx="3" fill="${color}" opacity="0.86" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${renderChartAxes({
        minLabel: yFormatter(0),
        midLabel: yFormatter(mid),
        maxLabel: yFormatter(max),
        xStartLabel: options.xStartLabel || "1",
        xEndLabel: options.xEndLabel || String(values.length),
      })}
      ${bars}
    </svg>
  `;
}

function renderChartAxes({ minLabel, midLabel, maxLabel, xStartLabel, xEndLabel }) {
  return `
    <g class="chart-axis-group">
      <line x1="30" y1="74" x2="150" y2="74" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="30" y1="48" x2="150" y2="48" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="30" y1="22" x2="150" y2="22" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="30" y1="74" x2="150" y2="74" stroke="var(--chart-axis)" stroke-width="1" />
      <text x="26" y="76" text-anchor="end" class="chart-axis-text">${escapeHtml(minLabel)}</text>
      <text x="26" y="50" text-anchor="end" class="chart-axis-text">${escapeHtml(midLabel)}</text>
      <text x="26" y="24" text-anchor="end" class="chart-axis-text">${escapeHtml(maxLabel)}</text>
      <text x="30" y="92" class="chart-axis-text">${escapeHtml(xStartLabel)}</text>
      <text x="150" y="92" text-anchor="end" class="chart-axis-text">${escapeHtml(xEndLabel)}</text>
    </g>
  `;
}

function renderInsights() {
  const fillUps = getFilteredFillUps();
  const trips = getFilteredTrips();
  const recentFill = fillUps.at(-1);
  const recentTrip = trips.at(-1);
  const fillDistance = recentFill
    ? computeEntryMetrics(recentFill, getVehicleById(recentFill.vehicleId)).distanceLabel
    : "No fill-ups yet";

  const items = [
    {
      title: "Monthly burn",
      body: formatCurrency(projectMonthlySpend(fillUps, trips)),
    },
    {
      title: "Latest fill-up",
      body: recentFill
        ? `${formatCurrency(recentFill.totalCost)} · ${fillDistance}`
        : "No fill-ups yet",
    },
    {
      title: "Latest trip",
      body: recentTrip
        ? `${formatDistance(recentTrip.distance, getVehicleById(recentTrip.vehicleId)?.distanceUnit || "km")} · ${escapeHtml(recentTrip.category || "Uncategorised")}`
        : "No trips yet",
    },
  ];

  elements.insightList.innerHTML = items
    .map(
      (item) => `
        <div class="insight">
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </div>
      `
    )
    .join("");
}

function renderFuelTable() {
  const entries = [...getFilteredFillUps()].sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) {
    elements.fillUpTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No fill-ups yet. Add your first stop above.</td></tr>';
    return;
  }

  elements.fillUpTableBody.innerHTML = entries
    .map((entry) => {
      const vehicle = getVehicleById(entry.vehicleId);
      const metrics = computeEntryMetrics(entry, vehicle);
      return `
        <tr>
          <td>${entry.date}</td>
          <td><strong>${escapeHtml(vehicle?.name || "Unknown vehicle")}</strong><span class="meta">${escapeHtml(entry.station || "No station")}</span></td>
          <td>${metrics.distanceLabel}</td>
          <td>${formatNumber(entry.liters, 2)} L</td>
          <td>${formatCurrency(entry.totalCost)}</td>
          <td>${metrics.efficiencyLabel}</td>
          <td>${formatWeather(entry.weather)}</td>
          <td><button class="danger-link" data-delete-fillup="${entry.id}" type="button">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  for (const button of elements.fillUpTableBody.querySelectorAll("[data-delete-fillup]")) {
    button.addEventListener("click", () => void deleteFillUp(button.dataset.deleteFillup));
  }
}

function renderTripTable() {
  const trips = [...getFilteredTrips()].sort((a, b) => b.date.localeCompare(a.date));
  if (!trips.length) {
    elements.tripTableBody.innerHTML =
      '<tr><td colspan="8" class="empty">No trips yet. Add your first trip above.</td></tr>';
    return;
  }

  elements.tripTableBody.innerHTML = trips
    .map((trip) => {
      const vehicle = getVehicleById(trip.vehicleId);
      return `
        <tr>
          <td>${trip.date}</td>
          <td><strong>${escapeHtml(vehicle?.name || "Unknown vehicle")}</strong><span class="meta">${escapeHtml(trip.startLocation || "Unknown start")} → ${escapeHtml(trip.endLocation || "Unknown end")}</span></td>
          <td>${formatDistance(trip.distance, vehicle?.distanceUnit || "km")}</td>
          <td>${escapeHtml(trip.category || "Uncategorised")}</td>
          <td>${formatCurrency(trip.totalCost || 0)}</td>
          <td>${formatTripEfficiency(trip, vehicle?.distanceUnit || "km")}</td>
          <td>${formatWeather(trip.weather)}</td>
          <td><button class="danger-link" data-delete-trip="${trip.id}" type="button">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  for (const button of elements.tripTableBody.querySelectorAll("[data-delete-trip]")) {
    button.addEventListener("click", () => void deleteTrip(button.dataset.deleteTrip));
  }
}

function updateFormAvailability() {
  const enabled = hasProfileSession();
  setFormInteractive(elements.vehicleForm, enabled);
  setFormInteractive(elements.fillUpForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.tripForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.settingsForm, enabled);
  elements.syncNowBtn.disabled = !enabled || syncInFlight;
  elements.switchProfileBtn.disabled = !enabled;
  elements.profileNickname.disabled = enabled || syncInFlight;
  elements.profileForm.querySelector("button").disabled = enabled || syncInFlight;
}

function setFormInteractive(form, enabled) {
  for (const field of form.querySelectorAll("input, select, textarea, button")) {
    field.disabled = !enabled;
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const nickname = elements.profileNickname.value.trim();
  if (!nickname) {
    return;
  }

  setSyncState("warn", "Connecting profile...");
  render();
  try {
    const response = await callApi("bootstrap", { nickname });
    applyRemoteResponse(response);
    setSyncState("ok", "Profile connected.");
    render();
    await refreshWeatherSummary();
  } catch (error) {
    setSyncState("warn", error.message || "Could not connect profile.");
    render();
  }
}

function handleSwitchProfile() {
  if (!hasProfileSession()) {
    return;
  }

  const confirmed = window.confirm(
    "Switching profiles clears the saved local link on this browser. Your Supabase data stays intact."
  );
  if (!confirmed) {
    return;
  }

  state = cloneDefaultState();
  saveLocalState();
  syncFormsFromState();
  render();
  void refreshWeatherSummary();
}

function handleRegistrationInput(event) {
  const registrationNumber = normalizeRegistration(event.target.value);
  event.target.value = formatRegistrationForDisplay(registrationNumber);
  if (
    vehicleLookupResult &&
    vehicleLookupResult.registrationNumber !== registrationNumber
  ) {
    vehicleLookupResult = null;
    setVehicleLookupStatus(
      "empty",
      "Registration changed. Run the plate lookup again to refresh the DVLA match."
    );
    renderVehicleLookupSummary(null);
  }
}

async function handlePlateLookup() {
  if (!requireProfile()) {
    return;
  }

  const registrationNumber = normalizeRegistration(
    elements.vehicleForm.registrationNumber.value
  );
  if (!registrationNumber) {
    setVehicleLookupStatus("warn", "Enter a UK number plate before looking it up.");
    renderVehicleLookupSummary(null);
    return;
  }

  setVehicleLookupStatus("empty", "Looking up DVLA vehicle details...");
  renderVehicleLookupSummary(null);
  elements.plateLookupBtn.disabled = true;

  try {
    const response = await callApi("lookupVehicle", { registrationNumber });
    vehicleLookupResult = response.vehicle;
    applyLookupToVehicleForm(vehicleLookupResult);
    setVehicleLookupStatus(
      "good",
      vehicleLookupResult.estimatedConsumption
        ? "DVLA match found. Consumption has been estimated from the vehicle's CO2 record."
        : "DVLA match found. Fuel type was filled in, but consumption could not be estimated automatically."
    );
    renderVehicleLookupSummary(vehicleLookupResult);
  } catch (error) {
    vehicleLookupResult = null;
    setVehicleLookupStatus("warn", error.message || "Could not look up that registration.");
    renderVehicleLookupSummary(null);
  } finally {
    elements.plateLookupBtn.disabled = false;
  }
}

function applyLookupToVehicleForm(vehicle) {
  const registrationNumber = formatRegistrationForDisplay(vehicle.registrationNumber);
  const year = vehicle.yearOfManufacture || vehicle.monthOfFirstRegistration?.slice(0, 4) || "";
  const make = toTitleCase(vehicle.make || "");
  const currentName = elements.vehicleForm.name.value.trim();
  const shouldReplaceName =
    !currentName || currentName === elements.vehicleForm.name.defaultValue;

  elements.vehicleForm.registrationNumber.value = registrationNumber;
  elements.vehicleForm.fuelType.value = mapFuelTypeForForm(vehicle.fuelType);
  elements.vehicleForm.distanceUnit.value = "mi";

  if (shouldReplaceName) {
    elements.vehicleForm.name.value = [year, make].filter(Boolean).join(" ") || registrationNumber;
  }
}

function resetVehicleLookupUi() {
  vehicleLookupResult = null;
  elements.vehicleForm.registrationNumber.value = "";
  setVehicleLookupStatus(
    "empty",
    "Enter a UK number plate to prefill fuel type and estimate consumption."
  );
  renderVehicleLookupSummary(null);
}

function setVehicleLookupStatus(level, message) {
  elements.vehicleLookupStatus.className = `lookup-status${level === "empty" ? " empty" : ` ${level}`}`;
  elements.vehicleLookupStatus.textContent = message;
}

function renderVehicleLookupSummary(vehicle) {
  if (!vehicle) {
    elements.vehicleLookupSummary.hidden = true;
    elements.vehicleLookupSummary.innerHTML = "";
    return;
  }

  const summaryLines = [
    vehicle.yearOfManufacture
      ? `${vehicle.yearOfManufacture} ${toTitleCase(vehicle.make || "")}`.trim()
      : toTitleCase(vehicle.make || ""),
    vehicle.engineCapacity ? `${vehicle.engineCapacity} cc` : "",
    vehicle.co2Emissions ? `${vehicle.co2Emissions} g/km CO2` : "",
    vehicle.fuelType ? toTitleCase(vehicle.fuelType) : "",
  ].filter(Boolean);
  const estimated = vehicle.estimatedConsumption
    ? `${vehicle.estimatedConsumption.lPer100km.toFixed(1)} L/100km · ${vehicle.estimatedConsumption.mpgUk.toFixed(1)} mpg UK`
    : "No automatic consumption estimate was available for this fuel type.";

  elements.vehicleLookupSummary.hidden = false;
  elements.vehicleLookupSummary.innerHTML = `
    <strong>${escapeHtml(formatRegistrationForDisplay(vehicle.registrationNumber))}</strong>
    <span class="meta">${escapeHtml(summaryLines.join(" · "))}</span>
    <span class="meta">${escapeHtml(estimated)}</span>
    <span class="meta">Source: DVLA vehicle data${vehicle.estimatedConsumption ? " with consumption estimated from CO2." : "."}</span>
  `;
}

function handleVehicleSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const registrationNumber = normalizeRegistration(formData.get("registrationNumber"));
  const lookupForVehicle =
    vehicleLookupResult &&
    vehicleLookupResult.registrationNumber === registrationNumber
      ? vehicleLookupResult
      : null;

  state.vehicles.push({
    id: crypto.randomUUID(),
    name: formData.get("name").toString().trim(),
    fuelType: formData.get("fuelType").toString(),
    tankSize: numberOrNull(formData.get("tankSize")),
    distanceUnit: formData.get("distanceUnit").toString(),
    registrationNumber,
    make: lookupForVehicle?.make || "",
    yearOfManufacture: lookupForVehicle?.yearOfManufacture || null,
    monthOfFirstRegistration: lookupForVehicle?.monthOfFirstRegistration || "",
    engineCapacity: lookupForVehicle?.engineCapacity ?? null,
    co2Emissions: lookupForVehicle?.co2Emissions ?? null,
    estimatedConsumption:
      lookupForVehicle?.estimatedConsumption || null,
    lookupSource: lookupForVehicle?.lookupSource || null,
  });

  event.currentTarget.reset();
  event.currentTarget.distanceUnit.value = "mi";
  event.currentTarget.fuelType.value = "Petrol";
  resetVehicleLookupUi();
  persistAndRender();
  void syncRemoteState();
}

async function handleFillUpSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }
  if (!state.vehicles.length) {
    alert("Add a vehicle first.");
    return;
  }

  const formData = new FormData(event.currentTarget);
  const liters = Number(formData.get("liters"));
  const totalCost = Number(formData.get("totalCost"));
  const vehicleId = formData.get("vehicleId").toString();
  const vehicle = getVehicleById(vehicleId);
  const fillUp = {
    id: crypto.randomUUID(),
    vehicleId,
    date: formData.get("date").toString(),
    odometer: Number(formData.get("odometer")),
    liters,
    totalCost,
    pricePerLiter: numberOrNull(formData.get("pricePerLiter")) ?? totalCost / liters,
    station: formData.get("station").toString().trim(),
    isPartial: formData.get("isPartial").toString() === "true",
    notes: formData.get("notes").toString().trim(),
    weather: await fetchWeatherForDate(formData.get("date").toString()),
  };

  fillUp.efficiency = computeEfficiencyForNewFillUp(fillUp);
  state.fillUps.push(fillUp);
  recomputeEfficiencies();

  event.currentTarget.reset();
  event.currentTarget.date.value = getLocalDateString();
  if (vehicle) {
    event.currentTarget.vehicleId.value = vehicle.id;
  }
  persistAndRender();
  await syncRemoteState();
  await refreshWeatherSummary();
}

async function handleTripSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }
  if (!state.vehicles.length) {
    alert("Add a vehicle first.");
    return;
  }

  const formData = new FormData(event.currentTarget);
  const vehicleId = formData.get("vehicleId").toString();
  const vehicle = getVehicleById(vehicleId);
  const startOdometer = Number(formData.get("startOdometer"));
  const endOdometer = Number(formData.get("endOdometer"));
  const distance = endOdometer - startOdometer;
  if (distance <= 0) {
    alert("Trip end odometer must be greater than the start odometer.");
    return;
  }

  state.trips.push({
    id: crypto.randomUUID(),
    vehicleId,
    date: formData.get("date").toString(),
    startOdometer,
    endOdometer,
    distance,
    category: formData.get("category").toString().trim(),
    totalCost: numberOrNull(formData.get("totalCost")) ?? 0,
    litersUsed: numberOrNull(formData.get("litersUsed")),
    startLocation: formData.get("startLocation").toString().trim(),
    endLocation: formData.get("endLocation").toString().trim(),
    notes: formData.get("notes").toString().trim(),
    weather: await fetchWeatherForDate(formData.get("date").toString()),
  });

  event.currentTarget.reset();
  event.currentTarget.date.value = getLocalDateString();
  if (vehicle) {
    event.currentTarget.vehicleId.value = vehicle.id;
  }
  persistAndRender();
  await syncRemoteState();
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  state.settings = {
    currency: formData.get("currency").toString().trim().toUpperCase() || "GBP",
    homeCity: formData.get("homeCity").toString().trim(),
    countryCode: formData.get("countryCode").toString().trim().toUpperCase(),
    consumptionMode: formData.get("consumptionMode").toString(),
    theme: state.settings.theme || "light",
  };

  applyTheme();
  persistAndRender();
  void syncRemoteState();
  void refreshWeatherSummary();
}

async function deleteFillUp(entryId) {
  state.fillUps = state.fillUps.filter((entry) => entry.id !== entryId);
  recomputeEfficiencies();
  persistAndRender();
  await syncRemoteState();
}

async function deleteTrip(entryId) {
  state.trips = state.trips.filter((trip) => trip.id !== entryId);
  persistAndRender();
  await syncRemoteState();
}

function exportBackup() {
  const blob = new Blob([buildBackupCsv()], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `road-ledger-backup-${getLocalDateString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function importBackup(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importBackupCsv(reader.result);
      recomputeEfficiencies();
      saveLocalState();
      applyTheme();
      syncFormsFromState();
      render();
      void syncRemoteState();
      void refreshWeatherSummary();
    } catch (error) {
      console.error("CSV import failed", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "That CSV backup file could not be read.";
      alert(`CSV import failed: ${message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function buildBackupCsv() {
  const rows = [
    {
      backupVersion: BACKUP_CSV_VERSION,
      recordType: "settings",
      currency: state.settings.currency,
      homeCity: state.settings.homeCity,
      countryCode: state.settings.countryCode,
      consumptionMode: state.settings.consumptionMode,
      theme: state.settings.theme,
    },
    ...state.vehicles.map((vehicle) => ({
      backupVersion: BACKUP_CSV_VERSION,
      recordType: "vehicle",
      id: vehicle.id,
      name: vehicle.name,
      fuelType: vehicle.fuelType,
      tankSize: vehicle.tankSize,
      distanceUnit: vehicle.distanceUnit,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      yearOfManufacture: vehicle.yearOfManufacture,
      monthOfFirstRegistration: vehicle.monthOfFirstRegistration,
      engineCapacity: vehicle.engineCapacity,
      co2Emissions: vehicle.co2Emissions,
      estimatedConsumptionLPer100km: vehicle.estimatedConsumption?.lPer100km,
      estimatedConsumptionMpgUk: vehicle.estimatedConsumption?.mpgUk,
      lookupSource: vehicle.lookupSource,
    })),
    ...state.fillUps.map((entry) => ({
      backupVersion: BACKUP_CSV_VERSION,
      recordType: "fillUp",
      id: entry.id,
      vehicleId: entry.vehicleId,
      date: entry.date,
      odometer: entry.odometer,
      liters: entry.liters,
      totalCost: entry.totalCost,
      pricePerLiter: entry.pricePerLiter,
      station: entry.station,
      isPartial: entry.isPartial,
      notes: entry.notes,
      efficiency: entry.efficiency,
      weatherLabel: entry.weather?.label,
      weatherTempC: entry.weather?.tempC,
      weatherWindKph: entry.weather?.windKph,
    })),
    ...state.trips.map((trip) => ({
      backupVersion: BACKUP_CSV_VERSION,
      recordType: "trip",
      id: trip.id,
      vehicleId: trip.vehicleId,
      date: trip.date,
      startOdometer: trip.startOdometer,
      endOdometer: trip.endOdometer,
      distance: trip.distance,
      category: trip.category,
      totalCost: trip.totalCost,
      litersUsed: trip.litersUsed,
      startLocation: trip.startLocation,
      endLocation: trip.endLocation,
      notes: trip.notes,
      weatherLabel: trip.weather?.label,
      weatherTempC: trip.weather?.tempC,
      weatherWindKph: trip.weather?.windKph,
    })),
  ];

  return serializeCsvRows(rows, BACKUP_CSV_COLUMNS);
}

function importBackupCsv(csvText) {
  const normalizedCsvText = String(csvText).replace(/^\uFEFF/, "");
  const rows = parseCsvRows(normalizedCsvText);
  const knownRecordTypes = new Set(["settings", "vehicle", "fillUp", "trip"]);
  if (!rows.length) {
    throw new Error("Empty backup.");
  }

  if (rows.some((row) => knownRecordTypes.has(row.recordType))) {
    return importRoadLedgerRows(rows);
  }

  return importFuelioCsv(normalizedCsvText);
}

function importRoadLedgerRows(rows) {
  const imported = {
    session: { ...state.session },
    settings: { ...defaultState.settings },
    vehicles: [],
    fillUps: [],
    trips: [],
    weatherCache: {},
  };

  for (const row of rows) {
    switch (row.recordType) {
      case "settings":
        imported.settings = {
          currency: row.currency || defaultState.settings.currency,
          homeCity: row.homeCity || "",
          countryCode: row.countryCode || "",
          consumptionMode: row.consumptionMode || defaultState.settings.consumptionMode,
          theme: row.theme === "dark" ? "dark" : "light",
        };
        break;
      case "vehicle":
        imported.vehicles.push({
          id: row.id || crypto.randomUUID(),
          name: row.name || "Imported vehicle",
          fuelType: row.fuelType || "Petrol",
          tankSize: parseNullableNumber(row.tankSize),
          distanceUnit: row.distanceUnit === "mi" ? "mi" : "km",
          registrationNumber: row.registrationNumber || "",
          make: row.make || "",
          yearOfManufacture: parseNullableNumber(row.yearOfManufacture),
          monthOfFirstRegistration: row.monthOfFirstRegistration || "",
          engineCapacity: parseNullableNumber(row.engineCapacity),
          co2Emissions: parseNullableNumber(row.co2Emissions),
          estimatedConsumption: buildEstimatedConsumption(row),
          lookupSource: row.lookupSource || null,
        });
        break;
      case "fillUp":
        {
          const liters = parseNumberOrZero(row.liters);
          const totalCost = parseNumberOrZero(row.totalCost);
          const importedPricePerLiter = parseNullableNumber(row.pricePerLiter);
          imported.fillUps.push({
            id: row.id || crypto.randomUUID(),
            vehicleId: row.vehicleId || "",
            date: row.date || "",
            odometer: parseNumberOrZero(row.odometer),
            liters,
            totalCost,
            pricePerLiter: importedPricePerLiter ?? (liters ? totalCost / liters : 0),
            station: row.station || "",
            isPartial: parseBooleanCell(row.isPartial),
            notes: row.notes || "",
            efficiency: parseNullableNumber(row.efficiency),
            weather: buildWeatherSnapshot(row),
          });
        }
        break;
      case "trip":
        {
          const startOdometer = parseNumberOrZero(row.startOdometer);
          const endOdometer = parseNumberOrZero(row.endOdometer);
          const importedDistance = parseNullableNumber(row.distance);
          imported.trips.push({
            id: row.id || crypto.randomUUID(),
            vehicleId: row.vehicleId || "",
            date: row.date || "",
            startOdometer,
            endOdometer,
            distance: importedDistance ?? Math.max(endOdometer - startOdometer, 0),
            category: row.category || "",
            totalCost: parseNumberOrZero(row.totalCost),
            litersUsed: parseNullableNumber(row.litersUsed),
            startLocation: row.startLocation || "",
            endLocation: row.endLocation || "",
            notes: row.notes || "",
            weather: buildWeatherSnapshot(row),
          });
        }
        break;
      default:
        break;
    }
  }

  if (
    !rows.length ||
    !rows.some((row) =>
      ["settings", "vehicle", "fillUp", "trip"].includes(row.recordType)
    )
  ) {
    throw new Error("Empty backup.");
  }

  return mergeState(imported);
}

function importFuelioCsv(csvText) {
  const sections = parseFuelioSections(csvText);
  const vehicleRows = sections.Vehicle || [];
  const logRows = sections.Log || [];

  if (!vehicleRows.length || !logRows.length) {
    throw new Error("Unsupported CSV format.");
  }

  const vehicles = vehicleRows.map((row, index) => {
    const distanceUnit = parseFuelioDistanceUnit(row.DistUnit);
    const fuelType = parseFuelioFuelType(row.Tank1Type);
    return {
      id: crypto.randomUUID(),
      name: row.Name || row.Make || `Imported vehicle ${index + 1}`,
      fuelType,
      tankSize: parseNullableNumber(row.Tank1Capacity),
      distanceUnit,
      registrationNumber: row.Plate || "",
      make: row.Make || "",
      yearOfManufacture: parseNullableNumber(row.Year),
      monthOfFirstRegistration: "",
      engineCapacity: null,
      co2Emissions: null,
      estimatedConsumption: null,
      lookupSource: "fuelio",
    };
  });

  const primaryVehicle =
    vehicles[vehicleRows.findIndex((row) => row.Active === "1")] || vehicles[0];
  const odometerColumn = findFuelioColumn(logRows[0], "Odo");
  const litersColumn = findFuelioColumn(logRows[0], "Fuel");
  const imported = {
    session: { ...state.session },
    settings: {
      ...defaultState.settings,
      consumptionMode: primaryVehicle?.distanceUnit === "mi" ? "mpgUk" : "lPer100km",
    },
    vehicles,
    fillUps: logRows.map((row) => {
      const liters = parseNumberOrZero(row[litersColumn]);
      const totalCost = parseNumberOrZero(row.Price);
      const pricePerLiter = parseNullableNumber(row.VolumePrice);
      return {
        id: row.UniqueId ? `fuelio-${row.UniqueId}` : crypto.randomUUID(),
        vehicleId: primaryVehicle?.id || "",
        date: row.Date || "",
        odometer: parseNumberOrZero(row[odometerColumn]),
        liters,
        totalCost,
        pricePerLiter: pricePerLiter ?? (liters ? totalCost / liters : 0),
        station: row.City || "",
        isPartial: !parseFuelioBoolean(row.Full),
        notes: row.Notes || "",
        efficiency: parseNullableNumber(row.mpg),
        weather: null,
      };
    }),
    trips: [],
    weatherCache: {},
  };

  return mergeState(imported);
}

function parseFuelioSections(csvText) {
  const table = parseCsvTable(csvText);
  const sections = {};
  let currentSection = "";
  let header = null;

  for (const row of table) {
    const firstCell = row[0] || "";
    if (firstCell.startsWith("## ")) {
      currentSection = firstCell.slice(3).trim();
      header = null;
      continue;
    }

    if (!currentSection || !row.some((cell) => cell !== "")) {
      continue;
    }

    if (!header) {
      header = row;
      sections[currentSection] = [];
      continue;
    }

    sections[currentSection].push(
      Object.fromEntries(header.map((column, index) => [column, row[index] ?? ""]))
    );
  }

  return sections;
}

function parseFuelioDistanceUnit(value) {
  return String(value) === "1" ? "mi" : "km";
}

function parseFuelioFuelType(value) {
  const fuelTypeMap = {
    0: "Petrol",
    100: "Petrol",
    101: "Diesel",
    102: "LPG",
    103: "CNG",
    104: "Ethanol",
    105: "Electric",
    106: "Hybrid",
  };
  return fuelTypeMap[Number(value)] || "Petrol";
}

function parseFuelioBoolean(value) {
  return value === "1" || String(value).toLowerCase() === "true";
}

function findFuelioColumn(row, prefix) {
  const key = Object.keys(row).find((column) => column.startsWith(prefix));
  if (!key) {
    throw new Error(`Missing ${prefix} column.`);
  }
  return key;
}

function buildEstimatedConsumption(row) {
  const lPer100km = parseNullableNumber(row.estimatedConsumptionLPer100km);
  const mpgUk = parseNullableNumber(row.estimatedConsumptionMpgUk);
  if (lPer100km === null && mpgUk === null) {
    return null;
  }
  return { lPer100km, mpgUk };
}

function buildWeatherSnapshot(row) {
  if (!row.weatherLabel && row.weatherTempC === "" && row.weatherWindKph === "") {
    return null;
  }
  return {
    label: row.weatherLabel || "",
    tempC: parseNullableNumber(row.weatherTempC),
    windKph: parseNullableNumber(row.weatherWindKph),
  };
}

function serializeCsvRows(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(row[column])).join(","));
  }
  return lines.join("\n");
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value);
  if (/["\n,]/.test(normalized)) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }
  return normalized;
}

function parseCsvRows(csvText) {
  const table = parseCsvTable(String(csvText).replace(/^\uFEFF/, ""));
  if (!table.length) {
    return [];
  }

  const [header, ...dataRows] = table;
  return dataRows
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) =>
      Object.fromEntries(
        header.map((column, index) => [column, row[index] ?? ""])
      )
    );
}

function parseCsvTable(csvText) {
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];

    if (insideQuotes) {
      if (char === '"') {
        if (csvText[index + 1] === '"') {
          currentCell += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentCell += char;
  }

  if (insideQuotes) {
    throw new Error("Unclosed quoted field.");
  }

  if (currentCell !== "" || currentRow.length) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseNullableNumber(value) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberOrZero(value) {
  return parseNullableNumber(value) ?? 0;
}

function parseBooleanCell(value) {
  return String(value).toLowerCase() === "true";
}

async function seedDemoData() {
  if (!requireProfile()) {
    return;
  }

  const confirmed =
    !state.vehicles.length && !state.fillUps.length && !state.trips.length
      ? true
      : window.confirm("This replaces the current saved garage with demo data.");
  if (!confirmed) {
    return;
  }

  const vehicleId = crypto.randomUUID();
  state.settings = {
    currency: "GBP",
    homeCity: "London",
    countryCode: "GB",
    consumptionMode: "lPer100km",
    theme: state.settings.theme || "light",
  };
  state.vehicles = [
    {
      id: vehicleId,
      name: "2018 Ford Fiesta",
      fuelType: "Petrol",
      tankSize: 42,
      distanceUnit: "mi",
    },
  ];
  state.fillUps = [
    makeDemoFillUp(vehicleId, "2026-05-04", 24010, 36.2, 54.55, "Shell Camden", false, {
      tempC: 13,
      label: "Light rain",
    }),
    makeDemoFillUp(vehicleId, "2026-05-15", 24392, 34.6, 52.11, "Tesco Brent Cross", false, {
      tempC: 17,
      label: "Clear",
    }),
    makeDemoFillUp(vehicleId, "2026-05-27", 24771, 35.1, 53.89, "BP Hammersmith", false, {
      tempC: 18,
      label: "Partly cloudy",
    }),
  ];
  state.trips = [
    makeDemoTrip(vehicleId, "2026-05-06", 24038, 24116, "Commute", 0, 5.3, "Home", "Canary Wharf"),
    makeDemoTrip(vehicleId, "2026-05-18", 24401, 24574, "Weekend", 8.5, 11.2, "London", "Brighton"),
    makeDemoTrip(vehicleId, "2026-05-29", 24782, 24864, "Errands", 4.2, 4.6, "Home", "Westfield"),
  ];

  recomputeEfficiencies();
  persistAndRender();
  await syncRemoteState();
  await refreshWeatherSummary();
}

function makeDemoFillUp(vehicleId, date, odometer, liters, totalCost, station, isPartial, weather) {
  return {
    id: crypto.randomUUID(),
    vehicleId,
    date,
    odometer,
    liters,
    totalCost,
    pricePerLiter: totalCost / liters,
    station,
    isPartial,
    notes: "",
    weather,
  };
}

function makeDemoTrip(vehicleId, date, startOdometer, endOdometer, category, totalCost, litersUsed, startLocation, endLocation) {
  return {
    id: crypto.randomUUID(),
    vehicleId,
    date,
    startOdometer,
    endOdometer,
    distance: endOdometer - startOdometer,
    category,
    totalCost,
    litersUsed,
    startLocation,
    endLocation,
    notes: "",
    weather: null,
  };
}

function recomputeEfficiencies() {
  const sorted = [...state.fillUps].sort(
    (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer
  );
  const previousByVehicle = new Map();

  for (const entry of sorted) {
    const previous = previousByVehicle.get(entry.vehicleId);
    if (previous && !previous.isPartial && !entry.isPartial) {
      const distance = entry.odometer - previous.odometer;
      entry.efficiency = distance > 0 ? distance / entry.liters : null;
    } else {
      entry.efficiency = null;
    }
    previousByVehicle.set(entry.vehicleId, entry);
  }
}

function computeEfficiencyForNewFillUp(fillUp) {
  const priorEntries = state.fillUps
    .filter((entry) => entry.vehicleId === fillUp.vehicleId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer);

  const previous = priorEntries.at(-1);
  if (!previous || previous.isPartial || fillUp.isPartial) {
    return null;
  }

  const distance = fillUp.odometer - previous.odometer;
  return distance > 0 ? distance / fillUp.liters : null;
}

function summarizeEntries(fillUps, trips) {
  const totalFuelCost = fillUps.reduce((sum, entry) => sum + entry.totalCost, 0);
  const totalTripCost = trips.reduce((sum, trip) => sum + (trip.totalCost || 0), 0);
  const totalLiters = fillUps.reduce((sum, entry) => sum + entry.liters, 0);
  const tripLiters = trips.reduce((sum, trip) => sum + (trip.litersUsed || 0), 0);
  const efficiencies = fillUps.filter((entry) => Number.isFinite(entry.efficiency));
  const averageEfficiency = efficiencies.length
    ? efficiencies.reduce((sum, entry) => {
        const unit = getVehicleById(entry.vehicleId)?.distanceUnit || "km";
        return sum + normalizeEfficiency(entry.efficiency, unit);
      }, 0) / efficiencies.length
    : null;
  const bestEfficiency = efficiencies.length
    ? Math.max(
        ...efficiencies.map((entry) =>
          normalizeEfficiency(
            entry.efficiency,
            getVehicleById(entry.vehicleId)?.distanceUnit || "km"
          )
        )
      )
    : null;
  const units = new Set(
    [
      ...fillUps.map((entry) => getVehicleById(entry.vehicleId)?.distanceUnit || "km"),
      ...trips.map((trip) => getVehicleById(trip.vehicleId)?.distanceUnit || "km"),
    ].filter(Boolean)
  );
  const distanceUnit = units.size === 1 ? [...units][0] : "mixed";
  const tripDistance = trips.reduce(
    (sum, trip) => sum + normalizeTripDistance(trip, distanceUnit === "mixed" ? "km" : distanceUnit),
    0
  );
  const averageTripDistance = trips.length ? tripDistance / trips.length : 0;
  const tripKmPerLiter = tripLiters
    ? trips.reduce((sum, trip) => {
        if (!trip.litersUsed) {
          return sum;
        }
        const unit = getVehicleById(trip.vehicleId)?.distanceUnit || "km";
        return sum + normalizeEfficiency(trip.distance / trip.litersUsed, unit);
      }, 0) /
      trips.filter((trip) => trip.litersUsed).length
    : null;

  return {
    totalSpend: totalFuelCost + totalTripCost,
    totalFuelCost,
    totalTripCost,
    totalLiters,
    tripLiters,
    averagePricePerLiter: totalLiters ? totalFuelCost / totalLiters : 0,
    tripDistance,
    averageTripDistance,
    distanceUnit,
    averageEfficiencyLabel: formatEfficiencyFromNormalized(
      averageEfficiency,
      state.settings.consumptionMode
    ),
    bestEfficiencyLabel: formatEfficiencyFromNormalized(
      bestEfficiency,
      state.settings.consumptionMode
    ),
    tripEfficiencyLabel: formatEfficiencyFromNormalized(
      tripKmPerLiter,
      state.settings.consumptionMode
    ),
    averageTripCost: trips.length ? totalTripCost / trips.length : 0,
  };
}

function projectMonthlySpend(fillUps, trips) {
  const items = [...fillUps, ...trips];
  if (items.length < 2) {
    return items.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  }

  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(sorted[0].date);
  const last = new Date(sorted.at(-1).date);
  const days = Math.max((last - first) / 86400000, 1);
  const total = sorted.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  return (total / days) * 30;
}

function buildMonthlySpendSeries(fillUps, trips) {
  const bucket = new Map();
  for (const item of [...fillUps, ...trips]) {
    const month = item.date.slice(0, 7);
    bucket.set(month, (bucket.get(month) || 0) + (item.totalCost || 0));
  }
  return [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([month, value]) => ({ label: formatMonthLabel(month), value }));
}

function getFilteredFillUps() {
  const selectedVehicle = elements.vehicleFilter.value;
  return state.fillUps
    .filter((entry) => selectedVehicle === "all" || entry.vehicleId === selectedVehicle)
    .sort((a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer);
}

function getFilteredTrips() {
  const selectedVehicle = elements.vehicleFilter.value;
  return state.trips
    .filter((trip) => selectedVehicle === "all" || trip.vehicleId === selectedVehicle)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startOdometer - b.startOdometer
    );
}

function getVehicleById(vehicleId) {
  return state.vehicles.find((vehicle) => vehicle.id === vehicleId);
}

function countVehicleEntries(vehicleId) {
  return state.fillUps.filter((entry) => entry.vehicleId === vehicleId).length;
}

function computeEntryMetrics(entry, vehicle) {
  if (!vehicle) {
    return { distanceLabel: "-", efficiencyLabel: "-" };
  }

  const distance = Number.isFinite(entry.efficiency)
    ? entry.efficiency * entry.liters
    : null;
  return {
    distanceLabel: distance ? formatDistance(distance, vehicle.distanceUnit) : "-",
    efficiencyLabel: formatEfficiency(
      entry.efficiency,
      state.settings.consumptionMode,
      vehicle.distanceUnit
    ),
  };
}

function formatTripEfficiency(trip, vehicleUnit) {
  if (!trip.litersUsed || trip.litersUsed <= 0) {
    return "Optional";
  }
  return formatEfficiency(
    trip.distance / trip.litersUsed,
    state.settings.consumptionMode,
    vehicleUnit
  );
}

function describeVehicleConsumption(vehicle) {
  if (!vehicle?.estimatedConsumption) {
    return "";
  }
  return `Estimated ${vehicle.estimatedConsumption.lPer100km.toFixed(1)} L/100km · ${vehicle.estimatedConsumption.mpgUk.toFixed(1)} mpg UK`;
}

function normalizeRegistration(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatRegistrationForDisplay(value) {
  const registration = normalizeRegistration(value);
  if (registration.length === 7) {
    return `${registration.slice(0, 4)} ${registration.slice(4)}`;
  }
  return registration;
}

function mapFuelTypeForForm(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("DIESEL")) {
    return "Diesel";
  }
  if (normalized.includes("HYBRID")) {
    return "Hybrid";
  }
  if (
    normalized.includes("ELECTRIC") ||
    normalized.includes("BEV") ||
    normalized.includes("BATTERY")
  ) {
    return "Electric";
  }
  return "Petrol";
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: state.settings.currency || "GBP",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatNumber(value, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

function formatDistance(value, unit) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (unit === "mixed") {
    return `${formatNumber(value, 1)} km`;
  }
  return `${formatNumber(value, unit === "mi" ? 1 : 1)} ${unit}`;
}

function normalizeEfficiency(rawEfficiency, unit = "km") {
  if (!Number.isFinite(rawEfficiency)) {
    return null;
  }
  return unit === "mi" ? rawEfficiency * 1.60934 : rawEfficiency;
}

function formatEfficiency(rawEfficiency, mode, vehicleUnit = "km") {
  if (!Number.isFinite(rawEfficiency)) {
    return "Pending";
  }
  return formatEfficiencyFromNormalized(
    normalizeEfficiency(rawEfficiency, vehicleUnit),
    mode
  );
}

function formatEfficiencyFromNormalized(kmPerLiter, mode) {
  if (!Number.isFinite(kmPerLiter)) {
    return "Pending";
  }

  switch (mode) {
    case "mpgUk":
      return `${formatNumber(kmPerLiter * 2.82481, 1)} mpg UK`;
    case "mpgUs":
      return `${formatNumber(kmPerLiter * 2.35215, 1)} mpg US`;
    case "kmPerL":
      return `${formatNumber(kmPerLiter, 1)} km/L`;
    case "lPer100km":
    default:
      return `${formatNumber(100 / kmPerLiter, 1)} L/100km`;
  }
}

function formatWeather(weather) {
  if (!weather) {
    return "Unavailable";
  }
  const parts = [];
  if (weather.label) {
    parts.push(weather.label);
  }
  if (Number.isFinite(weather.tempC)) {
    parts.push(`${weather.tempC}C`);
  }
  return parts.join(" · ") || "Unavailable";
}

async function refreshWeatherSummary() {
  if (!state.settings.homeCity) {
    elements.weatherSummary.innerHTML =
      "<strong>Weather not configured</strong><span>Add a home city to pull forecast snapshots.</span>";
    return;
  }

  const weather = await fetchWeatherForDate(getLocalDateString());
  if (!weather) {
    elements.weatherSummary.innerHTML =
      "<strong>Weather unavailable</strong><span>The forecast provider could not be reached right now.</span>";
    return;
  }

  elements.weatherSummary.innerHTML = `
    <strong>${escapeHtml(state.settings.homeCity)} · ${escapeHtml(weather.label || "Conditions")}</strong>
    <span>${Number.isFinite(weather.tempC) ? `${weather.tempC}C` : "No temperature"}${weather.windKph ? ` · ${weather.windKph} km/h wind` : ""}</span>
  `;
}

async function fetchWeatherForDate(date) {
  if (!state.settings.homeCity) {
    return null;
  }

  const key = `${state.settings.homeCity}:${state.settings.countryCode}:${date}`;
  if (state.weatherCache[key]) {
    return state.weatherCache[key];
  }

  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", state.settings.homeCity);
    geoUrl.searchParams.set("count", "1");
    if (state.settings.countryCode) {
      geoUrl.searchParams.set("countryCode", state.settings.countryCode);
    }
    geoUrl.searchParams.set("language", "en");
    geoUrl.searchParams.set("format", "json");

    const geoResponse = await fetch(geoUrl);
    const geoData = await geoResponse.json();
    const location = geoData.results?.[0];
    if (!location) {
      return null;
    }

    const today = getLocalDateString();
    const weatherUrl = new URL(
      date >= today
        ? "https://api.open-meteo.com/v1/forecast"
        : "https://archive-api.open-meteo.com/v1/archive"
    );
    weatherUrl.searchParams.set("latitude", location.latitude);
    weatherUrl.searchParams.set("longitude", location.longitude);
    weatherUrl.searchParams.set("start_date", date);
    weatherUrl.searchParams.set("end_date", date);
    weatherUrl.searchParams.set(
      "daily",
      "weather_code,temperature_2m_mean,wind_speed_10m_max"
    );
    weatherUrl.searchParams.set("timezone", "auto");

    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();
    const weather = {
      label: weatherCodes[weatherData.daily?.weather_code?.[0]] || "Conditions logged",
      tempC: roundMaybe(weatherData.daily?.temperature_2m_mean?.[0], 1),
      windKph: roundMaybe(weatherData.daily?.wind_speed_10m_max?.[0], 1),
    };

    state.weatherCache[key] = weather;
    saveLocalState();
    return weather;
  } catch {
    return null;
  }
}

async function loadRemoteState() {
  setSyncState("warn", "Loading profile...");
  const response = await callApi("load", {
    profileId: state.session.profileId,
    profileKey: state.session.profileKey,
  });
  applyRemoteResponse(response);
  setSyncState("ok", "Profile loaded.");
  render();
}

async function syncRemoteState(showSuccessMessage = false) {
  if (!hasProfileSession() || syncInFlight) {
    return;
  }

  syncInFlight = true;
  setSyncState("warn", "Syncing...");
  render();

  try {
    const response = await callApi("save", {
      profileId: state.session.profileId,
      profileKey: state.session.profileKey,
      payload: {
        settings: state.settings,
        vehicles: state.vehicles,
        fillUps: state.fillUps,
        trips: state.trips,
      },
    });
    state.session.lastSyncedAt = response.profile.updatedAt || new Date().toISOString();
    setSyncState("ok", showSuccessMessage ? "Sync complete." : "Synced");
    saveLocalState();
  } catch (error) {
    setSyncState("warn", error.message || "Sync failed.");
  } finally {
    syncInFlight = false;
    render();
  }
}

function applyRemoteResponse(response) {
  state.session.profileId = response.profile.id;
  state.session.profileKey =
    response.profile.profileKey || state.session.profileKey;
  state.session.nickname = response.profile.nickname;
  state.session.lastSyncedAt = response.profile.updatedAt || new Date().toISOString();
  state.settings = {
    ...defaultState.settings,
    ...(response.profile.settings || {}),
  };
  state.vehicles = Array.isArray(response.profile.vehicles)
    ? response.profile.vehicles
    : [];
  state.fillUps = Array.isArray(response.profile.fillUps)
    ? response.profile.fillUps
    : [];
  state.trips = Array.isArray(response.profile.trips)
    ? response.profile.trips
    : [];
  recomputeEfficiencies();
  saveLocalState();
  applyTheme();
  syncFormsFromState();
}

function persistAndRender() {
  saveLocalState();
  render();
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  applyTheme();
  saveLocalState();
}

function applyTheme() {
  const theme = state.settings.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  elements.themeToggleBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  elements.themeToggleBtn.setAttribute("aria-pressed", String(theme === "dark"));
}

function setSyncState(level, message) {
  state.session.syncState = level === "ok" ? "ok" : level === "warn" ? "warn" : "disconnected";
  state.session.syncMessage = message || "";
  saveLocalState();
}

function requireProfile() {
  if (hasProfileSession()) {
    return true;
  }
  alert("Create a nickname profile first so your data has a Supabase home.");
  return false;
}

function hasProfileSession() {
  return Boolean(state.session.profileId && state.session.profileKey);
}

async function callApi(action, payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed.");
  }
  return data;
}

function getLocalDateString() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getCurrentFilterUnit(entries) {
  const units = new Set(
    entries.map((entry) => getVehicleById(entry.vehicleId)?.distanceUnit || "km")
  );
  return units.size === 1 ? [...units][0] : "km";
}

function getCurrentFilterUnitFromTrips(trips) {
  const units = new Set(
    trips.map((trip) => getVehicleById(trip.vehicleId)?.distanceUnit || "km")
  );
  return units.size === 1 ? [...units][0] : "km";
}

function normalizeTripDistance(trip, targetUnit) {
  const sourceUnit = getVehicleById(trip.vehicleId)?.distanceUnit || "km";
  if (!Number.isFinite(trip.distance)) {
    return null;
  }
  if (sourceUnit === targetUnit) {
    return trip.distance;
  }
  return sourceUnit === "mi" ? trip.distance * 1.60934 : trip.distance / 1.60934;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMonthLabel(value) {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
  }).format(date);
}

function formatAxisNumber(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function formatAxisDistance(value, unit) {
  return `${formatAxisNumber(value, value >= 100 ? 0 : 1)} ${unit}`;
}

function roundMaybe(value, digits) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function numberOrNull(value) {
  if (value === "" || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
