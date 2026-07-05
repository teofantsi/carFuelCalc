const STORAGE_KEY = "road-ledger-state-v2";
const SUPABASE_URL = "https://lzbymvbbhpqmgpggrxaj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_mEK9Y8QpniN3g62SH8CYog_ODItP59c";
const API_URL = `${SUPABASE_URL}/functions/v1/road-ledger-api`;
const BACKUP_CSV_VERSION = "1";
const ROUTE_TYPE_MPG_FACTORS = {
  city: 0.75,
  mixed: 0.9,
  motorway: 1.05,
};
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
  "profileMpgUk",
  "profileMpgSource",
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
  "tripMpgUk",
  "litersUsed",
  "fuelPricePerLiter",
  "startLocation",
  "endLocation",
  "routeWaypoints",
  "routeSource",
  "routeType",
  "routeAverageSpeedMph",
  "plannedDistance",
  "plannedDurationSeconds",
  "routePolyline",
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
  ownershipCosts: [],
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
let editingVehicleId = "";
let editingFillUpId = "";
let editingOwnershipCostId = "";
let lastFillUpPricingField = "";
let lastTripVehicleSelection = "";
let tripWorkspaceFocus = "planner";
let resolvedRouteStops = null;
let dashboardFocus = "efficiency";
const mobileViewport = window.matchMedia("(max-width: 760px)");
let lastIsMobileViewport = mobileViewport.matches;
const sectionVisibility = {
  vehicle: false,
  settings: false,
};
const foldableSectionState = {
  dashboard: true,
  reports: true,
  fillUps: true,
  trips: true,
  ownership: true,
  fuelHistory: true,
  tripHistory: true,
  ownershipHistory: true,
};

const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  chartGrid: document.querySelector("#chartGrid"),
  insightList: document.querySelector("#insightList"),
  reportGrid: document.querySelector("#reportGrid"),
  vehicleForm: document.querySelector("#vehicleForm"),
  vehicleList: document.querySelector("#vehicleList"),
  plateLookupBtn: document.querySelector("#plateLookupBtn"),
  vehicleLookupStatus: document.querySelector("#vehicleLookupStatus"),
  vehicleLookupSummary: document.querySelector("#vehicleLookupSummary"),
  cancelVehicleEditBtn: document.querySelector("#cancelVehicleEditBtn"),
  fillUpForm: document.querySelector("#fillUpForm"),
  cancelFillUpEditBtn: document.querySelector("#cancelFillUpEditBtn"),
  fillUpCalcStatus: document.querySelector("#fillUpCalcStatus"),
  fillUpTableBody: document.querySelector("#fillUpTableBody"),
  routePlannerForm: document.querySelector("#routePlannerForm"),
  tripForm: document.querySelector("#tripForm"),
  tripCalcStatus: document.querySelector("#tripCalcStatus"),
  routeResolutionSummary: document.querySelector("#routeResolutionSummary"),
  resolveRouteBtn: document.querySelector("#resolveRouteBtn"),
  routePlanStatus: document.querySelector("#routePlanStatus"),
  planRouteBtn: document.querySelector("#planRouteBtn"),
  routePlannerCard: document.querySelector("#routePlannerCard"),
  tripEntryCard: document.querySelector("#tripEntryCard"),
  tripTableBody: document.querySelector("#tripTableBody"),
  ownershipCostForm: document.querySelector("#ownershipCostForm"),
  cancelOwnershipCostEditBtn: document.querySelector("#cancelOwnershipCostEditBtn"),
  ownershipCostTableBody: document.querySelector("#ownershipCostTableBody"),
  ownershipBreakdownBody: document.querySelector("#ownershipBreakdownBody"),
  settingsForm: document.querySelector("#settingsForm"),
  vehicleFilter: document.querySelector("#vehicleFilter"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  weatherSummary: document.querySelector("#weatherSummary"),
  seedDemoBtn: document.querySelector("#seedDemoBtn"),
  backfillWeatherBtn: document.querySelector("#backfillWeatherBtn"),
  statCardTemplate: document.querySelector("#statCardTemplate"),
  profileForm: document.querySelector("#profileForm"),
  profileNickname: document.querySelector("#profileNickname"),
  profileTitle: document.querySelector("#profileTitle"),
  profileMeta: document.querySelector("#profileMeta"),
  syncBadge: document.querySelector("#syncBadge"),
  syncNowBtn: document.querySelector("#syncNowBtn"),
  switchProfileBtn: document.querySelector("#switchProfileBtn"),
  themeToggleBtn: document.querySelector("#themeToggleBtn"),
  showVehicleSectionBtn: document.querySelector("#showVehicleSectionBtn"),
  showSettingsSectionBtn: document.querySelector("#showSettingsSectionBtn"),
  vehicleCard: document.querySelector("#vehicleCard"),
  settingsCard: document.querySelector("#settingsCard"),
  workspaceSwitches: document.querySelectorAll("[data-trip-workspace-target]"),
  sectionRevealLinks: document.querySelectorAll("[data-reveal-section]"),
  sectionCloseButtons: document.querySelectorAll("[data-close-section]"),
};

function getFormField(form, name) {
  return form?.elements?.namedItem(name);
}

function getSubmitButton(form) {
  return form?.querySelector('button[type="submit"]');
}

function addFieldListener(form, name, eventName, handler) {
  getFormField(form, name)?.addEventListener(eventName, handler);
}

void init();

async function init() {
  applyTheme();
  recomputeEfficiencies();
  bindEvents();
  syncFormsFromState();
  syncResponsiveState(true);
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
  mobileViewport.addEventListener("change", handleViewportChange);
  elements.themeToggleBtn.addEventListener("click", toggleTheme);
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.syncNowBtn.addEventListener("click", () => void syncRemoteState(true));
  elements.switchProfileBtn.addEventListener("click", handleSwitchProfile);
  elements.showVehicleSectionBtn.addEventListener("click", () =>
    toggleSection("vehicle")
  );
  elements.showSettingsSectionBtn.addEventListener("click", () =>
    toggleSection("settings")
  );
  for (const link of elements.sectionRevealLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      revealSection(link.dataset.revealSection);
    });
  }
  for (const button of elements.sectionCloseButtons) {
    button.addEventListener("click", () => hideSection(button.dataset.closeSection));
  }
  for (const button of document.querySelectorAll("[data-fold-toggle]")) {
    button.addEventListener("click", () =>
      toggleFoldableSection(button.dataset.foldToggle)
    );
  }
  elements.vehicleForm.addEventListener("submit", handleVehicleSubmit);
  elements.plateLookupBtn.addEventListener("click", () => void handlePlateLookup());
  getFormField(elements.vehicleForm, "registrationNumber").addEventListener(
    "input",
    handleRegistrationInput
  );
  elements.cancelVehicleEditBtn.addEventListener("click", resetVehicleForm);
  elements.cancelFillUpEditBtn.addEventListener("click", resetFillUpForm);
  elements.fillUpForm.addEventListener("submit", (event) => void handleFillUpSubmit(event));
  for (const fieldName of ["liters", "totalCost", "pricePerLiter"]) {
    getFormField(elements.fillUpForm, fieldName).addEventListener("input", (event) => {
      lastFillUpPricingField = event.target.name;
      syncFillUpPricingFields();
    });
    getFormField(elements.fillUpForm, fieldName).addEventListener(
      "change",
      syncFillUpPricingFields
    );
  }
  elements.routePlannerForm.addEventListener("submit", (event) => event.preventDefault());
  elements.tripForm.addEventListener("submit", (event) => void handleTripSubmit(event));
  elements.resolveRouteBtn.addEventListener("click", () => void handleResolveRoute());
  elements.planRouteBtn.addEventListener("click", () => void handlePlanRoute());
  for (const button of elements.workspaceSwitches) {
    button.addEventListener("click", () =>
      setTripWorkspaceFocus(button.dataset.tripWorkspaceTarget)
    );
  }
  elements.ownershipCostForm.addEventListener("submit", (event) =>
    void handleOwnershipCostSubmit(event)
  );
  elements.cancelOwnershipCostEditBtn.addEventListener("click", resetOwnershipCostForm);
  for (const fieldName of [
    "vehicleId",
    "date",
    "startOdometer",
    "endOdometer",
    "plannedDistance",
    "tripMpgUk",
    "litersUsed",
    "routeType",
  ]) {
    getFormField(elements.tripForm, fieldName).addEventListener(
      "input",
      syncTripFormDerivedFields
    );
    getFormField(elements.tripForm, fieldName).addEventListener(
      "change",
      syncTripFormDerivedFields
    );
  }
  for (const fieldName of ["startLocation", "endLocation", "routeWaypoints"]) {
    getFormField(elements.routePlannerForm, fieldName).addEventListener("input", () => {
      resetPlannedRouteFields();
      syncTripFormDerivedFields();
    });
    getFormField(elements.routePlannerForm, fieldName).addEventListener("change", () => {
      resetPlannedRouteFields();
      syncTripFormDerivedFields();
    });
  }
  getFormField(elements.routePlannerForm, "vehicleId").addEventListener("change", () => {
    syncTripVehicleFromPlanner();
    resetPlannedRouteFields();
    syncTripFormDerivedFields();
  });
  addFieldListener(elements.routePlannerForm, "isRoundTrip", "change", () => {
    syncPlannedRouteOutputsFromBase();
    syncTripFormDerivedFields();
  });
  getFormField(elements.tripForm, "vehicleId").addEventListener("change", () => {
    syncPlannerVehicleFromTrip();
    resetPlannedRouteFields();
    syncTripFormDerivedFields();
  });
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.vehicleFilter.addEventListener("change", render);
  elements.exportBtn.addEventListener("click", exportBackup);
  elements.importInput.addEventListener("change", importBackup);
  elements.seedDemoBtn.addEventListener("click", () => void seedDemoData());
  elements.backfillWeatherBtn.addEventListener("click", () => void backfillFillUpWeather());
  elements.chartGrid.addEventListener("click", handleDashboardFocusClick);
  for (const link of document.querySelectorAll("[data-mobile-reveal]")) {
    link.addEventListener("click", handleMobileRevealLink);
  }
}

function handleViewportChange(event) {
  syncResponsiveState(false, event.matches);
  render();
}

function handleMobileRevealLink(event) {
  const sectionKey = event.currentTarget.dataset.mobileReveal;
  const targetSelector = event.currentTarget.getAttribute("href");
  if (!sectionKey || !targetSelector?.startsWith("#")) {
    return;
  }

  event.preventDefault();
  sectionVisibility[sectionKey] = true;
  renderSectionVisibility();
  document.querySelector(targetSelector)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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
    ownershipCosts: Array.isArray(incoming.ownershipCosts) ? incoming.ownershipCosts : [],
  };
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncFormsFromState() {
  getFormField(elements.settingsForm, "currency").value = state.settings.currency;
  getFormField(elements.settingsForm, "homeCity").value = state.settings.homeCity;
  getFormField(elements.settingsForm, "countryCode").value = state.settings.countryCode;
  getFormField(elements.settingsForm, "consumptionMode").value =
    state.settings.consumptionMode;
  getFormField(elements.fillUpForm, "date").value = getLocalDateString();
  getFormField(elements.tripForm, "date").value = getLocalDateString();
  getFormField(elements.ownershipCostForm, "date").value = getLocalDateString();
  getFormField(elements.ownershipCostForm, "category").value = "service";
  elements.profileNickname.value = state.session.nickname || "";
  elements.fillUpCalcStatus.textContent =
    "Enter any two of price per litre, volume, or total cost.";
  elements.tripCalcStatus.textContent =
    "Trip fuel cost uses the previous fill-up price for this vehicle.";
  resetVehicleForm();
  resetFillUpFormDerivedState();
  resetTripFormDerivedState();
  resetVehicleLookupUi();
}

function render() {
  renderVehicleOptions();
  renderTripWorkspace();
  renderProfile();
  renderSectionVisibility();
  renderFoldableSections();
  renderVehicleList();
  renderStats();
  renderCharts();
  renderInsights();
  renderReports();
  renderFuelTable();
  renderTripTable();
  renderOwnershipCostTable();
  renderOwnershipBreakdown();
  updateFormAvailability();
  syncFillUpPricingFields();
  syncTripFormDerivedFields();
}

function renderTripWorkspace() {
  for (const button of elements.workspaceSwitches) {
    const isActive = button.dataset.tripWorkspaceTarget === tripWorkspaceFocus;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  }

  const showPlanner = tripWorkspaceFocus === "planner";
  elements.routePlannerCard?.classList.toggle("is-active", showPlanner);
  elements.routePlannerCard?.toggleAttribute("hidden", !showPlanner);
  elements.routePlannerCard?.setAttribute("aria-hidden", String(!showPlanner));
  elements.tripEntryCard?.classList.toggle("is-active", !showPlanner);
  elements.tripEntryCard?.toggleAttribute("hidden", showPlanner);
  elements.tripEntryCard?.setAttribute("aria-hidden", String(showPlanner));
  elements.planRouteBtn.disabled =
    !hasProfileSession() ||
    !state.vehicles.length ||
    !Array.isArray(resolvedRouteStops) ||
    resolvedRouteStops.length < 2;
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
  const selectedFuelVehicle = getFormField(elements.fillUpForm, "vehicleId")?.value || "";
  const selectedPlannerVehicle =
    getFormField(elements.routePlannerForm, "vehicleId")?.value || "";
  const selectedTripVehicle = getFormField(elements.tripForm, "vehicleId")?.value || "";
  const selectedOwnershipVehicle =
    getFormField(elements.ownershipCostForm, "vehicleId")?.value || "";
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

  getFormField(elements.fillUpForm, "vehicleId").innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';
  getFormField(elements.routePlannerForm, "vehicleId").innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';
  getFormField(elements.tripForm, "vehicleId").innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';
  getFormField(elements.ownershipCostForm, "vehicleId").innerHTML =
    vehicleOptions || '<option value="">Add a vehicle first</option>';

  if (state.vehicles.some((vehicle) => vehicle.id === selectedFuelVehicle)) {
    getFormField(elements.fillUpForm, "vehicleId").value = selectedFuelVehicle;
  }
  if (state.vehicles.some((vehicle) => vehicle.id === selectedPlannerVehicle)) {
    getFormField(elements.routePlannerForm, "vehicleId").value = selectedPlannerVehicle;
  }
  if (state.vehicles.some((vehicle) => vehicle.id === selectedTripVehicle)) {
    getFormField(elements.tripForm, "vehicleId").value = selectedTripVehicle;
  }
  if (state.vehicles.some((vehicle) => vehicle.id === selectedOwnershipVehicle)) {
    getFormField(elements.ownershipCostForm, "vehicleId").value =
      selectedOwnershipVehicle;
  }

  if (!getFormField(elements.fillUpForm, "vehicleId").value && state.vehicles[0]) {
    getFormField(elements.fillUpForm, "vehicleId").value = state.vehicles[0].id;
  }
  if (!getFormField(elements.routePlannerForm, "vehicleId").value && state.vehicles[0]) {
    getFormField(elements.routePlannerForm, "vehicleId").value = state.vehicles[0].id;
  }
  if (!getFormField(elements.tripForm, "vehicleId").value && state.vehicles[0]) {
    getFormField(elements.tripForm, "vehicleId").value = state.vehicles[0].id;
  }
  if (
    !getFormField(elements.ownershipCostForm, "vehicleId").value &&
    state.vehicles[0]
  ) {
    getFormField(elements.ownershipCostForm, "vehicleId").value = state.vehicles[0].id;
  }

  syncTripVehicleFromPlanner();
}

