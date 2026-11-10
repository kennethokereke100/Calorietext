import { videoFilename, videoSignature } from "./video.mjs";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export function trustedMediaUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port &&
      u.hostname === "storage.googleapis.com" && u.pathname.startsWith("/inbound-file-store/") &&
      !/%2f|%5c/i.test(u.pathname);
  } catch { return false; }
}
export async function loadImage(value, fetchImpl = fetch) {
  if (!trustedMediaUrl(value)) throw new Error("unsupported_photo");
  if (videoFilename(value)) throw new Error("unsupported_video");
  const response = await fetchImpl(value, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("unsupported_photo");
  }
  if (/^video\//.test((response.headers.get("content-type") || "").trim().toLowerCase())) {
    await response.body.cancel();
    throw new Error("unsupported_video");
  }
  const declaredTooLarge = Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES;
  const prefix = new Uint8Array(512); let prefixLength = 0;
  const chunks = []; let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      const take = Math.min(value.length, prefix.length-prefixLength);
      prefix.set(value.subarray(0,take),prefixLength); prefixLength += take;
      if (videoSignature(prefix.subarray(0,prefixLength))) { await reader.cancel(); throw new Error("unsupported_video"); }
      if (size > MAX_IMAGE_BYTES || declaredTooLarge && prefixLength === prefix.length) {
        await reader.cancel(); throw new Error("unsupported_photo");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (declaredTooLarge) throw new Error("unsupported_photo");
  let bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let mime;
  if (size >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
  else if (size >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) mime = "image/png";
  else if (size >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") mime = "image/webp";
  else {
    // Lazy-load the WASM codec only for HEIC candidates, never for ordinary photos.
    if (size < 16 || new TextDecoder().decode(bytes.subarray(4,8)) !== "ftyp") throw new Error("unsupported_photo");
    const {convertHeic}=await import("./heic.mjs");
    bytes=await convertHeic(bytes);
    if(bytes.length > MAX_IMAGE_BYTES) throw new Error("unsupported_photo");
    mime="image/jpeg";
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
