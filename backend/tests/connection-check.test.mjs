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

test("operator media check returns only metadata and never calls AI or messaging",async()=>{
  const urls=[];
  const handler=createConnectionCheck({getEnv:key=>env[key],fetchImpl:async url=>{
    urls.push(url);return new Response(new Uint8Array([255,216,255,0]));
  }});
  const raw=JSON.stringify({media_url:"https://storage.googleapis.com/inbound-file-store/test.jpg"});
  const headers={"x-calorietext-admin-secret":env.CALORIETEXT_ADMIN_SECRET,"content-length":String(raw.length)};
  const response=await handler(new Request("https://example.com?test_media=true",{method:"POST",headers,body:raw}));
  assert.deepEqual(await response.json(),{checks:{media:"passed"},format:"image/jpeg"});
  assert.equal(urls.length,1);
  const bad=JSON.stringify({media_url:"https://127.0.0.1/photo.jpg"});
  const denied=await handler(new Request("https://example.com?test_media=true",{method:"POST",headers:{...headers,"content-length":String(bad.length)},body:bad}));
  assert.equal(denied.status,422);assert.equal(urls.length,1);
});
