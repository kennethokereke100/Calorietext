import { sendblueHeaders } from "../_shared/runtime.mjs";

/** A receipt means processing has started, not that analysis has finished. */
export async function markRead({ getEnv, fetchImpl = fetch, payload }) {
  // SMS has no visible read status. RCS visibility depends on the carrier.
  if (!["iMessage", "RCS"].includes(payload.service)) return "skipped";
  try {
    const response = await fetchImpl("https://api.sendblue.com/api/mark-read", {
      method: "POST", headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(8000),
      // The API marks the 1:1 conversation, including text and photo messages.
      body: JSON.stringify({ number: payload.from_number, from_number: getEnv("SENDBLUE_FROM_NUMBER") }),
    });
    if (!response.ok) {
      console.warn(`read_receipt_http_${response.status}`);
      await response.body?.cancel();
      return "unavailable";
    }
    const result = await response.json();
    return result.status === "OK" ? "accepted" : "unavailable";
  } catch {
    // No message content, contact, credential, or provider error body in logs.
    console.warn("read_receipt_unavailable");
    return "unavailable";
  }
}
