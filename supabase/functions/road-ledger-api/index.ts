import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);
const dvlaApiKey = Deno.env.get("DVLA_VES_API_KEY") ?? "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeNickname(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeRegistration(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function queryLooksPrecise(query: string) {
  return /[0-9]/.test(query) || query.includes(",") || query.trim().length >= 10;
}

function getPrimaryLabel(result: Record<string, unknown>) {
  return String(result.display_name ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function buildAmbiguityError(query: string, results: Array<Record<string, unknown>>) {
  const suggestions = results
    .slice(0, 3)
    .map((result) => String(result.display_name ?? "").trim())
    .filter(Boolean);

  if (!suggestions.length) {
    return `Could not confidently resolve "${query}".`;
  }

  return `Could not confidently resolve "${query}". Try a fuller address or postcode. Closest matches: ${suggestions.join(" | ")}`;
}

function validateResolvedMatch(query: string, results: Array<Record<string, unknown>>) {
  const top = results[0];
  if (!top) {
    throw new Error(`Could not find "${query}".`);
  }

  const precise = queryLooksPrecise(query);
  const topImportance = Number(top.importance ?? 0);
  const second = results[1];
  const secondImportance = Number(second?.importance ?? 0);
  const topLabel = getPrimaryLabel(top);
  const hasCompetingPrimaryLabels = results
    .slice(1, 3)
    .some((result) => getPrimaryLabel(result) !== topLabel);

  if (!precise && second && hasCompetingPrimaryLabels && Math.abs(topImportance - secondImportance) < 0.08) {
    throw new Error(buildAmbiguityError(query, results));
  }

  if (!precise && topImportance < 0.15 && results.length > 1) {
    throw new Error(buildAmbiguityError(query, results));
  }

  return top;
}

async function geocodeRouteLocation(query: string, countryCode = "") {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  if (countryCode) {
    url.searchParams.set("countrycodes", countryCode.trim().toLowerCase());
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "road-ledger-route-planner/1.0",
    },
  });
  const results = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error("Location lookup failed.");
  }

  const normalizedResults = Array.isArray(results) ? results : [];
  const match = validateResolvedMatch(query, normalizedResults);

  return {
    query,
    label: String(match.display_name ?? query),
    lat: Number(match.lat),
    lon: Number(match.lon),
    countryCode:
      String((match.address as Record<string, unknown> | undefined)?.country_code ?? "")
        .trim()
        .toUpperCase() || null,
  };
}

async function resolveRouteLocations(origin: string, destination: string, waypoints: string[] = [], countryCode = "") {
  const stops = [origin, ...waypoints, destination];
  const points = [];

  for (const stop of stops) {
    points.push(await geocodeRouteLocation(stop, countryCode));
  }

  return points;
}

