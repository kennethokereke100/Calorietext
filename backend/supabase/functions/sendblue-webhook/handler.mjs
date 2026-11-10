const encoder = new TextEncoder();
const MAX_BODY_BYTES = 64 * 1024;
const PHONE = /^\+[1-9]\d{7,14}$/;

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function secretsMatch(a, b) {
  if (!b || b.length > 512) return false;
  const [left, right] = await Promise.all([a, b].map((s) =>
    crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const l = new Uint8Array(left), r = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < l.length; i++) difference |= l[i] ^ r[i];
  return difference === 0;
}

async function readBoundedJson(req) {
  const size = Number(req.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BODY_BYTES) throw new Error("too_large");
  if (!req.body) throw new Error("invalid_json");
  const reader = req.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function encryptPayload(value, hexKey) {
  const bytes = Uint8Array.from(hexKey.match(/../g), (v) => parseInt(v, 16));
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, key, encoder.encode(JSON.stringify(value))));
  const base64 = (data) => btoa(Array.from(data, (v) => String.fromCharCode(v)).join(""));
  return `v1:${base64(nonce)}:${base64(encrypted)}`;
}

function adminHeaders(getEnv) {
  const keys = JSON.parse(getEnv("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default === "string" && keys.default.startsWith("sb_secret_")) {
    return { apikey: keys.default };
  }
  // Compatibility fallback while Supabase still provisions legacy environment keys.
  const legacy = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("missing_database_key");
  return { apikey: legacy, Authorization: `Bearer ${legacy}` };
}

export function createHandler({ getEnv, fetchImpl = fetch }) {
  return async function handle(req) {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    const secret = getEnv("SENDBLUE_WEBHOOK_SECRET");
    if (!secret || secret.length < 32) return json(503, { error: "setup_incomplete" });
    if (!await secretsMatch(secret, req.headers.get("sb-signing-secret"))) {
      return json(401, { error: "unauthorized" });
    }

    // Stay closed until the message processor and phone test are ready.
    if (getEnv("CALORIETEXT_INGEST_ENABLED") !== "true") {
      return json(503, { error: "pilot_not_enabled" });
    }
    const phone = getEnv("SENDBLUE_FROM_NUMBER") || "";
    const allowed = new Set((getEnv("PILOT_ALLOWED_NUMBERS") || "").split(",").map((s) => s.trim()).filter(Boolean));
    const encryptionKey = getEnv("MESSAGE_ENCRYPTION_KEY") || "";
    const baseUrl = getEnv("SUPABASE_URL") || "";
    if (!PHONE.test(phone) || !allowed.size || [...allowed].some((n) => !PHONE.test(n)) ||
        !/^[a-f0-9]{64}$/i.test(encryptionKey) || !/^https:\/\/[a-z0-9.-]+\/?$/.test(baseUrl)) {
      return json(503, { error: "setup_incomplete" });
    }
    if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
      return json(415, { error: "json_required" });
    }

    let event;
    try { event = await readBoundedJson(req); }
    catch (error) { return json(error.message === "too_large" ? 413 : 400, { error: "invalid_request_body" }); }
    if (!event || typeof event !== "object" || Array.isArray(event)) return json(400, { error: "invalid_event" });
    // Status callbacks, group messages, reactions, and outbound deliveries are not user requests.
    if (event.is_outbound !== false || event.status !== "RECEIVED" || event.group_id ||
        (event.message_type && event.message_type !== "message")) return json(200, { ignored: true });
    if (event.to_number !== phone || !PHONE.test(event.from_number || "")) return json(400, { error: "invalid_recipient" });
    if (!allowed.has(event.from_number)) return json(200, { ignored: true });
    if (typeof event.message_handle !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(event.message_handle)) {
      return json(400, { error: "invalid_message_id" });
    }
    if ((event.content != null && typeof event.content !== "string") ||
        (event.media_url != null && typeof event.media_url !== "string")) return json(400, { error: "invalid_content" });
    const content = event.content || "", media = event.media_url || "";
    if (content.length > 8000 || media.length > 4000 || (!content.trim() && !media)) {
      return json(400, { error: "invalid_content" });
    }
    if (media) {
      try {
        const url = new URL(media);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_media");
      } catch { return json(400, { error: "invalid_media" }); }
    }

    try {
      // Keep only fields needed by a future consumer. Do not log or store the raw webhook.
      const payload = { from_number: event.from_number, to_number: phone,
        content, media_url: media, message_handle: event.message_handle };
      const encrypted = await encryptPayload(payload, encryptionKey);
      const result = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/rest/v1/calorietext_webhook_events?on_conflict=provider_message_id&select=id`, {
        method: "POST",
        headers: { ...adminHeaders(getEnv), "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ provider_message_id: event.message_handle, payload_ciphertext: encrypted }),
        signal: AbortSignal.timeout(8000),
      });
      if (!result.ok) return json(503, { error: "storage_unavailable" });
      const inserted = await result.json();
      if (!Array.isArray(inserted)) return json(503, { error: "storage_unavailable" });
      return json(200, { received: true, duplicate: inserted.length === 0 });
    } catch {
      // Do not acknowledge a message that was not durably recorded.
      return json(503, { error: "storage_unavailable" });
    }
  };
}
