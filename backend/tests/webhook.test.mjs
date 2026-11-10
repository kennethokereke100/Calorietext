import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../supabase/functions/sendblue-webhook/handler.mjs";

// Reserved fictional numbers and test-only keys. Never use these in deployment.
const ENV = {
  SENDBLUE_WEBHOOK_SECRET: "test-only-shared-secret-0000000000000000",
  CALORIETEXT_INGEST_ENABLED: "true",
  SENDBLUE_FROM_NUMBER: "+12025550123",
  PILOT_ALLOWED_NUMBERS: "+12025550124",
  MESSAGE_ENCRYPTION_KEY: "ab".repeat(32),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test_only" }),
};
const EVENT = {
  is_outbound: false, status: "RECEIVED", message_type: "message",
  from_number: "+12025550124", to_number: "+12025550123",
  message_handle: "test-message-1", content: "Estimate this lunch",
  media_url: "https://example.com/food.jpg",
};
function request(event = EVENT, headers = {}) {
  return new Request("https://example.com/webhook", { method: "POST",
    headers: { "content-type": "application/json",
      "sb-signing-secret": ENV.SENDBLUE_WEBHOOK_SECRET, ...headers },
    body: JSON.stringify(event) });
}
function setup(overrides = {}, result = [{ id: "test-id" }]) {
  const env = { ...ENV, ...overrides }, calls = [];
  const handler = createHandler({ getEnv: (key) => env[key],
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      if (result instanceof Error) throw result;
      return result instanceof Response ? result : Response.json(result);
    } });
  return { handler, calls };
}
async function decode(ciphertext) {
  const [version, iv, data] = ciphertext.split(":");
  assert.equal(version, "v1");
  const key = await crypto.subtle.importKey("raw", Buffer.from(ENV.MESSAGE_ENCRYPTION_KEY, "hex"), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, key, Buffer.from(data, "base64"));
  return JSON.parse(new TextDecoder().decode(plain));
}

test("unconfigured and disabled deployments do not accept messages", async () => {
  for (const config of [{ SENDBLUE_WEBHOOK_SECRET: undefined }, { CALORIETEXT_INGEST_ENABLED: undefined },
    { PILOT_ALLOWED_NUMBERS: "" }, { MESSAGE_ENCRYPTION_KEY: "invalid" }]) {
    const { handler, calls } = setup(config);
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls.length, 0);
  }
});

test("rejects non-POST requests and authenticates before parsing", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(new Request("https://example.com"))).status, 405);
  for (const secret of ["", "wrong", "x".repeat(513)]) {
    const response = await handler(new Request("https://example.com", { method: "POST",
      headers: { "sb-signing-secret": secret }, body: "invalid JSON" }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls.length, 0);
});

test("does not record status callbacks, groups, reactions, or unapproved contacts", async () => {
  const { handler, calls } = setup();
  for (const patch of [{ is_outbound: true }, { status: "DELIVERED" }, { group_id: "group" },
    { message_type: "reaction" }, { from_number: "+12025550125" }]) {
    const response = await handler(request({ ...EVENT, ...patch }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ignored: true });
  }
  assert.equal(calls.length, 0);
});

test("validates recipient, message IDs, content, and media", async () => {
  const { handler, calls } = setup();
  for (const patch of [{ to_number: "+12025550126" }, { from_number: "bad" },
    { message_handle: "../../bad" }, { message_handle: "" }, { content: {} },
    { content: "x".repeat(8001) }, { content: " ", media_url: "" },
    { media_url: "http://example.com/a.jpg" }, { media_url: "https://user:password@example.com" }]) {
    assert.equal((await handler(request({ ...EVENT, ...patch }))).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("enforces JSON and byte limits, including streams without content-length", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(EVENT, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await handler(request(EVENT, { "content-length": "65537" }))).status, 413);
  assert.equal((await handler(request({ ...EVENT, content: "x".repeat(65537) }))).status, 413);
  for (const body of [null, [], "hello"]) assert.equal((await handler(request(body))).status, 400);
  const malformed = new Request("https://example.com", { method: "POST", headers: {
    "content-type": "application/json", "sb-signing-secret": ENV.SENDBLUE_WEBHOOK_SECRET }, body: "{" });
  assert.equal((await handler(malformed)).status, 400);
  assert.equal(calls.length, 0);
});

test("stores only encrypted normalized data with a fresh nonce", async () => {
  const { handler, calls } = setup();
  const event = { ...EVENT, unnecessary_personal_field: "must not persist" };
  for (let i = 0; i < 2; i++) {
    const response = await handler(request(event));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true, duplicate: false });
  }
  const records = calls.map((call) => JSON.parse(call.body));
  assert.notEqual(records[0].payload_ciphertext, records[1].payload_ciphertext);
  assert.deepEqual(Object.keys(records[0]).sort(), ["payload_ciphertext", "provider_message_id"]);
  for (const value of [EVENT.from_number, EVENT.to_number, EVENT.content, EVENT.media_url, "must not persist"]) {
    assert.ok(!calls[0].body.includes(value));
  }
  assert.deepEqual(await decode(records[0].payload_ciphertext), {
    from_number: EVENT.from_number, to_number: EVENT.to_number, content: EVENT.content,
    media_url: EVENT.media_url, message_handle: EVENT.message_handle,
    opted_out: false,
  });
  assert.equal(calls[0].headers.apikey, "sb_secret_test_only");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].headers.Prefer, "resolution=ignore-duplicates,return=representation");
  assert.ok(calls[0].url.includes("on_conflict=provider_message_id"));
});

test("supports text-only and photo-only messages", async () => {
  for (const patch of [{ media_url: "" }, { content: "" }]) {
    const { handler, calls } = setup();
    assert.equal((await handler(request({ ...EVENT, ...patch }))).status, 200);
    assert.equal(calls.length, 1);
  }
});

test("acknowledges duplicate delivery without creating another queue item", async () => {
  const { handler } = setup({}, []);
  assert.deepEqual(await (await handler(request())).json(), { received: true, duplicate: true });
});

test("never acknowledges storage failure as a successful delivery", async () => {
  for (const failure of [new Error("network failure"), new Response("error", { status: 500 }),
    { unexpected: "shape" }, new Response("invalid JSON")]) {
    const { handler } = setup({}, failure);
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "storage_unavailable" });
  }
});

test("legacy database key fallback remains server-only", async () => {
  const { handler, calls } = setup({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: "test-legacy-key" });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls[0].headers.Authorization, "Bearer test-legacy-key");
  const missing = setup({ SUPABASE_SECRET_KEYS: undefined });
  assert.equal((await missing.handler(request())).status, 503);
  assert.equal(missing.calls.length, 0);
});
