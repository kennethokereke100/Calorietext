import { json, secretsMatch, database, sendblueHeaders, responseText } from "../_shared/runtime.mjs";
import { generateReply } from "../process-messages/ai.mjs";
import { loadImage } from "../process-messages/media.mjs";

export function createConnectionCheck({ getEnv, fetchImpl = fetch }) {
  return async req => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!await secretsMatch(getEnv("CALORIETEXT_ADMIN_SECRET"), req.headers.get("x-calorietext-admin-secret"))) {
      return json(401, { error: "unauthorized" });
    }
    // Operator-only format check: trusted CDN input, metadata-only output,
    // no model request, outbound text, persistent photo, or raw image response.
    if (new URL(req.url).searchParams.get("test_media") === "true") {
      const length=Number(req.headers.get("content-length"));
      if (!Number.isInteger(length) || length<1 || length>4096) return json(400,{error:"invalid_media_request"});
      try {
        const raw=await req.text();
        if(raw.length>4096) return json(400,{error:"invalid_media_request"});
        const data=JSON.parse(raw);
        if(typeof data.media_url!=="string" || data.media_url.length>4000) return json(400,{error:"invalid_media_request"});
        const image=await loadImage(data.media_url,fetchImpl);
        return json(200,{checks:{media:"passed"},format:image.slice(5,image.indexOf(";"))});
      } catch { return json(422,{checks:{media:"failed"}}); }
    }
    const checks = {};
    try {
      await database(getEnv, fetchImpl)("calorietext_webhook_events?select=id&limit=1");
      checks.database = "connected";
    } catch { checks.database = "unavailable"; }
    try {
      if (!getEnv("OPENAI_API_KEY")) throw new Error("missing");
      const response = await fetchImpl(`https://api.openai.com/v1/models/${getEnv("OPENAI_MODEL") || "gpt-5.4-mini"}`, {
        headers: { Authorization: `Bearer ${getEnv("OPENAI_API_KEY")}` }, signal: AbortSignal.timeout(10000),
      });
      checks.openai = response.ok ? "authenticated" : `http_${response.status}`;
      await response.body?.cancel();
    } catch { checks.openai = "unavailable"; }
    try {
      const response = await fetchImpl("https://api.sendblue.com/api/account/webhooks", {
        headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(10000),
      });
      checks.sendblue = response.ok ? "authenticated" : `http_${response.status}`;
      await response.body?.cancel();
    } catch { checks.sendblue = "unavailable"; }
    // The explicit test flag runs one fixed, small model call; it accepts no user prompt.
    if (new URL(req.url).searchParams.get("test_ai") === "true" && checks.openai === "authenticated") {
      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST", headers: { Authorization: `Bearer ${getEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: getEnv("OPENAI_MODEL") || "gpt-5.4-mini", store: false,
            reasoning: { effort: "low" }, max_output_tokens: 256,
            input: "Reply with only these words: Calorietext connection confirmed." }),
          signal: AbortSignal.timeout(30000),
        });
        const result = await response.json();
        checks.ai_request = response.ok && result.status === "completed" && responseText(result) ? "passed" : `http_${response.status}`;
        if (result.error?.code && /^[a-z0-9_]{1,80}$/.test(result.error.code)) checks.ai_error_code = result.error.code;
      } catch { checks.ai_request = "unavailable"; }
    }
    if (new URL(req.url).searchParams.get("test_reply") === "true" && checks.openai === "authenticated") {
      try {
        const result = await generateReply({getEnv,fetchImpl,text:"I ate one medium apple. Please log an approximate estimate."});
        checks.structured_reply = result.meal ? "passed" : "no_meal_returned";
      } catch { checks.structured_reply = "failed"; }
    }
    return json(200, { checks, ingestion_enabled: getEnv("CALORIETEXT_INGEST_ENABLED") === "true",
      replies_enabled: getEnv("CALORIETEXT_REPLY_ENABLED") === "true" });
  };
}
