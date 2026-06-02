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

function shapeProfile(row: Record<string, unknown>, includeKey = false) {
  return {
    id: row.id,
    nickname: row.nickname,
    ...(includeKey ? { profileKey: row.profile_key } : {}),
    settings: row.settings ?? {},
    vehicles: row.vehicles ?? [],
    fillUps: row.fill_ups ?? [],
    trips: row.trips ?? [],
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
      const { data: existing, error: existingError } = await supabase
        .from("road_ledger_profiles")
        .select("*")
        .eq("nickname_normalized", nicknameNormalized)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        return jsonResponse(
          { error: "That nickname is already taken on another browser." },
          409
        );
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

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      500
    );
  }
});