async function planRoute(points: Array<{ query: string; label: string; lat: number; lon: number }>) {
  const coordinatePath = points
    .map((point) => `${point.lon},${point.lat}`)
    .join(";");
  const routeUrl = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinatePath}`);
  routeUrl.searchParams.set("overview", "simplified");
  routeUrl.searchParams.set("geometries", "polyline");
  routeUrl.searchParams.set("steps", "false");

  const response = await fetch(routeUrl);
  const data = await response.json().catch(() => ({}));
  const route = Array.isArray(data.routes) ? data.routes[0] : null;

  if (!response.ok || !route) {
    throw new Error("Route planning failed.");
  }

  return {
    source: "osrm",
    origin: points[0]?.label ?? points[0]?.query ?? "",
    destination: points.at(-1)?.label ?? points.at(-1)?.query ?? "",
    waypoints: points.slice(1, -1).map((point) => point.label),
    distanceMeters: round(Number(route.distance), 0),
    durationSeconds: round(Number(route.duration), 0),
    polyline: String(route.geometry ?? ""),
  };
}

function estimateConsumptionFromCo2(fuelType: string, co2Emissions: unknown) {
  const co2 = Number(co2Emissions);
  if (!Number.isFinite(co2) || co2 <= 0) {
    return null;
  }

  const normalizedFuelType = fuelType.toUpperCase();
  const gramsPerLiter = normalizedFuelType.includes("DIESEL")
    ? 2640
    : normalizedFuelType.includes("PETROL")
      ? 2392
      : null;

  if (!gramsPerLiter) {
    return null;
  }

  const lPer100km = (co2 * 100) / gramsPerLiter;
  if (!Number.isFinite(lPer100km) || lPer100km <= 0) {
    return null;
  }

  return {
    lPer100km: round(lPer100km, 1),
    mpgUk: round(282.481 / lPer100km, 1),
  };
}

async function lookupDvlaVehicle(registrationNumber: string) {
  if (!dvlaApiKey) {
    throw new Error("Vehicle lookup is not configured on the server.");
  }

  const normalizedRegistration = normalizeRegistration(registrationNumber);
  if (!normalizedRegistration) {
    return jsonResponse({ error: "Registration number is required." }, 400);
  }

  const response = await fetch(
    "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": dvlaApiKey,
      },
      body: JSON.stringify({ registrationNumber: normalizedRegistration }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof data?.errors?.[0]?.detail === "string"
        ? data.errors[0].detail
        : typeof data?.error === "string"
          ? data.error
          : "The DVLA lookup failed.";
    return jsonResponse({ error: detail }, response.status);
  }

  const estimatedConsumption = estimateConsumptionFromCo2(
    String(data.fuelType ?? ""),
    data.co2Emissions
  );

  return jsonResponse({
    vehicle: {
      registrationNumber: normalizeRegistration(String(data.registrationNumber ?? normalizedRegistration)),
      make: String(data.make ?? ""),
      fuelType: String(data.fuelType ?? ""),
      yearOfManufacture: Number.isFinite(Number(data.yearOfManufacture))
        ? Number(data.yearOfManufacture)
        : null,
      monthOfFirstRegistration: String(data.monthOfFirstRegistration ?? ""),
      engineCapacity: Number.isFinite(Number(data.engineCapacity))
        ? Number(data.engineCapacity)
        : null,
      co2Emissions: Number.isFinite(Number(data.co2Emissions))
        ? Number(data.co2Emissions)
        : null,
      estimatedConsumption,
      lookupSource: estimatedConsumption ? "dvla-co2-estimate" : "dvla-details-only",
    },
  });
}

function shapeProfile(row: Record<string, unknown>, includeKey = false) {
  return {
    id: row.id,
    nickname: row.nickname,
    ...(includeKey ? { profileKey: row.profile_key } : {}),
    settings: row.settings ?? {},
    vehicles: row.vehicles ?? [],
    fillUps: row.fill_ups ?? [],
    trips: row.trips ?? [],
    ownershipCosts: row.ownership_costs ?? [],
    updatedAt: row.updated_at,
  };
}

async function readBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function loadProfile(profileId: string) {
  const { data, error } = await supabase
    .from("road_ledger_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadProfileByNickname(nickname: string) {
  const { data, error } = await supabase
    .from("road_ledger_profiles")
    .select("*")
    .eq("nickname_normalized", normalizeNickname(nickname))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const body = await readBody(req);
  const action = String(body.action ?? "");

  try {
    if (action === "bootstrap") {
      const nickname = String(body.nickname ?? "").trim();
      if (!nickname) {
        return jsonResponse({ error: "Nickname is required." }, 400);
      }

      const nicknameNormalized = normalizeNickname(nickname);
      const existing = await loadProfileByNickname(nickname);

      if (existing) {
        await supabase
          .from("road_ledger_profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", existing.id);

        return jsonResponse({ profile: shapeProfile(existing, true) });
      }

      const profileKey = crypto.randomUUID();
      const { data, error } = await supabase
        .from("road_ledger_profiles")
        .insert({
          nickname,
          nickname_normalized: nicknameNormalized,
          profile_key: profileKey,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return jsonResponse({ profile: shapeProfile(data, true) });
    }

    if (action === "load") {
      const profileId = String(body.profileId ?? "");
      const profileKey = String(body.profileKey ?? "");
      if (!profileId || !profileKey) {
        return jsonResponse({ error: "Profile credentials are required." }, 400);
      }

      const data = await loadProfile(profileId);
      if (!data || data.profile_key !== profileKey) {
        return jsonResponse({ error: "Profile not found." }, 404);
      }

      await supabase
        .from("road_ledger_profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", profileId);

      return jsonResponse({ profile: shapeProfile(data) });
    }

    if (action === "save") {
      const profileId = String(body.profileId ?? "");
      const profileKey = String(body.profileKey ?? "");
      const payload = body.payload ?? {};

      if (!profileId || !profileKey) {
        return jsonResponse({ error: "Profile credentials are required." }, 400);
      }

      const current = await loadProfile(profileId);
      if (!current || current.profile_key !== profileKey) {
        return jsonResponse({ error: "Profile not found." }, 404);
      }

      const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
      const fillUps = Array.isArray(payload.fillUps) ? payload.fillUps : [];
      const trips = Array.isArray(payload.trips) ? payload.trips : [];
      const ownershipCosts = Array.isArray(payload.ownershipCosts)
        ? payload.ownershipCosts
        : [];
      const settings =
        payload.settings && typeof payload.settings === "object"
          ? payload.settings
          : {};

      const { data, error } = await supabase
        .from("road_ledger_profiles")
        .update({
          settings,
          vehicles,
          fill_ups: fillUps,
          trips,
          ownership_costs: ownershipCosts,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", profileId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return jsonResponse({ profile: shapeProfile(data) });
    }

    if (action === "lookupVehicle") {
      const registrationNumber = String(body.registrationNumber ?? "");
      return await lookupDvlaVehicle(registrationNumber);
    }

    if (action === "resolveRouteLocations") {
      const origin = String(body.origin ?? "").trim();
      const destination = String(body.destination ?? "").trim();
      const waypoints = Array.isArray(body.waypoints)
        ? body.waypoints.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const countryCode = String(body.countryCode ?? "").trim().toUpperCase();

      if (!origin || !destination) {
        return jsonResponse({ error: "Origin and destination are required." }, 400);
      }

      return jsonResponse({
        stops: await resolveRouteLocations(origin, destination, waypoints, countryCode),
      });
    }

    if (action === "planRoute") {
      const resolvedStops = Array.isArray(body.resolvedStops)
        ? body.resolvedStops
            .map((value) => ({
              query: String(value?.query ?? "").trim(),
              label: String(value?.label ?? "").trim(),
              lat: Number(value?.lat),
              lon: Number(value?.lon),
            }))
            .filter(
              (value) =>
                value.label &&
                value.query &&
                Number.isFinite(value.lat) &&
                Number.isFinite(value.lon)
            )
        : [];

      if (resolvedStops.length < 2) {
        return jsonResponse({ error: "Resolve the route locations first." }, 400);
      }

      return jsonResponse({
        route: await planRoute(resolvedStops),
      });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      500
    );
  }
});
