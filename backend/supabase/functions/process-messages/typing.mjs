import { sendblueHeaders } from "../_shared/runtime.mjs";

/** Start a best-effort iMessage indicator; return an idempotent cleanup. */
export function startTyping({ getEnv, fetchImpl = fetch, payload }) {
  if (payload.service !== "iMessage") return async () => {};
  const send = async state => {
    try {
      const response = await fetchImpl("https://api.sendblue.com/api/send-typing-indicator", {
        method: "POST", headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(1500),
        body: JSON.stringify({ number: payload.from_number, from_number: getEnv("SENDBLUE_FROM_NUMBER"),
          state, ...(state === "start" ? { max_duration_ms: 60000 } : {}) }),
      });
      // Cosmetic only: do not consume/log provider error bodies or retry.
      await response.body?.cancel();
    } catch { /* A missing indicator must not prevent the actual reply. */ }
  };
  // Start concurrently with preparation, without an artificial typing delay.
  const started = send("start");
  let stopped;
  return () => stopped ??= (async () => {
    // Preserve request ordering even if composing a canned reply is very fast.
    await started;
    await send("stop");
  })();
}
