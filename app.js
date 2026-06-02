const STORAGE_KEY = "road-ledger-state-v2";
const SUPABASE_URL = "https://lzbymvbbhpqmgpggrxaj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_mEK9Y8QpniN3g62SH8CYog_ODItP59c";
const API_URL = `${SUPABASE_URL}/functions/v1/road-ledger-api`;

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

const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  chartGrid: document.querySelector("#chartGrid"),
  insightList: document.querySelector("#insightList"),
  vehicleForm: document.querySelector("#vehicleForm"),
  vehicleList: document.querySelector("#vehicleList"),
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
};

void init();

async function init() {
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
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.syncNowBtn.addEventListener("click", () => void syncRemoteState(true));
  elements.switchProfileBtn.addEventListener("click", handleSwitchProfile);
  elements.vehicleForm.addEventListener("submit", handleVehicleSubmit);
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
      return `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(vehicle.name)}</strong>
            <span class="meta">${escapeHtml(vehicle.fuelType)} · ${vehicle.distanceUnit.toUpperCase()}${
              vehicle.tankSize ? ` · ${vehicle.tankSize}L tank` : ""
            }</span>
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

  const chartCards = [
    renderChartCard(
      "Efficiency",
      state.settings.consumptionMode.toUpperCase(),
      renderLineChart(
        fillUps
          .filter((entry) => Number.isFinite(entry.efficiency))
          .map((entry) =>
            normalizeEfficiency(
              entry.efficiency,
              getVehicleById(entry.vehicleId)?.distanceUnit || fillUpVehicleUnit
            )
          ),
        "#cb5d2d"
      )
    ),
    renderChartCard(
      "Fuel price trend",
      "Price per litre",
      renderLineChart(
        fillUps.map((entry) => entry.pricePerLiter).filter((value) => Number.isFinite(value)),
        "#3a7094"
      )
    ),
    renderChartCard(
      "Monthly spend",
      "Fuel + trip extras",
      renderBarChart(buildMonthlySpendSeries(fillUps, trips), "#5f7c63")
    ),
    renderChartCard(
      "Trip distance",
      tripVehicleUnit === "mi" ? "Miles per trip" : "Kilometres per trip",
      renderBarChart(
        trips
          .map((trip) => normalizeTripDistance(trip, tripVehicleUnit))
          .filter((value) => Number.isFinite(value)),
        "#b56d16"
      )
    ),
  ];

  elements.chartGrid.innerHTML = chartCards.join("");
}

function renderChartCard(title, meta, surface) {
  return `
    <article class="chart-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="chart-meta">${escapeHtml(meta)}</div>
      <div class="chart-surface">${surface}</div>
    </article>
  `;
}

function renderLineChart(values, color) {
  if (values.length < 2) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = 8 + (index / Math.max(values.length - 1, 1)) * 84;
      const y = 86 - ((value - min) / Math.max(max - min, 1)) * 58;
      return `${x},${y}`;
    })
    .join(" ");

  return `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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

function renderBarChart(values, color) {
  if (!values.length) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const max = Math.max(...values, 1);
  const bars = values
    .slice(-8)
    .map((value, index, series) => {
      const barWidth = 80 / series.length;
      const x = 10 + index * barWidth;
      const height = (value / max) * 62;
      return `<rect x="${x}" y="${86 - height}" width="${Math.max(barWidth - 2, 4)}" height="${height}" rx="3" fill="${color}" opacity="0.86" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line x1="8" y1="86" x2="94" y2="86" stroke="rgba(0,0,0,0.12)" stroke-width="1" />
      ${bars}
    </svg>
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

function handleVehicleSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  state.vehicles.push({
    id: crypto.randomUUID(),
    name: formData.get("name").toString().trim(),
    fuelType: formData.get("fuelType").toString(),
    tankSize: numberOrNull(formData.get("tankSize")),
    distanceUnit: formData.get("distanceUnit").toString(),
  });

  event.currentTarget.reset();
  event.currentTarget.distanceUnit.value = "km";
  event.currentTarget.fuelType.value = "Petrol";
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
  };

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
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `road-ledger-backup-${getLocalDateString()}.json`;
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
      state = mergeState(JSON.parse(reader.result));
      recomputeEfficiencies();
      saveLocalState();
      syncFormsFromState();
      render();
      void refreshWeatherSummary();
    } catch {
      alert("That backup file could not be read.");
    }
  };
  reader.readAsText(file);
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
    .map(([, value]) => value);
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
  syncFormsFromState();
}

function persistAndRender() {
  saveLocalState();
  render();
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
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
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
