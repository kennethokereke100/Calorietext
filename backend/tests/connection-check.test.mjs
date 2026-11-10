import test from "node:test";
import assert from "node:assert/strict";
import { createConnectionCheck } from "../supabase/functions/connection-check/handler.mjs";
const env = { CALORIETEXT_ADMIN_SECRET: "test-only-admin-secret-that-is-long-enough", OPENAI_API_KEY: "test-openai-secret",
  SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"sb_secret_test"}',
  SENDBLUE_API_KEY: "test-sendblue-key", SENDBLUE_API_SECRET: "test-sendblue-secret" };
test("connection check authenticates and does not expose credentials", async () => {
  const urls = [];
  const handler = createConnectionCheck({ getEnv: key => env[key], fetchImpl: async url => { urls.push(url); return Response.json([]); } });
  const unauthorized = await handler(new Request("https://example.com", { method: "POST" }));
  assert.equal(unauthorized.status, 401);
  assert.equal(urls.length, 0);
  const response = await handler(new Request("https://example.com", { method: "POST", headers: { "x-calorietext-admin-secret": env.CALORIETEXT_ADMIN_SECRET } }));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(urls.length, 3);
  for (const value of Object.values(env)) assert.ok(!body.includes(value));
  assert.ok(!urls.some(url => url.endsWith("/responses")));
});
