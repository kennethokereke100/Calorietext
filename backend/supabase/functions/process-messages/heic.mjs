import heifFactory from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import jpeg from "jpeg-js";

const MAX_PIXELS = 13_000_000;
const MAX_SIDE = 1536;
let library;

export function heicSignature(bytes) {
  if (bytes.length < 16) return false;
  const type = new TextDecoder().decode(bytes.subarray(4,8));
  const size = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if (type !== "ftyp" || size < 16 || size > bytes.length || size > 256) return false;
  const brands = new Set(["heic","heix","hevc","hevx","heim","heis","hevm","hevs"]);
  for (let i = 8; i + 4 <= size; i += 4) {
    if (i !== 12 && brands.has(new TextDecoder().decode(bytes.subarray(i,i+4)))) return true;
  }
  return false;
}

// Select the container's primary image. Bound allocations before pixel decoding,
// then sample the decoder's own RGBA plane instead of copying a full-size image.
export function resizeHeicPlane(channel, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_PIXELS || width > 8192 || height > 8192) throw new Error("photo_dimensions_exceeded");
  if (!channel || channel.width !== width || channel.height !== height ||
      channel.stride < width * 4 || channel.data.length < channel.stride * height) throw new Error("photo_conversion_failed");
  const scale = Math.min(1, MAX_SIDE / Math.max(width,height));
  const outWidth = Math.max(1,Math.round(width*scale)), outHeight = Math.max(1,Math.round(height*scale));
  const data = new Uint8Array(outWidth*outHeight*4);
  for (let y=0; y<outHeight; y++) {
    const row=Math.min(height-1,Math.floor(y*height/outHeight))*channel.stride;
    for (let x=0; x<outWidth; x++) {
      const source=row+Math.min(width-1,Math.floor(x*width/outWidth))*4, target=(y*outWidth+x)*4;
      const alpha=channel.data[source+3]/255;
      for(let c=0;c<3;c++) data[target+c]=Math.round(channel.data[source+c]*alpha+255*(1-alpha));
      data[target+3]=255;
    }
  }
  return {width:outWidth,height:outHeight,data};
}

export async function convertHeic(bytes) {
  if (!heicSignature(bytes)) throw new Error("unsupported_photo");
  library ||= Promise.resolve().then(()=>heifFactory({print:()=>{},printErr:()=>{}}))
    .catch(error=>{library=undefined;throw error;});
  const lib=await library;
  let context, handle, decoded;
  try {
    context=lib.heif_context_alloc();
    if (!context) throw new Error("photo_conversion_failed");
    const read=lib.heif_context_read_from_memory(context,bytes);
    if (read.code !== lib.heif_error_code.heif_error_Ok) throw new Error("photo_conversion_failed");
    handle=lib.heif_js_context_get_primary_image_handle(context);
    if (!handle || handle.code) throw new Error("photo_conversion_failed");
    const width=lib.heif_image_handle_get_width(handle),height=lib.heif_image_handle_get_height(handle);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 ||
        width*height>MAX_PIXELS || width>8192 || height>8192) throw new Error("photo_dimensions_exceeded");
    decoded=lib.heif_js_decode_image2(handle,lib.heif_colorspace.heif_colorspace_RGB,lib.heif_chroma.heif_chroma_interleaved_RGBA);
    if (!decoded || decoded.code || !decoded.image) throw new Error("photo_conversion_failed");
    const channel=decoded.channels.find(c=>c.id===lib.heif_channel.heif_channel_interleaved);
    const resized=resizeHeicPlane(channel,width,height);
    // Release native pixels before JPEG encoding; no source EXIF/GPS is copied.
    lib.heif_image_release(decoded.image); decoded=null;
    return new Uint8Array(jpeg.encode(resized,85).data);
  } finally {
    if (decoded?.image) lib.heif_image_release(decoded.image);
    if (handle && !handle.code) lib.heif_image_handle_release(handle);
    if (context) lib.heif_context_free(context);
  }
}
