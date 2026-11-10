const VIDEO_EXTENSION = /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|3gp|3g2|ogv|wmv|flv|mts|m2ts)$/i;
const IMAGE_BRANDS = new Set(["heic","heix","hevc","hevx","heim","heis","hevm","hevs","mif1","msf1","avif","avis"]);
const VIDEO_BRANDS = new Set(["isom","iso2","iso3","iso4","iso5","iso6","mp41","mp42","avc1","dash","M4V ","M4VH","M4VP","qt  "]);
const ascii = bytes => new TextDecoder().decode(bytes);

// Call only after the URL has passed the existing trusted-CDN check.
export function videoFilename(url) {
  try { return VIDEO_EXTENSION.test(decodeURIComponent(new URL(url).pathname)); }
  catch { return false; }
}

/** Recognize common video containers from at most the first 512 bytes. */
export function videoSignature(bytes) {
  if (bytes.length >= 12 && ascii(bytes.subarray(0,4)) === "RIFF" && ascii(bytes.subarray(8,12)) === "AVI ") return true;
  if (bytes.length >= 5 && ascii(bytes.subarray(0,3)) === "FLV" && bytes[3] === 1 && (bytes[4] & 1)) return true;
  if (bytes.length >= 4 && [0x1a,0x45,0xdf,0xa3].every((v,i)=>bytes[i]===v)) {
    return /webm|matroska/.test(ascii(bytes));
  }
  // HEIC/AVIF and MP4 share the ftyp container. Inspect the complete small
  // brand box, and give image brands priority over generic ISO media brands.
  if (bytes.length < 16 || ascii(bytes.subarray(4,8)) !== "ftyp") return false;
  const size = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if (size < 16 || size > 512 || size > bytes.length || size % 4) return false;
  const brands = [];
  for (let i=8; i+4<=size; i+=4) if (i!==12) brands.push(ascii(bytes.subarray(i,i+4)));
  if (brands.some(b=>IMAGE_BRANDS.has(b))) return false;
  // Explicit audio-only MP4 brands must not be reported as videos.
  if (["M4A ","M4B ","M4P ","F4A ","F4B "].includes(brands[0])) return false;
  return brands.some(b=>VIDEO_BRANDS.has(b) || /^3g[pe2]/.test(b));
}
