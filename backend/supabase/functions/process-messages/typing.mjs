import { sendblueHeaders } from "../_shared/runtime.mjs";

/** Start a best-effort iMessage indicator; return an idempotent cleanup. */
export function startTyping({ getEnv, fetchImpl = fetch, payload }) {
  if (payload.service !== "iMessage") return Object.assign(async () => {}, { ready: Promise.resolve() });
  const send = async state => {
    try {
      const response = await fetchImpl("https://api.sendblue.com/api/send-typing-indicator", {
        method: "POST", headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(state === "start" ? 10000 : 5000),
        body: JSON.stringify({ number: payload.from_number, from_number: getEnv("SENDBLUE_FROM_NUMBER"),
          state, ...(state === "start" ? { max_duration_ms: payload.media_url ? 120000 : 60000 } : {}) }),
      });
      // Record only status codes: never log the recipient, photo, or provider body.
      if (!response.ok) console.warn(`typing_${state}_http_${response.status}`);
      await response.body?.cancel();
    } catch { console.warn(`typing_${state}_unavailable`); }
  };
  // Start concurrently with preparation, without an artificial typing delay.
  const started = send("start");
  let stopped;
  const stop = () => stopped ??= (async () => {
    // Preserve request ordering even if composing a canned reply is very fast.
    await started;
    await send("stop");
  })();
  // Photo decoding can occupy the runtime. Give the start request a bounded
  // chance to finish first, and never let a late start follow the actual reply.
  return Object.assign(stop, { ready: started });
}
