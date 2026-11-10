const encoder = new TextEncoder();
export function json(status, data) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function secretsMatch(expected, supplied) {
  if (!expected || expected.length < 32 || !supplied || supplied.length > 512) return false;
  const digests = await Promise.all([expected, supplied].map(s => crypto.subtle.digest("SHA-256", encoder.encode(s))));
  const a = new Uint8Array(digests[0]), b = new Uint8Array(digests[1]);
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta |= a[i] ^ b[i];
  return delta === 0;
}
function keyBytes(hex) {
  if (!/^[a-f0-9]{64}$/i.test(hex || "")) throw new Error("encryption_not_configured");
  return Uint8Array.from(hex.match(/../g), v => parseInt(v, 16));
}
export async function encryptPayload(value, hex) {
  const key = await crypto.subtle.importKey("raw", keyBytes(hex), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value))));
  const base64 = bytes => btoa(Array.from(bytes, v => String.fromCharCode(v)).join(""));
  return `v1:${base64(iv)}:${base64(bytes)}`;
}
export async function decryptPayload(value, hex) {
  const [version, iv, data] = value.split(":");
  if (version !== "v1" || !iv || !data) throw new Error("invalid_ciphertext");
  const key = await crypto.subtle.importKey("raw", keyBytes(hex), "AES-GCM", false, ["decrypt"]);
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(data));
  return JSON.parse(new TextDecoder().decode(plain));
}
export async function phoneHash(phone, hex) {
  const key = await crypto.subtle.importKey("raw", keyBytes(hex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(phone))), n => n.toString(16).padStart(2, "0")).join("");
}
export function adminHeaders(getEnv) {
  const keys = JSON.parse(getEnv("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default === "string" && keys.default.startsWith("sb_secret_")) return { apikey: keys.default };
  const legacy = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("missing_database_key");
  return { apikey: legacy, Authorization: `Bearer ${legacy}` };
}
export function database(getEnv, fetchImpl = fetch) {
  return async (path, { method = "GET", body, prefer = "return=representation" } = {}) => {
    const response = await fetchImpl(`${getEnv("SUPABASE_URL")}/rest/v1/${path}`, {
      method, headers: { ...adminHeaders(getEnv), "Content-Type": "application/json", Prefer: prefer },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`database_${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}
export function sendblueHeaders(getEnv) {
  return { "sb-api-key-id": getEnv("SENDBLUE_API_KEY"), "sb-api-secret-key": getEnv("SENDBLUE_API_SECRET"), "Content-Type": "application/json" };
}
export function responseText(result) {
  return (result.output || []).flatMap(item => item.type === "message" ? item.content || [] : [])
    .filter(item => item.type === "output_text").map(item => item.text).join("\n");
}
