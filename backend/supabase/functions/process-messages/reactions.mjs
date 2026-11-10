import { sendblueHeaders } from "../_shared/runtime.mjs";

export const REACTIONS = Object.freeze(["💪", "💧", "🙌", "👍", "😊", "😔"]);
// Primary handles are UUIDs on the pilot line. Do not derive a parent from
// attachment-specific handles or guess multipart indexes.
const PRIMARY_HANDLE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function sendReaction({ getEnv, fetchImpl = fetch, payload, reaction }) {
  if (!REACTIONS.includes(reaction) || payload.service !== "iMessage" ||
      !PRIMARY_HANDLE.test(payload.message_handle || "")) return "skipped";
  // Cosmetic, one attempt only, after the text has been durably completed.
  // A timeout or unsupported line must never retry the text or the reaction.
  try {
    const response = await fetchImpl("https://api.sendblue.com/api/send-reaction", {
      method: "POST", headers: sendblueHeaders(getEnv), signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ from_number: getEnv("SENDBLUE_FROM_NUMBER"),
        message_handle: payload.message_handle, reaction }),
    });
    if (!response.ok) return "unavailable";
    const result = await response.json();
    return result.status === "OK" ? "accepted" : "unavailable";
  } catch { return "unavailable"; }
}