function renderVehicleList() {
  if (!state.vehicles.length) {
    elements.vehicleList.innerHTML = '<p class="empty">No vehicles yet.</p>';
    return;
  }

  elements.vehicleList.innerHTML = state.vehicles
    .map((vehicle) => {
      const tripCount = state.trips.filter((trip) => trip.vehicleId === vehicle.id).length;
      const costTotals = getVehicleCostTotals(vehicle.id);
      const registrationMeta = vehicle.registrationNumber
        ? ` · ${escapeHtml(formatRegistrationForDisplay(vehicle.registrationNumber))}`
        : "";
      const consumptionMeta = describeVehicleConsumption(vehicle);
      return `
        <div class="list-item">
          <div class="list-item-main">
            <strong>${escapeHtml(vehicle.name)}</strong>
            <span class="meta">${escapeHtml(vehicle.fuelType)} · ${vehicle.distanceUnit.toUpperCase()}${
              vehicle.tankSize ? ` · ${vehicle.tankSize}L tank` : ""
            }${registrationMeta}</span>
            ${consumptionMeta ? `<span class="meta">${escapeHtml(consumptionMeta)}</span>` : ""}
            <span class="meta">This year ${formatCurrency(costTotals.currentYearTotal)} · All time ${formatCurrency(costTotals.allTimeTotal)}</span>
          </div>
          <div class="list-item-actions">
            <span class="chip">${countVehicleEntries(vehicle.id)} fill-ups · ${tripCount} trips</span>
            <button class="inline-link" data-edit-vehicle="${vehicle.id}" type="button">Edit</button>
            <button class="danger-link" data-delete-vehicle="${vehicle.id}" type="button">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  for (const button of elements.vehicleList.querySelectorAll("[data-edit-vehicle]")) {
    button.addEventListener("click", () => startVehicleEdit(button.dataset.editVehicle));
  }

  for (const button of elements.vehicleList.querySelectorAll("[data-delete-vehicle]")) {
    button.addEventListener("click", () => void deleteVehicle(button.dataset.deleteVehicle));
  }
}

function renderStats() {
  const filteredFillUps = getFilteredFillUps();
  const filteredTrips = getFilteredTrips();
  const filteredOwnershipCosts = getFilteredOwnershipCosts();
  const totals = summarizeEntries(filteredFillUps, filteredTrips, filteredOwnershipCosts);
  const groups = [
    {
      title: "Spend overview",
      description: "Money going into fuel, trips, and ongoing ownership.",
      stats: [
        {
          label: "Total spend",
          value: formatCurrency(totals.totalSpend),
          meta: `${filteredFillUps.length} fill-ups · ${filteredTrips.length} trips · ${filteredOwnershipCosts.length} ownership costs`,
        },
        {
          label: "Ownership costs",
          value: formatCurrency(totals.totalOwnershipCost),
          meta: filteredOwnershipCosts.length
            ? "Service, tax, payments, insurance"
            : "Log yearly car costs below",
        },
      ],
    },
    {
      title: "Fuel and efficiency",
      description: "How much fuel you are buying and how well the vehicles are performing.",
      stats: [
        {
          label: "Fuel purchased",
          value: `${formatNumber(totals.totalLiters, 1)} L`,
          meta: `${formatCurrency(totals.averagePricePerLiter)}/L average`,
        },
        {
          label: "Average efficiency",
          value: totals.averageEfficiencyLabel,
          meta: totals.bestEfficiencyLabel
            ? `Best ${totals.bestEfficiencyLabel}`
            : "Add two full fill-ups to calculate",
        },
      ],
    },
    {
      title: "Trip activity",
      description: "Distance and fuel use across recorded trips.",
      stats: [
        {
          label: "Trip distance",
          value: formatDistance(totals.tripDistance, totals.distanceUnit),
          meta: filteredTrips.length
            ? `${formatDistance(totals.averageTripDistance, totals.distanceUnit)} average`
            : "No trips yet",
        },
        {
          label: "Trip fuel use",
          value: totals.tripEfficiencyLabel,
          meta: totals.tripLiters
            ? `${formatNumber(totals.tripLiters, 1)} L logged`
            : "Derived from trip MPG or liters used",
        },
      ],
    },
  ];

  elements.statsGrid.innerHTML = groups
    .map(
      (group) => `
        <section class="metric-section">
          <div class="metric-section-header">
            <div>
              <p class="eyebrow">Metrics</p>
              <h2>${escapeHtml(group.title)}</h2>
            </div>
            <p class="metric-section-copy">${escapeHtml(group.description)}</p>
          </div>
          <div class="stats-grid">
            ${group.stats.map((stat) => renderStatCard(stat)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderStatCard(stat) {
  const node = elements.statCardTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".stat-label").textContent = stat.label;
  node.querySelector(".stat-value").textContent = stat.value;
  node.querySelector(".stat-meta").textContent = stat.meta;
  return node.outerHTML;
}

function renderCharts() {
  const fillUps = getFilteredFillUps();
  const trips = getFilteredTrips();
  const ownershipCosts = getFilteredOwnershipCosts();
  const fillUpVehicleUnit = getCurrentFilterUnit(fillUps);
  const tripVehicleUnit = getCurrentFilterUnitFromTrips(trips);
  const chartData = buildDashboardChartData(
    fillUps,
    trips,
    ownershipCosts,
    fillUpVehicleUnit,
    tripVehicleUnit
  );
  const availableViews = chartData.filter((chart) => chart.values.length);
  if (!availableViews.some((chart) => chart.id === dashboardFocus)) {
    dashboardFocus = availableViews[0]?.id || "efficiency";
  }

  const heroChart = chartData.find((chart) => chart.id === dashboardFocus) || chartData[0];
  const monthlySpendChart = chartData.find((chart) => chart.id === "monthlySpend");
  const priceChart = chartData.find((chart) => chart.id === "price");

  elements.chartGrid.innerHTML = `
    <div class="command-center">
      <article class="chart-card chart-card-hero">
        <div class="command-header">
          <div>
            <div class="command-label">Overview</div>
            <h3>${escapeHtml(heroChart.title)}</h3>
            <div class="chart-meta">${escapeHtml(heroChart.meta)}</div>
          </div>
          <div class="chart-switcher" role="tablist" aria-label="Dashboard metric">
            ${chartData
              .map(
                (chart) => `
                  <button
                    type="button"
                    class="chart-switch${chart.id === heroChart.id ? " active" : ""}"
                    data-chart-focus="${chart.id}"
                    aria-pressed="${chart.id === heroChart.id ? "true" : "false"}"
                  >
                    ${escapeHtml(chart.shortLabel)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="chart-metrics chart-metrics-hero">${renderChartMetrics(heroChart.metrics)}</div>
        <div class="chart-surface chart-surface-hero">
          ${renderHeroChart(heroChart.values, heroChart.color, heroChart.options)}
        </div>
      </article>

      <div class="command-stack">
        <article class="chart-card chart-card-secondary">
          <div class="chart-card-head">
            <div>
              <h3>${escapeHtml(monthlySpendChart.title)}</h3>
              <div class="chart-meta">${escapeHtml(monthlySpendChart.meta)}</div>
            </div>
            <strong class="chart-highlight">${escapeHtml(monthlySpendChart.highlight)}</strong>
          </div>
          <div class="chart-surface chart-surface-compact">
            ${renderBarChart(monthlySpendChart.values, monthlySpendChart.color, monthlySpendChart.options)}
          </div>
        </article>

        <article class="chart-card chart-card-secondary">
          <div class="chart-card-head">
            <div>
              <h3>${escapeHtml(priceChart.title)}</h3>
              <div class="chart-meta">${escapeHtml(priceChart.meta)}</div>
            </div>
            <strong class="chart-highlight">${escapeHtml(priceChart.highlight)}</strong>
          </div>
          <div class="chart-surface chart-surface-compact">
            ${renderLineChart(priceChart.values, priceChart.color, priceChart.options)}
          </div>
        </article>
      </div>
    </div>
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

function buildDashboardChartData(fillUps, trips, ownershipCosts, fillUpVehicleUnit, tripVehicleUnit) {
  const efficiencyEntries = fillUps.filter((entry) => Number.isFinite(entry.efficiency));
  const efficiencyValues = efficiencyEntries.map((entry) =>
    normalizeEfficiency(
      entry.efficiency,
      getVehicleById(entry.vehicleId)?.distanceUnit || fillUpVehicleUnit
    )
  );
  const efficiencyChartValues = efficiencyValues.map((value) =>
    toEfficiencyDisplayValue(value, state.settings.consumptionMode)
  );
  const efficiencyLabels = efficiencyEntries.map((entry) => formatChartDateLabel(entry.date));
  const priceEntries = fillUps
    .map((entry) => ({
      ...entry,
      resolvedPricePerLiter: getResolvedFillUpPricePerLiter(entry),
    }))
    .filter((entry) => Number.isFinite(entry.resolvedPricePerLiter));
  const priceValues = priceEntries.map((entry) => entry.resolvedPricePerLiter);
  const priceLabels = priceEntries.map((entry) => formatChartDateLabel(entry.date));
  const monthlySpendSeries = buildMonthlyFuelSpendSeries(fillUps);
  const monthlySpendValues = monthlySpendSeries.map((item) => item.value);
  const monthlySpendLabels = monthlySpendSeries.map((item) => item.label);
  const tripDistanceValues = trips
    .map((trip) => normalizeTripDistance(trip, tripVehicleUnit))
    .filter((value) => Number.isFinite(value));
  const tripDistanceLabels = trips
    .filter((trip) => Number.isFinite(normalizeTripDistance(trip, tripVehicleUnit)))
    .map((trip) => formatChartDateLabel(trip.date));

  return [
    {
      id: "efficiency",
      shortLabel: "Efficiency",
      title: "Efficiency trend",
      meta: state.settings.consumptionMode.toUpperCase(),
      metrics: buildEfficiencyMetrics(efficiencyValues),
      values: efficiencyChartValues,
      color: "var(--accent)",
      highlight: buildEfficiencyMetrics(efficiencyValues)[0]?.value || "Pending",
      options: {
        yFormatter: (value) => formatEfficiencyAxisLabel(value, state.settings.consumptionMode),
        xLabels: efficiencyLabels,
        yDomain: buildReadableChartRange(efficiencyChartValues, {
          paddingRatio: 0.22,
          minimumPadding: getEfficiencyMinimumAxisPadding(state.settings.consumptionMode),
        }),
      },
    },
    {
      id: "price",
      shortLabel: "Fuel price",
      title: "Fuel price trend",
      meta: "Price per litre",
      metrics: buildPriceMetrics(priceEntries),
      values: priceValues,
      color: "var(--sky)",
      highlight: buildPriceMetrics(priceEntries)[0]?.value || "Pending",
      options: {
        yFormatter: (value) => formatCurrency(value),
        xLabels: priceLabels,
        yDomain: buildReactiveRange(priceValues, {
          paddingRatio: 0.08,
          minimumPadding: 0.005,
        }),
      },
    },
    {
      id: "monthlySpend",
      shortLabel: "Monthly spend",
      title: "Monthly spend",
      meta: "Fuel fill-ups only",
      metrics: buildMonthlySpendMetrics(monthlySpendValues),
      values: monthlySpendValues,
      color: "var(--sage)",
      highlight: buildMonthlySpendMetrics(monthlySpendValues)[0]?.value || "Pending",
      options: {
        yFormatter: (value) => formatCurrency(value),
        xLabels: monthlySpendLabels,
        yDomain: buildReadableChartRange(monthlySpendValues, {
          includeZero: true,
          paddingRatio: 0.12,
          minimumPadding: 5,
        }),
      },
    },
    {
      id: "tripDistance",
      shortLabel: "Trip distance",
      title: "Trip distance",
      meta: tripVehicleUnit === "mi" ? "Miles per trip" : "Kilometres per trip",
      metrics: buildTripDistanceMetrics(tripDistanceValues, tripVehicleUnit),
      values: tripDistanceValues,
      color: "var(--warn)",
      highlight: buildTripDistanceMetrics(tripDistanceValues, tripVehicleUnit)[0]?.value || "Pending",
      options: {
        yFormatter: (value) => formatAxisDistance(value, tripVehicleUnit),
        xLabels: tripDistanceLabels,
        yDomain: buildReadableChartRange(tripDistanceValues, {
          includeZero: true,
          paddingRatio: 0.12,
          minimumPadding: 1,
        }),
      },
    },
  ];
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

function buildPriceMetrics(entries) {
  if (!entries.length) {
    return [];
  }

  const values = entries.map((entry) => entry.resolvedPricePerLiter);
  const latest = entries.at(-1)?.resolvedPricePerLiter;
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

function getResolvedFillUpPricePerLiter(entry) {
  if (Number.isFinite(entry?.pricePerLiter) && entry.pricePerLiter > 0) {
    return entry.pricePerLiter;
  }

  if (
    Number.isFinite(entry?.totalCost) &&
    entry.totalCost > 0 &&
    Number.isFinite(entry?.liters) &&
    entry.liters > 0
  ) {
    return entry.totalCost / entry.liters;
  }

  return null;
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

function handleDashboardFocusClick(event) {
  const button = event.target.closest("[data-chart-focus]");
  if (!button) {
    return;
  }
  dashboardFocus = button.dataset.chartFocus || "efficiency";
  renderCharts();
}

function renderHeroChart(values, color, options = {}) {
  if (values.length < 2) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const domain = options.yDomain || {};
  const min = Number.isFinite(domain.min) ? domain.min : Math.min(...values);
  const max = Number.isFinite(domain.max) ? domain.max : Math.max(...values);
  const mid = min + (max - min) / 2;
  const areaBaseY = 84;
  const points = values.map((value, index) => {
    const x = 28 + (index / Math.max(values.length - 1, 1)) * 126;
    const y = areaBaseY - ((value - min) / Math.max(max - min, 1)) * 58;
    return { x, y, value };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const maxPoint = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const minPoint = points.reduce((best, point) => (point.value < best.value ? point : best), points[0]);
  const yFormatter = options.yFormatter || ((value) => formatNumber(value, 1));
  const unit = options.yUnit || '';

  return `
    <svg viewBox="0 0 180 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${renderChartAxes({
        minLabel: yFormatter(min),
        midLabel: yFormatter(mid),
        maxLabel: yFormatter(max),
        xTicks: buildDistributedXAxisTicks(options.xLabels || [], {
          startX: 28,
          endX: 154,
          maxTicks: 3,
        }),
        width: 180,
        x1: 28,
        x2: 154,
        yBottom: 84,
        yMid: 56,
        yTop: 28,
        textOffset: 4,
      })}
      <polyline
        fill="none"
        stroke="${color}"
        stroke-opacity="0.16"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${linePoints}"
      />
      <polyline
        fill="none"
        stroke="${color}"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${linePoints}"
      />
      ${renderChartPoint(maxPoint, "up")}
      ${renderChartPoint(minPoint, "down")}
    </svg>
  `;
}

function renderLineChart(values, color, options = {}) {
  if (values.length < 2) {
    return '<p class="empty">More data will draw this chart.</p>';
  }

  const domain = options.yDomain || {};
  const min = Number.isFinite(domain.min) ? domain.min : Math.min(...values);
  const max = Number.isFinite(domain.max) ? domain.max : Math.max(...values);
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
        xTicks: buildDistributedXAxisTicks(options.xLabels || [], {
          startX: 32,
          endX: 150,
          maxTicks: 3,
        }),
      })}
      <polyline
        fill="none"
        stroke="${color}"
        stroke-opacity="0.14"
        stroke-width="3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${points}"
      />
      <polyline
        fill="none"
        stroke="${color}"
        stroke-width="1.25"
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

  const domain = options.yDomain || {};
  const min = Number.isFinite(domain.min) ? domain.min : 0;
  const max = Number.isFinite(domain.max) ? domain.max : Math.max(...values, 1);
  const mid = min + (max - min) / 2;
  const yFormatter = options.yFormatter || ((value) => formatNumber(value, 1));

  const bars = values
    .slice(-8)
    .map((value, index, series) => {
      const barWidth = 112 / series.length;
      const x = 34 + index * barWidth;
      const height = ((value - min) / Math.max(max - min, 1)) * 58;
      return `<rect x="${x}" y="${86 - height}" width="${Math.max(barWidth - 2, 4)}" height="${Math.max(height, value > 0 ? 2 : 0)}" rx="3" fill="${color}" opacity="0.86" />`;
    })
    .join("");

  return `
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${renderChartAxes({
        minLabel: yFormatter(min),
        midLabel: yFormatter(mid),
        maxLabel: yFormatter(max),
        xTicks: buildBarXAxisTicks((options.xLabels || []).slice(-8)),
      })}
      ${bars}
    </svg>
  `;
}

function renderChartAxes({
  minLabel,
  midLabel,
  maxLabel,
  xTicks = [],
  width = 160,
  x1 = 30,
  x2 = 150,
  yBottom = 74,
  yMid = 48,
  yTop = 22,
  textOffset = 2,
}) {
  return `
    <g class="chart-axis-group">
      <line x1="${x1}" y1="${yBottom}" x2="${x2}" y2="${yBottom}" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="${x1}" y1="${yMid}" x2="${x2}" y2="${yMid}" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="${x1}" y1="${yTop}" x2="${x2}" y2="${yTop}" stroke="var(--chart-axis-soft)" stroke-width="0.8" />
      <line x1="${x1}" y1="${yBottom}" x2="${x2}" y2="${yBottom}" stroke="var(--chart-axis)" stroke-width="1" />
      <text x="${x1 - textOffset}" y="${yBottom + 2}" text-anchor="end" class="chart-axis-text">${escapeHtml(minLabel)}</text>
      <text x="${x1 - textOffset}" y="${yMid + 2}" text-anchor="end" class="chart-axis-text">${escapeHtml(midLabel)}</text>
      <text x="${x1 - textOffset}" y="${yTop + 2}" text-anchor="end" class="chart-axis-text">${escapeHtml(maxLabel)}</text>
      ${renderXAxisTicks(xTicks, yBottom + 18)}
    </g>
  `;
}

function renderChartPoint(point, direction) {
  const dotColor = direction === "up" ? "var(--sage)" : "var(--warn)";

  return `
    <g class="chart-point">
      <circle cx="${point.x}" cy="${point.y}" r="5.25" fill="${dotColor}" opacity="0.18" />
      <circle cx="${point.x}" cy="${point.y}" r="3.1" fill="${dotColor}" />
    </g>
  `;
}

function renderReports() {
  const fillUps = getFilteredFillUps();
  const trips = getFilteredTrips();
  const reports = buildReports(fillUps, trips);
  const reportSections = [
    {
      id: "costs",
      title: "Cost reports",
      description: "Spend across fuel, ownership, months, and years.",
    },
    {
      id: "distance",
      title: "Distance travelled",
      description: "How far the selected vehicle or garage has actually been driven.",
    },
    {
      id: "performance",
      title: "Performance reports",
      description: "Efficiency, trip behavior, weather impact, and vehicle comparisons.",
    },
    {
      id: "planning",
      title: "Planning reports",
      description: "Forward-looking summaries and simple forecasting.",
    },
  ];

  elements.reportGrid.innerHTML = reportSections
    .map((section) => {
      const sectionReports = reports.filter((report) => report.section === section.id);
      if (!sectionReports.length) {
        return "";
      }

      return `
        <section class="report-section">
          <div class="metric-section-header">
            <div>
              <p class="eyebrow">Reports</p>
              <h2>${escapeHtml(section.title)}</h2>
            </div>
            <p class="metric-section-copy">${escapeHtml(section.description)}</p>
          </div>
          <div class="report-grid">
            ${sectionReports.map((report) => renderReportCard(report)).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderReportCard(report) {
  return `
    <article class="report-card${report.emphasis ? " emphasis" : ""}">
      <div class="report-card-head">
        <div>
          <h3>${escapeHtml(report.title)}</h3>
          <p class="report-summary">${escapeHtml(report.summary)}</p>
        </div>
        ${report.badge ? `<span class="report-badge">${escapeHtml(report.badge)}</span>` : ""}
      </div>
      <div class="report-metrics">
        ${report.metrics
          .map(
            (metric) => `
              <div class="report-metric">
                <span class="report-metric-label">${escapeHtml(metric.label)}</span>
                <strong class="report-metric-value">${escapeHtml(metric.value)}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function buildReports(fillUps, trips) {
  const ownershipCosts = getFilteredOwnershipCosts();
  const totals = summarizeEntries(fillUps, trips, ownershipCosts);
  const monthSeries = buildMonthlySpendSeries(fillUps, trips, ownershipCosts, { limit: null });
  const fuelMonthSeries = buildMonthlyFuelSpendSeries(fillUps, { limit: null });
  const yearSeries = buildYearlySpendSeries(fillUps, trips, ownershipCosts);
  const currentMonth = fuelMonthSeries.at(-1);
  const previousMonth = fuelMonthSeries.at(-2);
  const peakMonth = fuelMonthSeries.length
    ? fuelMonthSeries.reduce((best, item) => (item.value > best.value ? item : best), fuelMonthSeries[0])
    : null;
  const yearlyPeak = yearSeries.length
    ? yearSeries.reduce((best, item) => (item.totalSpend > best.totalSpend ? item : best), yearSeries[0])
    : null;
  const efficiencies = fillUps
    .filter((entry) => Number.isFinite(entry.efficiency))
    .map((entry) =>
      normalizeEfficiency(
        entry.efficiency,
        getVehicleById(entry.vehicleId)?.distanceUnit || "km"
      )
    );
  const rollingEfficiency = efficiencies.slice(-3);
  const tripCategories = summarizeTripCategories(trips);
  const weatherImpact = summarizeWeatherImpact(fillUps);
  const vehicleComparison = summarizeVehicleComparison(fillUps, trips);
  const forecast = projectNextMonthSpend(fillUps, trips);
  const longestTripDistance = maxOf(
    trips.map((trip) =>
      normalizeTripDistance(
        trip,
        totals.distanceUnit === "mixed" ? "km" : totals.distanceUnit
      )
    )
  );
  const actualMileageCovered = calculateLoggedMileage(
    fillUps,
    totals.distanceUnit === "mixed" ? "km" : totals.distanceUnit
  );
  const currentYearDistance = calculateLoggedMileage(
    fillUps,
    totals.distanceUnit === "mixed" ? "km" : totals.distanceUnit,
    { year: new Date().getFullYear() }
  );
  const monthlyDistanceAverage = monthSeries.length
    ? totals.tripDistance / monthSeries.length
    : 0;
  const yearlyFigureSummary = yearSeries.length
    ? yearSeries.map((item) => `${item.year}: ${formatCurrency(item.totalSpend)}`).join(" · ")
    : "Yearly figures will appear once more data is logged.";

  return [
    {
      section: "costs",
      title: "Fuel cost report",
      summary: "How much fuel is costing month to month and across the year.",
      badge: currentMonth ? `${currentMonth.label}` : "",
      emphasis: true,
      metrics: [
        { label: "This month", value: currentMonth ? formatCurrency(currentMonth.value) : formatCurrency(0) },
        { label: "This year", value: formatCurrency(yearSeries.at(-1)?.fuelCost || 0) },
        { label: "Avg fill-up", value: formatCurrency(fillUps.length ? totals.totalFuelCost / fillUps.length : 0) },
        { label: "Peak month", value: peakMonth ? `${peakMonth.label} · ${formatCurrency(peakMonth.value)}` : "Pending" },
      ],
    },
    {
      section: "costs",
      title: "Ownership cost report",
      summary: "Annual car-running costs beyond fuel, broken down by service, tax, payments, and insurance.",
      badge: ownershipCosts.length ? `${ownershipCosts.length} costs logged` : "",
      metrics: buildOwnershipReportMetrics(yearSeries),
    },
    {
      section: "performance",
      title: "Efficiency report",
      summary: "Performance trend across recent full tanks, with rolling context.",
      badge: state.settings.consumptionMode.toUpperCase(),
      metrics: [
        { label: "Latest", value: totals.averageEfficiencyLabel === "Pending" ? "Pending" : buildEfficiencyMetrics(efficiencies)[0]?.value || "Pending" },
        { label: "Rolling avg", value: formatEfficiencyFromNormalized(averageOf(rollingEfficiency), state.settings.consumptionMode) },
        { label: "Best", value: buildEfficiencyMetrics(efficiencies)[2]?.value || "Pending" },
        { label: "Worst", value: formatEfficiencyFromNormalized(minOf(efficiencies), state.settings.consumptionMode) },
      ],
    },
    {
      section: "distance",
      title: "Distance travelled report",
      summary: "Separate actual odometer mileage from trip entries so historical trips do not inflate total distance covered.",
      badge: trips.length ? `${trips.length} trips tracked` : "",
      metrics: [
        { label: "Actual mileage covered", value: formatDistance(actualMileageCovered, totals.distanceUnit) },
        { label: "Trip distance logged", value: formatDistance(totals.tripDistance, totals.distanceUnit) },
        { label: "This year", value: formatDistance(currentYearDistance, totals.distanceUnit) },
        { label: "Avg per trip", value: formatDistance(totals.averageTripDistance, totals.distanceUnit) },
        { label: "Avg per month", value: formatDistance(monthlyDistanceAverage, totals.distanceUnit) },
        { label: "Longest trip", value: formatDistance(longestTripDistance, totals.distanceUnit) },
        { label: "Top category", value: tripCategories[0] ? `${tripCategories[0].label} · ${tripCategories[0].count}` : "Pending" },
      ],
    },
    {
      section: "performance",
      title: "Trip report",
      summary: "Trip-only distance, trip mix, and estimated fuel cost for driving activity.",
      badge: `${trips.length} trips`,
      metrics: [
        { label: "Trip distance", value: formatDistance(totals.tripDistance, totals.distanceUnit) },
        { label: "Avg trip", value: formatDistance(totals.averageTripDistance, totals.distanceUnit) },
        { label: "Longest trip", value: formatDistance(longestTripDistance, totals.distanceUnit) },
        { label: "Top category", value: tripCategories[0] ? `${tripCategories[0].label} · ${tripCategories[0].count}` : "Pending" },
      ],
    },
    {
      section: "performance",
      title: "Vehicle comparison report",
      summary: "Which vehicle is taking the most spend and which one is performing best.",
      badge: vehicleComparison.badge,
      metrics: vehicleComparison.metrics,
    },
    {
      section: "costs",
      title: "Monthly summary report",
      summary: "A quick month-over-month view for spend and movement.",
      badge: monthSeries.length ? `${monthSeries.length} months tracked` : "",
      metrics: [
        { label: "Current month", value: currentMonth ? formatCurrency(currentMonth.value) : formatCurrency(0) },
        { label: "Previous month", value: previousMonth ? formatCurrency(previousMonth.value) : "Pending" },
        { label: "Change", value: currentMonth && previousMonth ? formatDeltaCurrency(currentMonth.value - previousMonth.value) : "Pending" },
        { label: "Best month", value: peakMonth ? `${peakMonth.label} · ${formatCurrency(peakMonth.value)}` : "Pending" },
      ],
    },
    {
      section: "performance",
      title: "Weather impact report",
      summary: "Checks whether colder or warmer conditions are lining up with efficiency changes.",
      badge: weatherImpact.badge,
      metrics: weatherImpact.metrics,
    },
    {
      section: "planning",
      title: "Forecast report",
      summary: "Simple projection based on the most recent spend run-rate.",
      badge: forecast.badge,
      metrics: [
        { label: "Next month", value: formatCurrency(forecast.nextMonth) },
        { label: "Year run-rate", value: formatCurrency(forecast.yearRunRate) },
        { label: "Recent 90 days", value: formatCurrency(forecast.recentQuarterSpend) },
        { label: "Trend", value: forecast.trendLabel },
      ],
    },
    {
      section: "costs",
      title: "Yearly figures",
      summary: yearlyFigureSummary,
      badge: yearlyPeak ? `${yearlyPeak.year} peak` : "",
      metrics: buildYearlyFigureMetrics(yearSeries),
    },
  ];
}

function renderSectionVisibility() {
  elements.vehicleCard.hidden = !sectionVisibility.vehicle;
  elements.settingsCard.hidden = !sectionVisibility.settings;
  elements.showVehicleSectionBtn.setAttribute(
    "aria-expanded",
    String(sectionVisibility.vehicle)
  );
  elements.showSettingsSectionBtn.setAttribute(
    "aria-expanded",
    String(sectionVisibility.settings)
  );
  elements.showVehicleSectionBtn.textContent = "Add a car";
  elements.showSettingsSectionBtn.textContent = "Open settings";
}

function renderFoldableSections() {
  for (const button of document.querySelectorAll("[data-fold-toggle]")) {
    const sectionKey = button.dataset.foldToggle;
    const content = document.querySelector(`[data-fold-content="${sectionKey}"]`);
    const isExpanded = foldableSectionState[sectionKey] !== false;
    if (content) {
      content.hidden = !isExpanded;
    }
    button.setAttribute("aria-expanded", String(isExpanded));
    button.textContent = isExpanded ? "Hide" : "Show";
  }
}

function syncResponsiveState(forceApply = false, isMobile = mobileViewport.matches) {
  if (!forceApply && isMobile === lastIsMobileViewport) {
    return;
  }

  if (isMobile) {
    Object.assign(foldableSectionState, {
      dashboard: true,
      reports: false,
      fillUps: true,
      trips: false,
      ownership: false,
      fuelHistory: true,
      tripHistory: false,
      ownershipHistory: false,
    });
  } else {
    Object.assign(foldableSectionState, {
      dashboard: true,
      reports: true,
      fillUps: true,
      trips: true,
      ownership: true,
      fuelHistory: true,
      tripHistory: true,
      ownershipHistory: true,
    });
  }

  lastIsMobileViewport = isMobile;
}

function toggleFoldableSection(sectionKey) {
  if (!(sectionKey in foldableSectionState)) {
    return;
  }
  foldableSectionState[sectionKey] = !foldableSectionState[sectionKey];
  renderFoldableSections();
}

function revealSection(sectionKey) {
  const cardMap = {
    vehicle: elements.vehicleCard,
    settings: elements.settingsCard,
  };
  sectionVisibility[sectionKey] = true;
  renderSectionVisibility();
  cardMap[sectionKey]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideSection(sectionKey) {
  if (!sectionVisibility[sectionKey]) {
    return;
  }
  sectionVisibility[sectionKey] = false;
  renderSectionVisibility();
}

function toggleSection(sectionKey) {
  if (sectionVisibility[sectionKey]) {
    hideSection(sectionKey);
    return;
  }
  revealSection(sectionKey);
}

function setTripWorkspaceFocus(target) {
  if (target !== "planner" && target !== "trip") {
    return;
  }

  tripWorkspaceFocus = target;
  renderTripWorkspace();

  const card =
    target === "planner" ? elements.routePlannerCard : elements.tripEntryCard;
  card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function summarizeTripCategories(trips) {
  const categories = new Map();
  for (const trip of trips) {
    const label = trip.category || "Uncategorised";
    categories.set(label, (categories.get(label) || 0) + 1);
  }
  return [...categories.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function summarizeVehicleComparison(fillUps, trips) {
  const selectedVehicle = elements.vehicleFilter.value;
  if (selectedVehicle !== "all") {
    const vehicle = getVehicleById(selectedVehicle);
    const vehicleFillUps = fillUps.filter((entry) => entry.vehicleId === selectedVehicle);
    const vehicleTrips = trips.filter((trip) => trip.vehicleId === selectedVehicle);
    const vehicleOwnershipCosts = state.ownershipCosts.filter((cost) => cost.vehicleId === selectedVehicle);
    const totals = summarizeEntries(vehicleFillUps, vehicleTrips, vehicleOwnershipCosts);
    const costTotals = getVehicleCostTotals(selectedVehicle);
    return {
      badge: vehicle?.name || "Vehicle view",
      metrics: [
        { label: "All-time cost", value: formatCurrency(costTotals.allTimeTotal) },
        { label: "This year", value: formatCurrency(costTotals.currentYearTotal) },
        {
          label: "Actual mileage",
          value: formatDistance(
            calculateLoggedMileage(vehicleFillUps, totals.distanceUnit === "mixed" ? "km" : totals.distanceUnit),
            totals.distanceUnit
          ),
        },
        { label: "Avg efficiency", value: totals.averageEfficiencyLabel },
        { label: "Fill-ups", value: String(vehicleFillUps.length) },
      ],
    };
  }

  const byVehicle = state.vehicles
    .map((vehicle) => {
      const vehicleFillUps = fillUps.filter((entry) => entry.vehicleId === vehicle.id);
      const vehicleTrips = trips.filter((trip) => trip.vehicleId === vehicle.id);
      const vehicleOwnershipCosts = state.ownershipCosts.filter((cost) => cost.vehicleId === vehicle.id);
      const totals = summarizeEntries(vehicleFillUps, vehicleTrips, vehicleOwnershipCosts);
      return {
        vehicle,
        totals,
        spend: totals.totalSpend,
        efficiencyScore: totals.averageEfficiencyNormalized || 0,
      };
    })
    .filter((item) => item.spend || item.efficiencyScore);

  const biggestSpend = byVehicle.reduce(
    (best, item) => (!best || item.spend > best.spend ? item : best),
    null
  );
  const bestEfficiency = byVehicle.reduce(
    (best, item) => (!best || item.efficiencyScore > best.efficiencyScore ? item : best),
    null
  );

  return {
    badge: `${byVehicle.length || 0} vehicles`,
    metrics: [
      { label: "Highest spend", value: biggestSpend ? `${biggestSpend.vehicle.name} · ${formatCurrency(biggestSpend.spend)}` : "Pending" },
      { label: "Best efficiency", value: bestEfficiency ? `${bestEfficiency.vehicle.name} · ${bestEfficiency.totals.averageEfficiencyLabel}` : "Pending" },
      { label: "Total garage spend", value: formatCurrency(byVehicle.reduce((sum, item) => sum + item.spend, 0)) },
      { label: "Tracked vehicles", value: String(byVehicle.length) },
    ],
  };
}

function summarizeWeatherImpact(fillUps) {
  const entries = fillUps.filter(
    (entry) => Number.isFinite(entry.efficiency) && Number.isFinite(entry.weather?.tempC)
  );
  if (entries.length < 2) {
    return {
      badge: "Needs weather data",
      metrics: [
        { label: "Cold efficiency", value: "Pending" },
        { label: "Warm efficiency", value: "Pending" },
        { label: "Gap", value: "Pending" },
        { label: "Weather logs", value: String(entries.length) },
      ],
    };
  }

  const cold = entries.filter((entry) => entry.weather.tempC < 10);
  const warm = entries.filter((entry) => entry.weather.tempC >= 10);
  const coldAvg = averageOf(
    cold.map((entry) =>
      normalizeEfficiency(entry.efficiency, getVehicleById(entry.vehicleId)?.distanceUnit || "km")
    )
  );
  const warmAvg = averageOf(
    warm.map((entry) =>
      normalizeEfficiency(entry.efficiency, getVehicleById(entry.vehicleId)?.distanceUnit || "km")
    )
  );

  return {
    badge: `${entries.length} weather-tagged fills`,
    metrics: [
      { label: "Cold efficiency", value: formatEfficiencyFromNormalized(coldAvg, state.settings.consumptionMode) },
      { label: "Warm efficiency", value: formatEfficiencyFromNormalized(warmAvg, state.settings.consumptionMode) },
      { label: "Gap", value: describeEfficiencyDifference(warmAvg, coldAvg) },
      { label: "Avg temperature", value: `${formatNumber(averageOf(entries.map((entry) => entry.weather.tempC)), 1)}C` },
    ],
  };
}

function projectNextMonthSpend(fillUps, trips) {
  const ownershipCosts = getFilteredOwnershipCosts();
  const allItems = [...fillUps, ...trips, ...ownershipCosts].sort((a, b) => a.date.localeCompare(b.date));
  if (!allItems.length) {
    return {
      badge: "No spend history",
      nextMonth: 0,
      yearRunRate: 0,
      recentQuarterSpend: 0,
      trendLabel: "Pending",
    };
  }

  const lastDate = new Date(allItems.at(-1).date);
  const cutoff = new Date(lastDate);
  cutoff.setDate(cutoff.getDate() - 90);
  const recentItems = allItems.filter((item) => new Date(item.date) >= cutoff);
  const recentQuarterSpend = recentItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const nextMonth = recentQuarterSpend / 3 || projectMonthlySpend(fillUps, trips, ownershipCosts);
  const monthlyAverage = projectMonthlySpend(fillUps, trips, ownershipCosts);

  return {
    badge: recentItems.length ? "Recent spend model" : "Simple monthly projection",
    nextMonth,
    yearRunRate: nextMonth * 12,
    recentQuarterSpend,
    trendLabel: nextMonth >= monthlyAverage ? "Holding or rising" : "Cooling down",
  };
}

function buildYearlyFigureMetrics(yearSeries) {
  if (!yearSeries.length) {
    return [
      { label: "Latest year", value: "Pending" },
      { label: "Fuel spend", value: "Pending" },
      { label: "Trip fuel", value: "Pending" },
      { label: "Ownership", value: "Pending" },
      { label: "Distance", value: "Pending" },
    ];
  }

  const latest = yearSeries.at(-1);
  return [
    { label: "Latest year", value: String(latest.year) },
    { label: "Fuel spend", value: formatCurrency(latest.fuelCost) },
    { label: "Trip fuel", value: formatCurrency(latest.tripCost) },
    { label: "Ownership", value: formatCurrency(latest.ownershipCost || 0) },
    { label: "Distance", value: formatDistance(latest.tripDistance, latest.distanceUnit) },
  ];
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
      body: formatCurrency(projectMonthlySpend(fillUps, trips, getFilteredOwnershipCosts())),
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
      '<tr class="table-empty-row"><td colspan="8" class="empty">No fill-ups yet. Add your first stop above.</td></tr>';
    return;
  }

  elements.fillUpTableBody.innerHTML = entries
    .map((entry) => {
      const vehicle = getVehicleById(entry.vehicleId);
      const metrics = computeEntryMetrics(entry, vehicle);
      return `
        <tr>
          <td data-label="Date">${entry.date}</td>
          <td data-label="Vehicle"><strong>${escapeHtml(vehicle?.name || "Unknown vehicle")}</strong><span class="meta">${escapeHtml(entry.station || "No station")}</span></td>
          <td data-label="Distance">${metrics.distanceLabel}</td>
          <td data-label="Fuel">${formatNumber(entry.liters, 2)} L</td>
          <td data-label="Cost">${formatCurrency(entry.totalCost)}</td>
          <td data-label="Efficiency">${metrics.efficiencyLabel}</td>
          <td data-label="Weather">${formatWeather(entry.weather)}</td>
          <td data-label="Actions">
            <div class="table-actions">
              <button class="inline-link" data-edit-fillup="${entry.id}" type="button">Edit</button>
              <button class="danger-link" data-delete-fillup="${entry.id}" type="button">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  for (const button of elements.fillUpTableBody.querySelectorAll("[data-edit-fillup]")) {
    button.addEventListener("click", () => startFillUpEdit(button.dataset.editFillup));
  }

  for (const button of elements.fillUpTableBody.querySelectorAll("[data-delete-fillup]")) {
    button.addEventListener("click", () => void deleteFillUp(button.dataset.deleteFillup));
  }
}

function renderTripTable() {
  const trips = [...getFilteredTrips()].sort((a, b) => b.date.localeCompare(a.date));
  if (!trips.length) {
    elements.tripTableBody.innerHTML =
      '<tr class="table-empty-row"><td colspan="8" class="empty">No trips yet. Add your first trip above.</td></tr>';
    return;
  }

  elements.tripTableBody.innerHTML = trips
    .map((trip) => {
      const vehicle = getVehicleById(trip.vehicleId);
      return `
        <tr>
          <td data-label="Date">${trip.date}</td>
          <td data-label="Vehicle"><strong>${escapeHtml(vehicle?.name || "Unknown vehicle")}</strong><span class="meta">${escapeHtml(trip.startLocation || "Unknown start")} → ${escapeHtml(trip.endLocation || "Unknown end")}</span></td>
          <td data-label="Distance">${formatDistance(trip.distance, vehicle?.distanceUnit || "km")}</td>
          <td data-label="Category">${escapeHtml(trip.category || "Uncategorised")}</td>
          <td data-label="Cost">${formatCurrency(trip.totalCost || 0)}<span class="meta">${escapeHtml(buildTripCostMeta(trip))}</span></td>
          <td data-label="Efficiency">${formatTripEfficiency(trip, vehicle?.distanceUnit || "km")}<span class="meta">${escapeHtml(buildTripConsumptionMeta(trip))}</span></td>
          <td data-label="Weather">${formatWeather(trip.weather)}</td>
          <td data-label="Actions"><button class="danger-link" data-delete-trip="${trip.id}" type="button">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  for (const button of elements.tripTableBody.querySelectorAll("[data-delete-trip]")) {
    button.addEventListener("click", () => void deleteTrip(button.dataset.deleteTrip));
  }
}

function renderOwnershipCostTable() {
  const costs = [...getFilteredOwnershipCosts()].sort((a, b) => b.date.localeCompare(a.date));
  if (!costs.length) {
    elements.ownershipCostTableBody.innerHTML =
      '<tr class="table-empty-row"><td colspan="6" class="empty">No ownership costs yet. Add service, tax, car payments, or insurance above.</td></tr>';
    return;
  }

  elements.ownershipCostTableBody.innerHTML = costs
    .map((cost) => {
      const vehicle = getVehicleById(cost.vehicleId);
      return `
        <tr>
          <td data-label="Date">${cost.date}</td>
          <td data-label="Vehicle">${escapeHtml(vehicle?.name || "Unknown vehicle")}</td>
          <td data-label="Type">${escapeHtml(formatOwnershipCategory(cost.category))}</td>
          <td data-label="Cost">${formatCurrency(cost.totalCost || 0)}</td>
          <td data-label="Notes">${escapeHtml(cost.notes || "No notes")}</td>
          <td data-label="Actions">
            <div class="table-actions">
              <button class="inline-link" data-edit-ownership-cost="${cost.id}" type="button">Edit</button>
              <button class="danger-link" data-delete-ownership-cost="${cost.id}" type="button">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  for (const button of elements.ownershipCostTableBody.querySelectorAll("[data-edit-ownership-cost]")) {
    button.addEventListener("click", () =>
      startOwnershipCostEdit(button.dataset.editOwnershipCost)
    );
  }

  for (const button of elements.ownershipCostTableBody.querySelectorAll("[data-delete-ownership-cost]")) {
    button.addEventListener("click", () => void deleteOwnershipCost(button.dataset.deleteOwnershipCost));
  }
}

function renderOwnershipBreakdown() {
  const breakdown = buildOwnershipYearBreakdown(getFilteredOwnershipCosts());
  if (!breakdown.length) {
    elements.ownershipBreakdownBody.innerHTML =
      '<tr class="table-empty-row"><td colspan="6" class="empty">Yearly totals appear after you log ownership costs.</td></tr>';
    return;
  }

  elements.ownershipBreakdownBody.innerHTML = breakdown
    .map(
      (year) => `
        <tr>
          <td data-label="Year">${year.year}</td>
          <td data-label="Service">${formatCurrency(year.service)}</td>
          <td data-label="Tax">${formatCurrency(year.tax)}</td>
          <td data-label="Car payments">${formatCurrency(year.carPayment)}</td>
          <td data-label="Insurance">${formatCurrency(year.insurance)}</td>
          <td data-label="Total"><strong>${formatCurrency(year.total)}</strong></td>
        </tr>
      `
    )
    .join("");
}

function updateFormAvailability() {
  const enabled = hasProfileSession();
  setFormInteractive(elements.vehicleForm, enabled);
  setFormInteractive(elements.fillUpForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.routePlannerForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.tripForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.ownershipCostForm, enabled && state.vehicles.length > 0);
  setFormInteractive(elements.settingsForm, enabled);
  elements.syncNowBtn.disabled = !enabled || syncInFlight;
  elements.switchProfileBtn.disabled = !enabled;
  elements.backfillWeatherBtn.disabled =
    !enabled || !state.fillUps.some((entry) => !entry.weather);
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
    getFormField(elements.vehicleForm, "registrationNumber").value
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
  const currentName = getFormField(elements.vehicleForm, "name").value.trim();
  const shouldReplaceName =
    !currentName || currentName === getFormField(elements.vehicleForm, "name").defaultValue;

  getFormField(elements.vehicleForm, "registrationNumber").value = registrationNumber;
  getFormField(elements.vehicleForm, "fuelType").value = mapFuelTypeForForm(vehicle.fuelType);
  getFormField(elements.vehicleForm, "distanceUnit").value = "mi";
  if (vehicle.estimatedConsumption?.mpgUk) {
    getFormField(elements.vehicleForm, "profileMpgUk").value = formatFixedInput(
      vehicle.estimatedConsumption.mpgUk,
      1
    );
  }

  if (shouldReplaceName) {
    getFormField(elements.vehicleForm, "name").value =
      [year, make].filter(Boolean).join(" ") || registrationNumber;
  }
}

function resetVehicleLookupUi() {
  vehicleLookupResult = null;
  getFormField(elements.vehicleForm, "registrationNumber").value = "";
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

function resetVehicleForm() {
  editingVehicleId = "";
  elements.vehicleForm.reset();
  getFormField(elements.vehicleForm, "distanceUnit").value = "mi";
  getFormField(elements.vehicleForm, "fuelType").value = "Petrol";
  getSubmitButton(elements.vehicleForm).textContent = "Save vehicle";
  elements.cancelVehicleEditBtn.hidden = true;
  resetVehicleLookupUi();
}

function resetFillUpForm() {
  editingFillUpId = "";
  elements.fillUpForm.reset();
  getFormField(elements.fillUpForm, "date").value = getLocalDateString();
  if (state.vehicles[0]) {
    getFormField(elements.fillUpForm, "vehicleId").value = state.vehicles[0].id;
  }
  getSubmitButton(elements.fillUpForm).textContent = "Save fill-up";
  elements.cancelFillUpEditBtn.hidden = true;
  resetFillUpFormDerivedState();
}

function resetOwnershipCostForm() {
  editingOwnershipCostId = "";
  elements.ownershipCostForm.reset();
  getFormField(elements.ownershipCostForm, "date").value = getLocalDateString();
  getFormField(elements.ownershipCostForm, "category").value = "service";
  if (state.vehicles[0]) {
    getFormField(elements.ownershipCostForm, "vehicleId").value = state.vehicles[0].id;
  }
  getSubmitButton(elements.ownershipCostForm).textContent = "Save cost";
  elements.cancelOwnershipCostEditBtn.hidden = true;
}

function startVehicleEdit(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) {
    return;
  }

  revealSection("vehicle");
  editingVehicleId = vehicle.id;
  vehicleLookupResult = vehicle.registrationNumber
    ? {
        registrationNumber: vehicle.registrationNumber,
        fuelType: vehicle.fuelType,
        make: vehicle.make,
        yearOfManufacture: vehicle.yearOfManufacture,
        monthOfFirstRegistration: vehicle.monthOfFirstRegistration,
        engineCapacity: vehicle.engineCapacity,
        co2Emissions: vehicle.co2Emissions,
        estimatedConsumption: vehicle.estimatedConsumption,
        lookupSource: vehicle.lookupSource,
      }
    : null;
  getFormField(elements.vehicleForm, "registrationNumber").value = formatRegistrationForDisplay(
    vehicle.registrationNumber
  );
  getFormField(elements.vehicleForm, "name").value = vehicle.name;
  getFormField(elements.vehicleForm, "fuelType").value = vehicle.fuelType;
  getFormField(elements.vehicleForm, "tankSize").value = vehicle.tankSize ?? "";
  getFormField(elements.vehicleForm, "distanceUnit").value = vehicle.distanceUnit || "mi";
  getFormField(elements.vehicleForm, "profileMpgUk").value = vehicle.profileMpgUk ?? "";
  getSubmitButton(elements.vehicleForm).textContent = "Update vehicle";
  elements.cancelVehicleEditBtn.hidden = false;
  renderVehicleLookupSummary(vehicleLookupResult);
  setVehicleLookupStatus(
    vehicle.registrationNumber ? "good" : "empty",
    vehicle.registrationNumber
      ? "Editing vehicle details. Run plate lookup again if you want to refresh the DVLA estimate."
      : "Set the vehicle MPG manually, or add a registration plate to estimate it."
  );
}

function startFillUpEdit(entryId) {
  const entry = state.fillUps.find((fillUp) => fillUp.id === entryId);
  if (!entry) {
    return;
  }

  editingFillUpId = entry.id;
  getFormField(elements.fillUpForm, "vehicleId").value = entry.vehicleId;
  getFormField(elements.fillUpForm, "date").value = entry.date;
  getFormField(elements.fillUpForm, "odometer").value = entry.odometer ?? "";
  getFormField(elements.fillUpForm, "liters").value = entry.liters ?? "";
  getFormField(elements.fillUpForm, "totalCost").value = entry.totalCost ?? "";
  getFormField(elements.fillUpForm, "pricePerLiter").value = entry.pricePerLiter ?? "";
  getFormField(elements.fillUpForm, "station").value = entry.station || "";
  getFormField(elements.fillUpForm, "isPartial").value = String(Boolean(entry.isPartial));
  getFormField(elements.fillUpForm, "notes").value = entry.notes || "";
  getSubmitButton(elements.fillUpForm).textContent = "Update fill-up";
  elements.cancelFillUpEditBtn.hidden = false;
  lastFillUpPricingField = "";
  syncFillUpPricingFields();
  elements.fillUpForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function startOwnershipCostEdit(entryId) {
  const cost = state.ownershipCosts.find((item) => item.id === entryId);
  if (!cost) {
    return;
  }

  editingOwnershipCostId = cost.id;
  getFormField(elements.ownershipCostForm, "vehicleId").value = cost.vehicleId;
  getFormField(elements.ownershipCostForm, "date").value = cost.date;
  getFormField(elements.ownershipCostForm, "category").value = cost.category;
  getFormField(elements.ownershipCostForm, "totalCost").value = cost.totalCost ?? "";
  getFormField(elements.ownershipCostForm, "notes").value = cost.notes || "";
  getSubmitButton(elements.ownershipCostForm).textContent = "Update cost";
  elements.cancelOwnershipCostEditBtn.hidden = false;
  elements.ownershipCostForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleVehicleSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const registrationNumber = normalizeRegistration(formData.get("registrationNumber"));
  const profileMpgUk = numberOrNull(formData.get("profileMpgUk"));
  const lookupForVehicle =
    vehicleLookupResult &&
    vehicleLookupResult.registrationNumber === registrationNumber
      ? vehicleLookupResult
      : null;

  const vehiclePayload = {
    id: editingVehicleId || crypto.randomUUID(),
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
    profileMpgUk,
    profileMpgSource:
      profileMpgUk === null
        ? null
        : lookupForVehicle?.estimatedConsumption &&
            roundMaybe(lookupForVehicle.estimatedConsumption.mpgUk, 1) === roundMaybe(profileMpgUk, 1)
          ? "plate"
          : "manual",
    lookupSource: lookupForVehicle?.lookupSource || null,
  };

  if (editingVehicleId) {
    state.vehicles = state.vehicles.map((vehicle) =>
      vehicle.id === editingVehicleId ? vehiclePayload : vehicle
    );
  } else {
    state.vehicles.push(vehiclePayload);
  }

  resetVehicleForm();
  hideSection("vehicle");
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

  const form = elements.fillUpForm;
  const formData = new FormData(form);
  const pricing = resolveFillUpPricing({
    liters: numberOrNull(formData.get("liters")),
    totalCost: numberOrNull(formData.get("totalCost")),
    pricePerLiter: numberOrNull(formData.get("pricePerLiter")),
  });
  if (!pricing.isValid) {
    alert("Enter any two of volume, total cost, and price per litre.");
    return;
  }

  const liters = pricing.liters;
  const totalCost = pricing.totalCost;
  const vehicleId = formData.get("vehicleId").toString();
  const vehicle = getVehicleById(vehicleId);
  const existingFillUp = editingFillUpId
    ? state.fillUps.find((entry) => entry.id === editingFillUpId)
    : null;
  const nextDate = formData.get("date").toString();
  const nextStation = formData.get("station").toString().trim();
  const fillUp = {
    id: editingFillUpId || crypto.randomUUID(),
    vehicleId,
    date: nextDate,
    odometer: Number(formData.get("odometer")),
    liters,
    totalCost,
    pricePerLiter: pricing.pricePerLiter,
    station: nextStation,
    isPartial: formData.get("isPartial").toString() === "true",
    notes: formData.get("notes").toString().trim(),
    weather:
      existingFillUp &&
      existingFillUp.date === nextDate &&
      (existingFillUp.station || "") === nextStation
        ? existingFillUp.weather || null
        : await fetchWeatherForDate(nextDate, nextStation, { fallbackToHomeCity: true }),
  };

  if (editingFillUpId) {
    state.fillUps = state.fillUps.map((entry) =>
      entry.id === editingFillUpId ? fillUp : entry
    );
  } else {
    fillUp.efficiency = computeEfficiencyForNewFillUp(fillUp);
    state.fillUps.push(fillUp);
  }
  recomputeEfficiencies();

  resetFillUpForm();
  if (vehicle) {
    getFormField(form, "vehicleId").value = vehicle.id;
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

  const form = elements.tripForm;
  const formData = new FormData(form);
  const vehicleId = formData.get("vehicleId").toString();
  const vehicle = getVehicleById(vehicleId);
  const routeFields = getRoutePlannerFields();
  const startOdometer = numberOrNull(formData.get("startOdometer"));
  const endOdometer = numberOrNull(formData.get("endOdometer"));
  const odometerDistance =
    Number.isFinite(startOdometer) && Number.isFinite(endOdometer)
      ? endOdometer - startOdometer
      : null;
  const plannedDistance = numberOrNull(formData.get("plannedDistance"));
  const distance =
    Number.isFinite(odometerDistance) && odometerDistance > 0
      ? odometerDistance
      : plannedDistance;
  if (!Number.isFinite(distance) || distance <= 0) {
    alert("Add odometer values or plan a valid route first.");
    return;
  }

  const tripMpgUk = numberOrNull(formData.get("tripMpgUk"));
  const litersUsed = numberOrNull(formData.get("litersUsed"));
  const pricePerLiter = numberOrNull(formData.get("fuelPricePerLiter"));
  const routeType = normalizeRouteType(formData.get("routeType"));
  const routeAverageSpeedMph = numberOrNull(
    getFormField(form, "plannedDistance").dataset.routeAverageSpeedMph
  );
  const routeWaypoints = routeFields.routeWaypoints;
  const estimatedFuel = estimateTripFuel({
    vehicle,
    date: formData.get("date").toString(),
    startOdometer,
    distance,
    tripMpgUk,
    litersUsed,
    routeType,
  });
  const fuelLiters = litersUsed ?? estimatedFuel.estimatedLiters ?? null;
  const totalCost =
    Number.isFinite(pricePerLiter) && Number.isFinite(fuelLiters)
      ? roundMaybe(pricePerLiter * fuelLiters, 2)
      : 0;

  state.trips.push({
    id: crypto.randomUUID(),
    vehicleId,
    date: formData.get("date").toString(),
    startOdometer,
    endOdometer,
    distance,
    plannedDistance,
    plannedDurationSeconds: parseDurationInputToSeconds(formData.get("plannedDuration")),
    routeSource: Number.isFinite(plannedDistance) ? "osrm" : null,
    routeType,
    routeAverageSpeedMph,
    routePolyline: getFormField(form, "plannedDistance").dataset.routePolyline || "",
    routeWaypoints,
    category: formData.get("category").toString().trim(),
    totalCost,
    tripMpgUk,
    litersUsed,
    fuelPricePerLiter: pricePerLiter,
    startLocation: routeFields.startLocation,
    endLocation: routeFields.endLocation,
    notes: formData.get("notes").toString().trim(),
    weather: await fetchWeatherForDate(
      formData.get("date").toString(),
      routeFields.startLocation || routeFields.endLocation,
      { fallbackToHomeCity: true }
    ),
  });

  form.reset();
  getFormField(form, "date").value = getLocalDateString();
  if (vehicle) {
    getFormField(form, "vehicleId").value = vehicle.id;
  }
  resetTripFormDerivedState();
  syncTripFormDerivedFields();
  persistAndRender();
  await syncRemoteState();
}

async function handleResolveRoute() {
  const vehicle = getVehicleById(getFormField(elements.routePlannerForm, "vehicleId").value);
  if (!vehicle) {
    setRouteResolutionStatus("warn", "Pick a vehicle before checking the route.");
    return;
  }

  const routeFields = getRoutePlannerFields();
  if (!routeFields.startLocation || !routeFields.endLocation) {
    setRouteResolutionStatus("warn", "Enter a start and end location first.");
    return;
  }

  elements.resolveRouteBtn.disabled = true;
  resetPlannedRouteFields({ keepResolutionSummary: false });
  setRouteResolutionStatus("empty", "Checking the entered locations...");

  try {
    const response = await callApi("resolveRouteLocations", {
      origin: routeFields.startLocation,
      destination: routeFields.endLocation,
      waypoints: routeFields.routeWaypoints,
      countryCode: state.settings.countryCode || "",
    });

    resolvedRouteStops = Array.isArray(response.stops) ? response.stops : null;
    if (!resolvedRouteStops?.length) {
      throw new Error("No route locations were resolved.");
    }

    renderResolvedRouteSummary(resolvedRouteStops);
    elements.routePlanStatus.className = "lookup-status empty wide-field";
    elements.routePlanStatus.textContent =
      "Locations confirmed. You can plan the route now.";
    renderTripWorkspace();
  } catch (error) {
    resolvedRouteStops = null;
    renderResolvedRouteSummary(null);
    setRouteResolutionStatus(
      "warn",
      error instanceof Error && error.message
        ? error.message
        : "We could not confidently resolve the locations."
    );
    renderTripWorkspace();
  } finally {
    elements.resolveRouteBtn.disabled = false;
  }
}

async function handlePlanRoute() {
  const vehicle = getVehicleById(getFormField(elements.routePlannerForm, "vehicleId").value);
  if (!vehicle) {
    elements.routePlanStatus.className = "lookup-status warn wide-field";
    elements.routePlanStatus.textContent = "Pick a vehicle before planning a route.";
    return;
  }

  if (!Array.isArray(resolvedRouteStops) || resolvedRouteStops.length < 2) {
    elements.routePlanStatus.className = "lookup-status warn wide-field";
    elements.routePlanStatus.textContent =
      "Check and confirm the locations before planning the route.";
    return;
  }

  elements.planRouteBtn.disabled = true;
  elements.routePlanStatus.className = "lookup-status empty wide-field";
  elements.routePlanStatus.textContent = "Planning route...";

  try {
    const response = await callApi("planRoute", {
      resolvedStops: resolvedRouteStops,
    });
    const route = response.route || {};
    const routeAverageSpeedMph = calculateAverageSpeedMph(
      route.distanceMeters,
      route.durationSeconds
    );
    const routeType = inferRouteType(route.distanceMeters, route.durationSeconds);
    const plannerDistanceField = getFormField(elements.routePlannerForm, "plannedDistance");
    plannerDistanceField.dataset.routeBaseDistanceMeters = String(route.distanceMeters || "");
    plannerDistanceField.dataset.routeBaseDurationSeconds = String(route.durationSeconds || "");
    plannerDistanceField.dataset.routeBaseType = routeType;
    plannerDistanceField.dataset.routePolyline = route.polyline || "";
    plannerDistanceField.dataset.routeAverageSpeedMph =
      Number.isFinite(routeAverageSpeedMph) ? formatFixedInput(routeAverageSpeedMph, 1) : "";
    syncPlannedRouteOutputsFromBase();
    const plannedDistance = numberOrNull(plannerDistanceField.value);
    const plannedDuration = getFormField(elements.routePlannerForm, "plannedDuration").value;
    const routeTypeLabel = formatRouteType(routeType);
    elements.routePlanStatus.className = "lookup-status good wide-field";
    elements.routePlanStatus.textContent =
      `${formatDistance(plannedDistance, vehicle.distanceUnit)} planned in ${plannedDuration}. ${routeTypeLabel} route inferred${
        getPlannerRoundTripEnabled() ? " Round trip applied." : ""
      }${
        Number.isFinite(routeAverageSpeedMph) ? ` ${formatNumber(routeAverageSpeedMph, 1)} mph average speed.` : "."
      }`;
    syncTripFormDerivedFields();
  } catch (error) {
    resetPlannedRouteFields();
    elements.routePlanStatus.className = "lookup-status warn wide-field";
    elements.routePlanStatus.textContent =
      error instanceof Error && error.message
        ? error.message
        : "Route planning failed.";
  } finally {
    elements.planRouteBtn.disabled = false;
  }
}

async function handleOwnershipCostSubmit(event) {
  event.preventDefault();
  if (!requireProfile()) {
    return;
  }
  if (!state.vehicles.length) {
    alert("Add a vehicle first.");
    return;
  }

  const form = elements.ownershipCostForm;
  const formData = new FormData(form);
  const vehicleId = formData.get("vehicleId").toString();
  const vehicle = getVehicleById(vehicleId);
  const costPayload = {
    id: editingOwnershipCostId || crypto.randomUUID(),
    vehicleId,
    date: formData.get("date").toString(),
    category: formData.get("category").toString(),
    totalCost: Number(formData.get("totalCost")),
    notes: formData.get("notes").toString().trim(),
  };

  if (editingOwnershipCostId) {
    state.ownershipCosts = state.ownershipCosts.map((cost) =>
      cost.id === editingOwnershipCostId ? costPayload : cost
    );
  } else {
    state.ownershipCosts.push(costPayload);
  }

  resetOwnershipCostForm();
  if (vehicle) {
    getFormField(form, "vehicleId").value = vehicle.id;
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
  hideSection("settings");
  persistAndRender();
  void syncRemoteState();
  void refreshWeatherSummary();
}

async function deleteFillUp(entryId) {
  state.fillUps = state.fillUps.filter((entry) => entry.id !== entryId);
  if (editingFillUpId === entryId) {
    resetFillUpForm();
  }
  recomputeEfficiencies();
  persistAndRender();
  await syncRemoteState();
}

async function deleteTrip(entryId) {
  state.trips = state.trips.filter((trip) => trip.id !== entryId);
  persistAndRender();
  await syncRemoteState();
}

async function deleteOwnershipCost(entryId) {
  state.ownershipCosts = state.ownershipCosts.filter((cost) => cost.id !== entryId);
  if (editingOwnershipCostId === entryId) {
    resetOwnershipCostForm();
  }
  persistAndRender();
  await syncRemoteState();
}

async function backfillFillUpWeather() {
  if (!requireProfile()) {
    return;
  }

  const pendingFillUps = state.fillUps.filter((entry) => !entry.weather);
  if (!pendingFillUps.length) {
    alert("All fill-ups already have weather saved.");
    return;
  }

  elements.backfillWeatherBtn.disabled = true;
  let updatedCount = 0;

  try {
    for (const fillUp of pendingFillUps) {
      const weather = await fetchWeatherForDate(fillUp.date, fillUp.station, {
        fallbackToHomeCity: true,
      });
      if (weather) {
        fillUp.weather = weather;
        updatedCount += 1;
      }
    }

    persistAndRender();
    await syncRemoteState();
    alert(
      updatedCount
        ? `Filled weather for ${updatedCount} fill-up${updatedCount === 1 ? "" : "s"}.`
        : "No historic weather could be matched from the saved fill-up locations."
    );
  } finally {
    elements.backfillWeatherBtn.disabled = false;
  }
}

async function deleteVehicle(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) {
    return;
  }

  const fillUpCount = state.fillUps.filter((entry) => entry.vehicleId === vehicleId).length;
  const tripCount = state.trips.filter((trip) => trip.vehicleId === vehicleId).length;
  const ownershipCostCount = state.ownershipCosts.filter((cost) => cost.vehicleId === vehicleId).length;
  const confirmed = window.confirm(
    `Delete ${vehicle.name}? This will also remove ${fillUpCount} fill-ups, ${tripCount} trips, and ${ownershipCostCount} ownership costs linked to it.`
  );
  if (!confirmed) {
    return;
  }

  state.vehicles = state.vehicles.filter((entry) => entry.id !== vehicleId);
  state.fillUps = state.fillUps.filter((entry) => entry.vehicleId !== vehicleId);
  state.trips = state.trips.filter((trip) => trip.vehicleId !== vehicleId);
  state.ownershipCosts = state.ownershipCosts.filter((cost) => cost.vehicleId !== vehicleId);
  if (editingVehicleId === vehicleId) {
    resetVehicleForm();
  }
  recomputeEfficiencies();
  persistAndRender();
  await syncRemoteState();
}

function resetFillUpFormDerivedState() {
  lastFillUpPricingField = "";
  getFormField(elements.fillUpForm, "liters").value = "";
  getFormField(elements.fillUpForm, "totalCost").value = "";
  getFormField(elements.fillUpForm, "pricePerLiter").value = "";
  elements.fillUpCalcStatus.className = "lookup-status empty wide-field";
  elements.fillUpCalcStatus.textContent =
    "Enter any two of price per litre, volume, or total cost.";
}

function syncFillUpPricingFields() {
  const pricing = resolveFillUpPricing({
    liters: numberOrNull(getFormField(elements.fillUpForm, "liters").value),
    totalCost: numberOrNull(getFormField(elements.fillUpForm, "totalCost").value),
    pricePerLiter: numberOrNull(getFormField(elements.fillUpForm, "pricePerLiter").value),
  });

  for (const [fieldName, digits] of [
    ["liters", 2],
    ["totalCost", 2],
    ["pricePerLiter", 3],
  ]) {
    const field = getFormField(elements.fillUpForm, fieldName);
    if (!field.matches(":focus") && Number.isFinite(pricing[fieldName])) {
      field.value = formatFixedInput(pricing[fieldName], digits);
    }
  }

  if (pricing.isValid) {
    elements.fillUpCalcStatus.className = "lookup-status good wide-field";
    elements.fillUpCalcStatus.innerHTML =
      `<span class="calc-status-strong">Calculated automatically.</span> ${escapeHtml(pricing.message)}`;
  } else {
    elements.fillUpCalcStatus.className = "lookup-status empty wide-field";
    elements.fillUpCalcStatus.textContent =
      "Enter any two of price per litre, volume, or total cost.";
  }
}

function resolveFillUpPricing({ liters, totalCost, pricePerLiter }) {
  let resolvedLiters = liters;
  let resolvedTotalCost = totalCost;
  let resolvedPricePerLiter = pricePerLiter;
  const filledCount = [liters, totalCost, pricePerLiter].filter(
    (value) => Number.isFinite(value) && value > 0
  ).length;

  if (filledCount < 2) {
    return {
      liters: resolvedLiters,
      totalCost: resolvedTotalCost,
      pricePerLiter: resolvedPricePerLiter,
      isValid: false,
      message: "",
    };
  }

  if ((!Number.isFinite(resolvedLiters) || resolvedLiters <= 0) && Number.isFinite(totalCost) && Number.isFinite(pricePerLiter) && pricePerLiter > 0) {
    resolvedLiters = totalCost / pricePerLiter;
  } else if ((!Number.isFinite(resolvedTotalCost) || resolvedTotalCost <= 0) && Number.isFinite(liters) && Number.isFinite(pricePerLiter) && pricePerLiter > 0) {
    resolvedTotalCost = liters * pricePerLiter;
  } else if ((!Number.isFinite(resolvedPricePerLiter) || resolvedPricePerLiter <= 0) && Number.isFinite(liters) && Number.isFinite(totalCost) && liters > 0) {
    resolvedPricePerLiter = totalCost / liters;
  } else if (filledCount === 3 && lastFillUpPricingField) {
    const otherField = getDerivedFillUpField(lastFillUpPricingField);
    if (otherField === "liters" && Number.isFinite(totalCost) && Number.isFinite(pricePerLiter) && pricePerLiter > 0) {
      resolvedLiters = totalCost / pricePerLiter;
    } else if (otherField === "totalCost" && Number.isFinite(liters) && Number.isFinite(pricePerLiter) && pricePerLiter > 0) {
      resolvedTotalCost = liters * pricePerLiter;
    } else if (otherField === "pricePerLiter" && Number.isFinite(liters) && Number.isFinite(totalCost) && liters > 0) {
      resolvedPricePerLiter = totalCost / liters;
    }
  }

  return {
    liters: roundMaybe(resolvedLiters, 2),
    totalCost: roundMaybe(resolvedTotalCost, 2),
    pricePerLiter: roundMaybe(resolvedPricePerLiter, 3),
    isValid:
      Number.isFinite(resolvedLiters) &&
      resolvedLiters > 0 &&
      Number.isFinite(resolvedTotalCost) &&
      resolvedTotalCost > 0 &&
      Number.isFinite(resolvedPricePerLiter) &&
      resolvedPricePerLiter > 0,
    message: `${formatCurrency(roundMaybe(resolvedPricePerLiter, 3))}/L × ${formatNumber(roundMaybe(resolvedLiters, 2), 2)} L = ${formatCurrency(roundMaybe(resolvedTotalCost, 2))}.`,
  };
}

function getDerivedFillUpField(lastEditedField) {
  const order = ["liters", "totalCost", "pricePerLiter"];
  const available = order.filter((field) => field !== lastEditedField);
  return (
    available.find((field) => !getFormField(elements.fillUpForm, field).matches(":focus")) ||
    available[0]
  );
}

function resetTripFormDerivedState() {
  lastTripVehicleSelection = "";
  getFormField(elements.tripForm, "tripMpgUk").value = "";
  getFormField(elements.tripForm, "totalCost").value = "";
  getFormField(elements.tripForm, "fuelPricePerLiter").value = "";
  const plannerTotalCostField = getFormField(elements.routePlannerForm, "totalCost");
  if (plannerTotalCostField) {
    plannerTotalCostField.value = "";
  }
  elements.tripCalcStatus.className = "lookup-status empty wide-field";
  elements.tripCalcStatus.textContent =
    "Trip fuel cost uses the previous fill-up price for this vehicle.";
}

function resetPlannedRouteFields(options = {}) {
  const { keepResolutionSummary = false } = options;
  resolvedRouteStops = null;
  const plannerDistanceField = getFormField(elements.routePlannerForm, "plannedDistance");
  const plannerDurationField = getFormField(elements.routePlannerForm, "plannedDuration");
  const plannerRouteTypeField = getFormField(elements.routePlannerForm, "routeType");
  const plannerTotalCostField = getFormField(elements.routePlannerForm, "totalCost");
  const plannedDistanceField = getFormField(elements.tripForm, "plannedDistance");
  const plannedDurationField = getFormField(elements.tripForm, "plannedDuration");
  const tripRouteTypeField = getFormField(elements.tripForm, "routeType");
  if (plannerDistanceField) {
    plannerDistanceField.value = "";
    delete plannerDistanceField.dataset.routePolyline;
    delete plannerDistanceField.dataset.routeAverageSpeedMph;
    delete plannerDistanceField.dataset.routeBaseDistanceMeters;
    delete plannerDistanceField.dataset.routeBaseDurationSeconds;
    delete plannerDistanceField.dataset.routeBaseType;
  }
  if (plannerDurationField) {
    plannerDurationField.value = "";
  }
  if (plannerRouteTypeField) {
    plannerRouteTypeField.value = "";
  }
  if (plannerTotalCostField) {
    plannerTotalCostField.value = "";
  }
  if (plannedDistanceField) {
    plannedDistanceField.value = "";
    delete plannedDistanceField.dataset.routePolyline;
    delete plannedDistanceField.dataset.routeAverageSpeedMph;
  }
  if (plannedDurationField) {
    plannedDurationField.value = "";
  }
  if (tripRouteTypeField) {
    tripRouteTypeField.value = "mixed";
  }
  if (!keepResolutionSummary) {
    renderResolvedRouteSummary(null);
  }
  if (elements.routePlanStatus) {
    elements.routePlanStatus.className = "lookup-status empty wide-field";
    elements.routePlanStatus.textContent =
      "Plan a route from the saved locations to prefill trip distance.";
  }
  renderTripWorkspace();
}

function syncTripFormDerivedFields() {
  syncTripPlannerOutputsFromPlanner();
  const vehicle = getVehicleById(getFormField(elements.tripForm, "vehicleId").value);
  if (!vehicle) {
    resetTripFormDerivedState();
    return;
  }

  if (
    !getFormField(elements.tripForm, "tripMpgUk").matches(":focus") &&
    (vehicle.id !== lastTripVehicleSelection ||
      !numberOrNull(getFormField(elements.tripForm, "tripMpgUk").value))
  ) {
    const profileMpgUk = getVehicleProfileMpgUk(vehicle);
    getFormField(elements.tripForm, "tripMpgUk").value =
      profileMpgUk !== null ? formatFixedInput(profileMpgUk, 1) : "";
  }
  lastTripVehicleSelection = vehicle.id;

  const startOdometer = numberOrNull(getFormField(elements.tripForm, "startOdometer").value);
  const endOdometer = numberOrNull(getFormField(elements.tripForm, "endOdometer").value);
  const odometerDistance =
    Number.isFinite(startOdometer) && Number.isFinite(endOdometer)
      ? endOdometer - startOdometer
      : null;
  const plannedDistance = numberOrNull(getFormField(elements.tripForm, "plannedDistance").value);
  const distance =
    Number.isFinite(odometerDistance) && odometerDistance > 0
      ? odometerDistance
      : plannedDistance;
  const tripMpgUk = numberOrNull(getFormField(elements.tripForm, "tripMpgUk").value);
  const litersUsed = numberOrNull(getFormField(elements.tripForm, "litersUsed").value);
  const routeType = normalizeRouteType(getFormField(elements.tripForm, "routeType").value);
  const estimate = estimateTripFuel({
    vehicle,
    date: getFormField(elements.tripForm, "date").value,
    startOdometer,
    distance,
    tripMpgUk,
    litersUsed,
    routeType,
  });

  getFormField(elements.tripForm, "fuelPricePerLiter").value = Number.isFinite(
    estimate.pricePerLiter
  )
    ? formatFixedInput(estimate.pricePerLiter, 3)
    : "";
  getFormField(elements.tripForm, "totalCost").value = Number.isFinite(estimate.totalCost)
    ? formatFixedInput(estimate.totalCost, 2)
    : "";
  const plannerTotalCostField = getFormField(elements.routePlannerForm, "totalCost");
  if (plannerTotalCostField) {
    plannerTotalCostField.value = Number.isFinite(estimate.totalCost)
      ? formatFixedInput(estimate.totalCost, 2)
      : "";
  }

  if (estimate.message) {
    elements.tripCalcStatus.className = `lookup-status ${estimate.level} wide-field`;
    elements.tripCalcStatus.textContent = estimate.message;
  } else {
    elements.tripCalcStatus.className = "lookup-status empty wide-field";
    elements.tripCalcStatus.textContent =
      "Trip fuel cost uses the previous fill-up price for this vehicle.";
  }
}

function getRoutePlannerFields() {
  return {
    startLocation: getFormField(elements.routePlannerForm, "startLocation").value.trim(),
    endLocation: getFormField(elements.routePlannerForm, "endLocation").value.trim(),
    routeWaypoints: parseTripWaypoints(
      getFormField(elements.routePlannerForm, "routeWaypoints").value
    ),
  };
}

function renderResolvedRouteSummary(stops) {
  if (!elements.routeResolutionSummary) {
    return;
  }

  if (!Array.isArray(stops) || !stops.length) {
    elements.routeResolutionSummary.className = "lookup-status empty wide-field";
    elements.routeResolutionSummary.textContent =
      "We will show the resolved addresses here before route planning.";
    return;
  }

  const lines = stops
    .map((stop, index) => {
      const label = index === 0
        ? "Start"
        : index === stops.length - 1
          ? "End"
          : `Waypoint ${index}`;
      return `<span><strong>${label}:</strong> ${escapeHtml(stop.label || stop.query || "Unknown stop")}</span>`;
    })
    .join("");

  elements.routeResolutionSummary.className = "lookup-status good wide-field";
  elements.routeResolutionSummary.innerHTML =
    `<div class="resolved-route-list">${lines}</div>`;
}

function setRouteResolutionStatus(level, message) {
  renderResolvedRouteSummary(null);
  if (!elements.routeResolutionSummary) {
    return;
  }
  elements.routeResolutionSummary.className = `lookup-status ${level} wide-field`;
  elements.routeResolutionSummary.textContent = message;
}

function syncTripVehicleFromPlanner() {
  const plannerVehicleId = getFormField(elements.routePlannerForm, "vehicleId").value;
  if (plannerVehicleId && getFormField(elements.tripForm, "vehicleId").value !== plannerVehicleId) {
    getFormField(elements.tripForm, "vehicleId").value = plannerVehicleId;
  }
}

function syncPlannerVehicleFromTrip() {
  const tripVehicleId = getFormField(elements.tripForm, "vehicleId").value;
  if (
    tripVehicleId &&
    getFormField(elements.routePlannerForm, "vehicleId").value !== tripVehicleId
  ) {
    getFormField(elements.routePlannerForm, "vehicleId").value = tripVehicleId;
  }
}

function syncTripPlannerOutputsFromPlanner() {
  const plannerDistanceField = getFormField(elements.routePlannerForm, "plannedDistance");
  const plannerDurationField = getFormField(elements.routePlannerForm, "plannedDuration");
  const plannerRouteTypeField = getFormField(elements.routePlannerForm, "routeType");
  const tripDistanceField = getFormField(elements.tripForm, "plannedDistance");
  const tripDurationField = getFormField(elements.tripForm, "plannedDuration");
  const tripRouteTypeField = getFormField(elements.tripForm, "routeType");

  tripDistanceField.value = plannerDistanceField.value;
  tripDurationField.value = plannerDurationField.value;
  tripRouteTypeField.value = normalizeRouteType(
    String(plannerRouteTypeField?.value || "").toLowerCase()
  );

  if (plannerDistanceField.dataset.routePolyline) {
    tripDistanceField.dataset.routePolyline = plannerDistanceField.dataset.routePolyline;
  } else {
    delete tripDistanceField.dataset.routePolyline;
  }
  if (plannerDistanceField.dataset.routeAverageSpeedMph) {
    tripDistanceField.dataset.routeAverageSpeedMph = plannerDistanceField.dataset.routeAverageSpeedMph;
  } else {
    delete tripDistanceField.dataset.routeAverageSpeedMph;
  }
}

function syncPlannedRouteOutputsFromBase() {
  const plannerDistanceField = getFormField(elements.routePlannerForm, "plannedDistance");
  const baseDistanceMeters = numberOrNull(plannerDistanceField.dataset.routeBaseDistanceMeters);
  const baseDurationSeconds = numberOrNull(plannerDistanceField.dataset.routeBaseDurationSeconds);
  const baseRouteType = normalizeRouteType(plannerDistanceField.dataset.routeBaseType);
  const vehicle = getVehicleById(getFormField(elements.routePlannerForm, "vehicleId").value);

  if (!vehicle || !Number.isFinite(baseDistanceMeters) || !Number.isFinite(baseDurationSeconds)) {
    syncTripPlannerOutputsFromPlanner();
    return;
  }

  const multiplier = getPlannerRoundTripEnabled() ? 2 : 1;
  const plannedDistance = convertMetersToUnit(baseDistanceMeters * multiplier, vehicle.distanceUnit);
  const plannedDuration = formatDuration(baseDurationSeconds * multiplier);

  plannerDistanceField.value = Number.isFinite(plannedDistance)
    ? formatFixedInput(plannedDistance, 1)
    : "";
  getFormField(elements.routePlannerForm, "plannedDuration").value = plannedDuration;
  getFormField(elements.routePlannerForm, "routeType").value = formatRouteType(baseRouteType);

  syncTripPlannerOutputsFromPlanner();
}

function getPlannerRoundTripEnabled() {
  return Boolean(getFormField(elements.routePlannerForm, "isRoundTrip")?.checked);
}

function estimateTripFuel({ vehicle, date, startOdometer, distance, tripMpgUk, litersUsed, routeType }) {
  if (!vehicle) {
    return { estimatedLiters: null, pricePerLiter: null, totalCost: null, level: "empty", message: "" };
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    return {
      estimatedLiters: null,
      pricePerLiter: null,
      totalCost: null,
      level: "empty",
      message: "Enter the trip distance to estimate fuel cost.",
    };
  }

  const previousPrice = getPreviousFillUpPrice(vehicle.id, date, startOdometer);
  const adjustedMpgUk = adjustMpgForRouteType(tripMpgUk, routeType);
  const estimatedLiters = Number.isFinite(litersUsed) && litersUsed > 0
    ? litersUsed
    : estimateLitersFromMpg(distance, vehicle.distanceUnit, adjustedMpgUk);

  if (!Number.isFinite(previousPrice) || previousPrice <= 0) {
    return {
      estimatedLiters,
      pricePerLiter: null,
      totalCost: null,
      level: "warn",
      message: "Add a fill-up price for this car first so trip fuel cost can be calculated.",
    };
  }

  if (!Number.isFinite(estimatedLiters) || estimatedLiters <= 0) {
    return {
      estimatedLiters: null,
      pricePerLiter: previousPrice,
      totalCost: null,
      level: "warn",
      message: "Set a car MPG or enter fuel used in litres to estimate this trip cost.",
    };
  }

  const totalCost = roundMaybe(previousPrice * estimatedLiters, 2);
  return {
    estimatedLiters,
    pricePerLiter: previousPrice,
    totalCost,
    level: "good",
    message: Number.isFinite(litersUsed) && litersUsed > 0
      ? `Using ${formatNumber(estimatedLiters, 2)} L at ${formatCurrency(previousPrice)}/L from the previous fill-up.`
      : `Using ${formatNumber(adjustedMpgUk, 1)} mpg UK after ${formatRouteType(routeType).toLowerCase()} adjustment and ${formatCurrency(previousPrice)}/L from the previous fill-up.`,
  };
}

function getPreviousFillUpPrice(vehicleId, date, odometer) {
  const eligible = state.fillUps
    .filter((entry) => entry.vehicleId === vehicleId)
    .filter((entry) => {
      if (!date) {
        return true;
      }
      if (entry.date < date) {
        return true;
      }
      if (entry.date > date) {
        return false;
      }
      return !Number.isFinite(odometer) || entry.odometer <= odometer;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
  return eligible[0]?.pricePerLiter ?? null;
}

function getVehicleProfileMpgUk(vehicle) {
  if (Number.isFinite(vehicle?.profileMpgUk)) {
    return vehicle.profileMpgUk;
  }
  if (Number.isFinite(vehicle?.estimatedConsumption?.mpgUk)) {
    return vehicle.estimatedConsumption.mpgUk;
  }
  return null;
}

function estimateLitersFromMpg(distance, distanceUnit, mpgUk) {
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(mpgUk) || mpgUk <= 0) {
    return null;
  }

  const miles = distanceUnit === "mi" ? distance : distance / 1.60934;
  return roundMaybe((miles / mpgUk) * 4.54609, 2);
}

function adjustMpgForRouteType(mpgUk, routeType) {
  if (!Number.isFinite(mpgUk) || mpgUk <= 0) {
    return null;
  }
  return roundMaybe(mpgUk * getRouteTypeMpgFactor(routeType), 1);
}

function getRouteTypeMpgFactor(routeType) {
  return ROUTE_TYPE_MPG_FACTORS[normalizeRouteType(routeType)] ?? ROUTE_TYPE_MPG_FACTORS.mixed;
}

function normalizeRouteType(routeType) {
  const normalized = String(routeType || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROUTE_TYPE_MPG_FACTORS, normalized)
    ? normalized
    : "mixed";
}

function calculateAverageSpeedMph(distanceMeters, durationSeconds) {
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    distanceMeters <= 0 ||
    durationSeconds <= 0
  ) {
    return null;
  }

  return (distanceMeters / 1609.34) / (durationSeconds / 3600);
}

function inferRouteType(distanceMeters, durationSeconds) {
  const averageMph = calculateAverageSpeedMph(distanceMeters, durationSeconds);
  if (!Number.isFinite(averageMph)) {
    return "mixed";
  }
  if (averageMph < 25) {
    return "city";
  }
  if (averageMph < 50) {
    return "mixed";
  }
  return "motorway";
}

function formatRouteType(routeType) {
  const labels = {
    city: "City",
    mixed: "Mixed",
    motorway: "Motorway",
  };
  return labels[normalizeRouteType(routeType)];
}

function parseTripWaypoints(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function convertMetersToUnit(distanceMeters, distanceUnit) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }
  return roundMaybe(distanceUnit === "mi" ? distanceMeters / 1609.34 : distanceMeters / 1000, 1);
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (!hours) {
    return `${minutes} min`;
  }
  if (!minutes) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

function parseDurationInputToSeconds(value) {
  const input = String(value || "").trim();
  if (!input) {
    return null;
  }

  const match = input.match(/^(?:(\d+)\s*hr)?(?:\s*(\d+)\s*min)?$/i);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const totalSeconds = hours * 3600 + minutes * 60;
  return totalSeconds > 0 ? totalSeconds : null;
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
      profileMpgUk: vehicle.profileMpgUk,
      profileMpgSource: vehicle.profileMpgSource,
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
      tripMpgUk: trip.tripMpgUk,
      litersUsed: trip.litersUsed,
      fuelPricePerLiter: trip.fuelPricePerLiter,
      startLocation: trip.startLocation,
      endLocation: trip.endLocation,
      routeWaypoints: Array.isArray(trip.routeWaypoints) ? trip.routeWaypoints.join(", ") : "",
      routeSource: trip.routeSource,
      routeType: normalizeRouteType(trip.routeType),
      routeAverageSpeedMph: trip.routeAverageSpeedMph,
      plannedDistance: trip.plannedDistance,
      plannedDurationSeconds: trip.plannedDurationSeconds,
      routePolyline: trip.routePolyline,
      notes: trip.notes,
      weatherLabel: trip.weather?.label,
      weatherTempC: trip.weather?.tempC,
      weatherWindKph: trip.weather?.windKph,
    })),
    ...state.ownershipCosts.map((cost) => ({
      backupVersion: BACKUP_CSV_VERSION,
      recordType: "ownershipCost",
      id: cost.id,
      vehicleId: cost.vehicleId,
      date: cost.date,
      category: cost.category,
      totalCost: cost.totalCost,
      notes: cost.notes,
    })),
  ];

  return serializeCsvRows(rows, BACKUP_CSV_COLUMNS);
}

function importBackupCsv(csvText) {
  const normalizedCsvText = String(csvText).replace(/^\uFEFF/, "");
  const rows = parseCsvRows(normalizedCsvText);
  const knownRecordTypes = new Set(["settings", "vehicle", "fillUp", "trip", "ownershipCost"]);
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
    ownershipCosts: [],
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
          profileMpgUk: parseNullableNumber(row.profileMpgUk),
          profileMpgSource: row.profileMpgSource || null,
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
            tripMpgUk: parseNullableNumber(row.tripMpgUk),
            litersUsed: parseNullableNumber(row.litersUsed),
            fuelPricePerLiter: parseNullableNumber(row.fuelPricePerLiter),
            startLocation: row.startLocation || "",
            endLocation: row.endLocation || "",
            routeWaypoints: parseTripWaypoints(row.routeWaypoints || ""),
            routeSource: row.routeSource || null,
            routeType: normalizeRouteType(row.routeType),
            routeAverageSpeedMph: parseNullableNumber(row.routeAverageSpeedMph),
            plannedDistance: parseNullableNumber(row.plannedDistance),
            plannedDurationSeconds: parseNullableNumber(row.plannedDurationSeconds),
            routePolyline: row.routePolyline || "",
            notes: row.notes || "",
            weather: buildWeatherSnapshot(row),
          });
        }
        break;
      case "ownershipCost":
        imported.ownershipCosts.push({
          id: row.id || crypto.randomUUID(),
          vehicleId: row.vehicleId || "",
          date: row.date || "",
          category: row.category || "service",
          totalCost: parseNumberOrZero(row.totalCost),
          notes: row.notes || "",
        });
        break;
      default:
        break;
    }
  }

  if (
    !rows.length ||
    !rows.some((row) =>
      ["settings", "vehicle", "fillUp", "trip", "ownershipCost"].includes(row.recordType)
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
      profileMpgUk: null,
      profileMpgSource: null,
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
    ownershipCosts: [],
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
      registrationNumber: "AB12CDE",
      make: "FORD",
      yearOfManufacture: 2018,
      monthOfFirstRegistration: "2018-03",
      engineCapacity: 998,
      co2Emissions: 114,
      estimatedConsumption: {
        lPer100km: 6.1,
        mpgUk: 46.5,
      },
      profileMpgUk: 44.2,
      profileMpgSource: "manual",
      lookupSource: "demo",
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
    makeDemoTrip(vehicleId, "2026-05-06", 24038, 24116, "Commute", 44.2, 5.3, 1.51, "Home", "Canary Wharf"),
    makeDemoTrip(vehicleId, "2026-05-18", 24401, 24574, "Weekend", 44.2, 11.2, 1.51, "London", "Brighton"),
    makeDemoTrip(vehicleId, "2026-05-29", 24782, 24864, "Errands", 44.2, 4.6, 1.53, "Home", "Westfield"),
  ];
  state.ownershipCosts = [
    makeDemoOwnershipCost(vehicleId, "2026-01-12", "insurance", 612.4, "Annual insurance premium"),
    makeDemoOwnershipCost(vehicleId, "2026-03-01", "tax", 190, "Road tax"),
    makeDemoOwnershipCost(vehicleId, "2026-04-22", "service", 284.5, "Annual service and MOT"),
    makeDemoOwnershipCost(vehicleId, "2026-05-28", "carPayment", 219, "Monthly finance payment"),
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

function makeDemoTrip(
  vehicleId,
  date,
  startOdometer,
  endOdometer,
  category,
  tripMpgUk,
  litersUsed,
  fuelPricePerLiter,
  startLocation,
  endLocation
) {
  const totalCost = Number.isFinite(litersUsed) && Number.isFinite(fuelPricePerLiter)
    ? roundMaybe(litersUsed * fuelPricePerLiter, 2)
    : 0;
  return {
    id: crypto.randomUUID(),
    vehicleId,
    date,
    startOdometer,
    endOdometer,
    distance: endOdometer - startOdometer,
    category,
    totalCost,
    tripMpgUk,
    litersUsed,
    fuelPricePerLiter,
    startLocation,
    endLocation,
    routeType: "mixed",
    notes: "",
    weather: null,
  };
}

function makeDemoOwnershipCost(vehicleId, date, category, totalCost, notes) {
  return {
    id: crypto.randomUUID(),
    vehicleId,
    date,
    category,
    totalCost,
    notes,
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

function summarizeEntries(fillUps, trips, ownershipCosts = []) {
  const totalFuelCost = fillUps.reduce((sum, entry) => sum + entry.totalCost, 0);
  const totalTripCost = trips.reduce((sum, trip) => sum + (trip.totalCost || 0), 0);
  const totalOwnershipCost = ownershipCosts.reduce((sum, cost) => sum + (cost.totalCost || 0), 0);
  const totalLiters = fillUps.reduce((sum, entry) => sum + entry.liters, 0);
  const tripFuelSeries = trips
    .map((trip) => getTripFuelLiters(trip))
    .filter((value) => Number.isFinite(value));
  const tripLiters = tripFuelSeries.reduce((sum, value) => sum + value, 0);
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
        const tripFuelLiters = getTripFuelLiters(trip);
        if (!Number.isFinite(tripFuelLiters) || tripFuelLiters <= 0) {
          return sum;
        }
        const unit = getVehicleById(trip.vehicleId)?.distanceUnit || "km";
        return sum + normalizeEfficiency(trip.distance / tripFuelLiters, unit);
      }, 0) /
      tripFuelSeries.length
    : null;

  return {
    totalSpend: totalFuelCost + totalTripCost + totalOwnershipCost,
    totalFuelCost,
    totalTripCost,
    totalOwnershipCost,
    totalLiters,
    tripLiters,
    averagePricePerLiter: totalLiters ? totalFuelCost / totalLiters : 0,
    tripDistance,
    averageTripDistance,
    distanceUnit,
    averageEfficiencyNormalized: averageEfficiency,
    bestEfficiencyNormalized: bestEfficiency,
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

function projectMonthlySpend(fillUps, trips, ownershipCosts = []) {
  const items = [...fillUps, ...trips, ...ownershipCosts];
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

function buildMonthlySpendSeries(fillUps, trips, ownershipCosts = [], options = {}) {
  const bucket = new Map();
  for (const item of [...fillUps, ...trips, ...ownershipCosts]) {
    const month = item.date.slice(0, 7);
    bucket.set(month, (bucket.get(month) || 0) + (item.totalCost || 0));
  }
  const limit = options.limit === undefined ? 8 : options.limit;
  const series = [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ label: formatMonthLabel(month), value }));
  return limit ? series.slice(-limit) : series;
}

function buildMonthlyFuelSpendSeries(fillUps, options = {}) {
  const bucket = new Map();
  for (const entry of fillUps) {
    const month = entry.date.slice(0, 7);
    bucket.set(month, (bucket.get(month) || 0) + (entry.totalCost || 0));
  }
  const limit = options.limit === undefined ? 8 : options.limit;
  const series = [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ label: formatMonthLabel(month), value }));
  return limit ? series.slice(-limit) : series;
}

function buildYearlySpendSeries(fillUps, trips, ownershipCosts = []) {
  const bucket = new Map();

  for (const entry of fillUps) {
    const year = entry.date.slice(0, 4);
    const record = bucket.get(year) || makeYearBucket();
    record.fuelCost += entry.totalCost || 0;
    record.totalSpend += entry.totalCost || 0;
    record.totalLiters += entry.liters || 0;
    bucket.set(year, record);
  }

  for (const trip of trips) {
    const year = trip.date.slice(0, 4);
    const record = bucket.get(year) || makeYearBucket();
    record.tripCost += trip.totalCost || 0;
    record.totalSpend += trip.totalCost || 0;
    const normalizedDistance = normalizeTripDistance(trip, record.distanceUnit);
    record.tripDistance += normalizedDistance || 0;
    bucket.set(year, record);
  }

  for (const cost of ownershipCosts) {
    const year = cost.date.slice(0, 4);
    const record = bucket.get(year) || makeYearBucket();
    record.ownershipCost += cost.totalCost || 0;
    record.totalSpend += cost.totalCost || 0;
    record[cost.category] = (record[cost.category] || 0) + (cost.totalCost || 0);
    bucket.set(year, record);
  }

  return [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, totals]) => ({ year, ...totals }));
}

function calculateLoggedMileage(fillUps, targetUnit = "km", options = {}) {
  const targetYear = Number.isFinite(Number(options.year)) ? String(options.year) : "";
  const byVehicle = new Map();

  for (const entry of fillUps) {
    if (!Number.isFinite(entry.odometer)) {
      continue;
    }
    const entries = byVehicle.get(entry.vehicleId) || [];
    entries.push(entry);
    byVehicle.set(entry.vehicleId, entries);
  }

  let total = 0;
  for (const [vehicleId, entries] of byVehicle.entries()) {
    if (entries.length < 2) {
      continue;
    }
    const sorted = [...entries].sort(
      (a, b) => a.date.localeCompare(b.date) || a.odometer - b.odometer
    );
    const sourceUnit = getVehicleById(vehicleId)?.distanceUnit || "km";

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const distance = current.odometer - previous.odometer;

      if (distance <= 0) {
        continue;
      }
      if (targetYear && !String(current.date || "").startsWith(targetYear)) {
        continue;
      }

      total +=
        sourceUnit === targetUnit
          ? distance
          : sourceUnit === "mi"
            ? distance * 1.60934
            : distance / 1.60934;
    }
  }

  return total;
}

function makeYearBucket() {
  return {
    fuelCost: 0,
    tripCost: 0,
    ownershipCost: 0,
    service: 0,
    tax: 0,
    carPayment: 0,
    insurance: 0,
    totalSpend: 0,
    totalLiters: 0,
    tripDistance: 0,
    distanceUnit: getGarageDistanceUnit(),
  };
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

function getFilteredOwnershipCosts() {
  const selectedVehicle = elements.vehicleFilter.value;
  return state.ownershipCosts
    .filter((cost) => selectedVehicle === "all" || cost.vehicleId === selectedVehicle)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getVehicleById(vehicleId) {
  return state.vehicles.find((vehicle) => vehicle.id === vehicleId);
}

function getGarageDistanceUnit() {
  const units = new Set(state.vehicles.map((vehicle) => vehicle.distanceUnit || "km"));
  return units.size === 1 ? [...units][0] : "km";
}

function getVehicleCostTotals(vehicleId) {
  const currentYear = getLocalDateString().slice(0, 4);
  const relatedItems = [
    ...state.fillUps.filter((entry) => entry.vehicleId === vehicleId),
    ...state.trips.filter((trip) => trip.vehicleId === vehicleId),
    ...state.ownershipCosts.filter((cost) => cost.vehicleId === vehicleId),
  ];

  const allTimeTotal = relatedItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
  const currentYearTotal = relatedItems
    .filter((item) => item.date?.slice(0, 4) === currentYear)
    .reduce((sum, item) => sum + (item.totalCost || 0), 0);

  return {
    currentYear,
    currentYearTotal,
    allTimeTotal,
  };
}

function buildOwnershipYearBreakdown(costs) {
  const byYear = new Map();
  for (const cost of costs) {
    const year = cost.date.slice(0, 4) || "Unknown";
    const record = byYear.get(year) || {
      year,
      service: 0,
      tax: 0,
      carPayment: 0,
      insurance: 0,
      total: 0,
    };
    record[cost.category] = (record[cost.category] || 0) + (cost.totalCost || 0);
    record.total += cost.totalCost || 0;
    byYear.set(year, record);
  }

  return [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year));
}

function buildOwnershipReportMetrics(yearSeries) {
  const latest = yearSeries.at(-1);
  if (!latest) {
    return [
      { label: "This year", value: "Pending" },
      { label: "Service", value: "Pending" },
      { label: "Tax", value: "Pending" },
      { label: "Payments", value: "Pending" },
      { label: "Insurance", value: "Pending" },
    ];
  }

  return [
    { label: "This year", value: formatCurrency(latest.ownershipCost || 0) },
    { label: "Service", value: formatCurrency(latest.service || 0) },
    { label: "Tax", value: formatCurrency(latest.tax || 0) },
    { label: "Payments", value: formatCurrency(latest.carPayment || 0) },
    { label: "Insurance", value: formatCurrency(latest.insurance || 0) },
  ];
}

function formatOwnershipCategory(value) {
  const labels = {
    service: "Service",
    tax: "Tax",
    carPayment: "Car payment",
    insurance: "Insurance",
  };
  return labels[value] || "Other";
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
  const tripFuelLiters = getTripFuelLiters(trip);
  if (!tripFuelLiters || tripFuelLiters <= 0) {
    return "Optional";
  }
  return formatEfficiency(
    trip.distance / tripFuelLiters,
    state.settings.consumptionMode,
    vehicleUnit
  );
}

function describeVehicleConsumption(vehicle) {
  const profileMpgUk = getVehicleProfileMpgUk(vehicle);
  const parts = [];
  if (Number.isFinite(profileMpgUk)) {
    parts.push(
      `${vehicle.profileMpgSource === "plate" ? "Profile via plate" : "Profile"} ${profileMpgUk.toFixed(1)} mpg UK`
    );
  }
  if (!vehicle?.estimatedConsumption) {
    return parts.join(" · ");
  }
  parts.push(
    `Estimated ${vehicle.estimatedConsumption.lPer100km.toFixed(1)} L/100km · ${vehicle.estimatedConsumption.mpgUk.toFixed(1)} mpg UK`
  );
  return parts.join(" · ");
}

function getTripFuelLiters(trip) {
  if (Number.isFinite(trip.litersUsed) && trip.litersUsed > 0) {
    return trip.litersUsed;
  }
  const vehicle = getVehicleById(trip.vehicleId);
  const adjustedMpgUk = adjustMpgForRouteType(
    trip.tripMpgUk ?? getVehicleProfileMpgUk(vehicle),
    trip.routeType
  );
  return estimateLitersFromMpg(
    trip.distance,
    vehicle?.distanceUnit || "km",
    adjustedMpgUk
  );
}

function buildTripConsumptionMeta(trip) {
  if (Number.isFinite(trip.litersUsed) && trip.litersUsed > 0) {
    return `${formatNumber(trip.litersUsed, 2)} L used`;
  }
  if (Number.isFinite(trip.tripMpgUk) && trip.tripMpgUk > 0) {
    const adjustedMpgUk = adjustMpgForRouteType(trip.tripMpgUk, trip.routeType);
    return `${formatNumber(adjustedMpgUk, 1)} mpg UK ${formatRouteType(trip.routeType).toLowerCase()}`;
  }
  return "No MPG or litres saved";
}

function buildTripCostMeta(trip) {
  if (Number.isFinite(trip.fuelPricePerLiter) && trip.fuelPricePerLiter > 0) {
    return `${formatCurrency(trip.fuelPricePerLiter)}/L applied`;
  }
  return "No fuel price matched";
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

function formatFixedInput(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "";
}

function averageOf(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return null;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function maxOf(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function minOf(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.min(...finiteValues) : null;
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

function toEfficiencyDisplayValue(kmPerLiter, mode) {
  if (!Number.isFinite(kmPerLiter) || kmPerLiter <= 0) {
    return null;
  }

  switch (mode) {
    case "mpgUk":
      return kmPerLiter * 2.82481;
    case "mpgUs":
      return kmPerLiter * 2.35215;
    case "lPer100km":
      return 100 / kmPerLiter;
    case "kmPerL":
    default:
      return kmPerLiter;
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

function formatDeltaCurrency(value) {
  if (!Number.isFinite(value)) {
    return "Pending";
  }
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function describeEfficiencyDifference(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return "Pending";
  }
  const change = ((a - b) / b) * 100;
  const direction = change >= 0 ? "better" : "lower";
  return `${formatNumber(Math.abs(change), 0)}% ${direction} warm`;
}

async function refreshWeatherSummary() {
  if (!state.settings.homeCity) {
    elements.weatherSummary.innerHTML =
      "<strong>Weather not configured</strong><span>Add a home city to pull forecast snapshots.</span>";
    return;
  }

  const weather = await fetchWeatherForDate(getLocalDateString(), state.settings.homeCity, {
    fallbackToHomeCity: true,
  });
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

async function fetchWeatherForDate(date, locationQuery = "", options = {}) {
  const queries = buildWeatherLocationQueries(locationQuery, options);
  if (!queries.length) {
    return null;
  }

  for (const query of queries) {
    const key = `${query}:${state.settings.countryCode}:${date}`;
    if (state.weatherCache[key]) {
      return state.weatherCache[key];
    }

    try {
      const location = await geocodeWeatherLocation(query);
      if (!location) {
        continue;
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
      continue;
    }
  }

  return null;
}

function buildWeatherLocationQueries(locationQuery, options = {}) {
  const trimmed = String(locationQuery || "").trim();
  const queries = [];

  if (trimmed) {
    queries.push(trimmed);
    if (state.settings.homeCity) {
      const includesHomeCity = trimmed.toLowerCase().includes(state.settings.homeCity.toLowerCase());
      if (!includesHomeCity) {
        queries.push(`${trimmed}, ${state.settings.homeCity}`);
      }
    }
  }

  if (options.fallbackToHomeCity && state.settings.homeCity) {
    queries.push(state.settings.homeCity);
  }

  return [...new Set(queries.filter(Boolean))];
}

async function geocodeWeatherLocation(query) {
  const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geoUrl.searchParams.set("name", query);
  geoUrl.searchParams.set("count", "1");
  if (state.settings.countryCode) {
    geoUrl.searchParams.set("countryCode", state.settings.countryCode);
  }
  geoUrl.searchParams.set("language", "en");
  geoUrl.searchParams.set("format", "json");

  const geoResponse = await fetch(geoUrl);
  const geoData = await geoResponse.json();
  return geoData.results?.[0] || null;
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
        ownershipCosts: state.ownershipCosts,
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
  state.ownershipCosts = Array.isArray(response.profile.ownershipCosts)
    ? response.profile.ownershipCosts
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

function formatEfficiencyAxisLabel(value, mode) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  switch (mode) {
    case "mpgUk":
      return `${formatAxisNumber(value, 0)} mpg`;
    case "mpgUs":
      return `${formatAxisNumber(value, 0)} mpg`;
    case "kmPerL":
      return `${formatAxisNumber(value, 1)} km/L`;
    case "lPer100km":
    default:
      return `${formatAxisNumber(value, 1)} L/100`;
  }
}

function formatAxisDistance(value, unit) {
  return `${formatAxisNumber(value, value >= 100 ? 0 : 1)} ${unit}`;
}

function buildReactiveRange(values, options = {}) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return null;
  }

  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  const rawRange = rawMax - rawMin;
  const padding = Math.max(
    rawRange * (options.paddingRatio ?? 0),
    options.minimumPadding ?? 0
  );

  if (!rawRange) {
    return {
      min: Math.max(0, rawMin - padding),
      max: rawMax + padding,
    };
  }

  return {
    min: Math.max(0, rawMin - padding),
    max: rawMax + padding,
  };
}

function buildReadableChartRange(values, options = {}) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return null;
  }

  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  const rawRange = rawMax - rawMin;
  const padding = Math.max(
    rawRange * (options.paddingRatio ?? 0.15),
    options.minimumPadding ?? 0
  );
  const min = options.includeZero
    ? 0
    : Math.max(0, rawMin - padding);
  const max = rawMax + padding;

  return {
    min,
    max: max > min ? max : min + Math.max(options.minimumPadding ?? 1, 1),
  };
}

function getEfficiencyMinimumAxisPadding(mode) {
  switch (mode) {
    case "mpgUk":
    case "mpgUs":
      return 3;
    case "kmPerL":
      return 1;
    case "lPer100km":
    default:
      return 0.8;
  }
}

function renderXAxisTicks(ticks, y) {
  if (!ticks.length) {
    return "";
  }

  return ticks
    .map(
      (tick) => `
        <text x="${tick.x}" y="${y}" text-anchor="${tick.anchor || "middle"}" class="chart-axis-text">${escapeHtml(tick.label)}</text>
      `
    )
    .join("");
}

function buildDistributedXAxisTicks(labels, options = {}) {
  if (!labels.length) {
    return [];
  }

  const maxTicks = options.maxTicks || 3;
  const indexes = Array.from(
    new Set(
      [0, Math.floor((labels.length - 1) / 2), labels.length - 1].slice(0, maxTicks)
    )
  ).sort((a, b) => a - b);

  return indexes.map((index) => {
    const ratio = labels.length === 1 ? 0 : index / (labels.length - 1);
    const x = options.startX + ratio * (options.endX - options.startX);
    return {
      x,
      label: labels[index],
      anchor: index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle",
    };
  });
}

function buildBarXAxisTicks(labels) {
  if (!labels.length) {
    return [];
  }

  const indexes = Array.from(
    new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])
  ).sort((a, b) => a - b);
  const barWidth = 112 / labels.length;

  return indexes.map((index) => ({
    x: 34 + index * barWidth + barWidth / 2,
    label: labels[index],
    anchor: index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle",
  }));
}

function formatChartDateLabel(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
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
