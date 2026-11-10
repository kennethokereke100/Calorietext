import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadImage } from "../supabase/functions/process-messages/media.mjs";
import { videoSignature } from "../supabase/functions/process-messages/video.mjs";

const cdn="https://storage.googleapis.com/inbound-file-store/";
const encoder=new TextEncoder();
function ftyp(major,...compatible) {
  const b=new Uint8Array(16+compatible.length*4);
  new DataView(b.buffer).setUint32(0,b.length);
  b.set(encoder.encode("ftyp"),4);b.set(encoder.encode(major),8);
  compatible.forEach((brand,i)=>b.set(encoder.encode(brand),16+i*4));
  return b;
}

test("video filenames reject before downloading while untrusted URLs stay blocked",async()=>{
  for(const suffix of ["mp4","MOV","m4v","webm","mkv","avi","mpeg","3gp","ogv","wmv"]) {
    await assert.rejects(loadImage(`${cdn}clip.${suffix}?token=test`,()=>{throw Error("must not fetch");}),{message:"unsupported_video"});
  }
  await assert.rejects(loadImage(`${cdn}clip%2Emp4`,()=>{throw Error("must not fetch");}),{message:"unsupported_video"});
  await assert.rejects(loadImage("https://127.0.0.1/clip.mp4",()=>{throw Error("must not fetch");}),{message:"unsupported_photo"});
});

test("video MIME types cancel large or opaque attachments before reading their body",async()=>{
  for(const mime of ["video/mp4","video/quicktime","video/webm","Video/X-Matroska; codecs=test"]) {
    let reads=0,canceled=false;
    const body=new ReadableStream({pull(){reads++;},cancel(){canceled=true;}},{highWaterMark:0});
    await assert.rejects(loadImage(`${cdn}opaque`,async()=>new Response(body,{headers:{"content-type":mime,"content-length":"1000000000"}})),{message:"unsupported_video"});
    assert.equal(reads,0);assert.equal(canceled,true);
  }
});

test("video signatures identify opaque split streams and cancel without downloading the whole clip",async()=>{
  const avi=new Uint8Array(12);avi.set(encoder.encode("RIFF"));avi.set(encoder.encode("AVI "),8);
  const webm=new Uint8Array([0x1a,0x45,0xdf,0xa3,0x42,0x82,0x84,...encoder.encode("webm")]);
  for(const bytes of [ftyp("isom","mp42"),ftyp("qt  "),ftyp("M4V "),ftyp("3gp6"),avi,webm]) {
    let offset=0,canceled=false;
    const body=new ReadableStream({
      pull(controller){
        if(offset>=bytes.length) throw Error("must cancel before reading the rest of the video");
        controller.enqueue(bytes.subarray(offset,offset+3));offset+=3;
      },cancel(){canceled=true;},
    },{highWaterMark:0});
    await assert.rejects(loadImage(`${cdn}opaque`,async()=>new Response(body,{headers:{"content-type":"application/octet-stream","content-length":"1000000000"}})),{message:"unsupported_video"});
    assert.equal(canceled,true);
  }
});

test("shared image containers and audio are not mistaken for video; image limits remain enforced",async()=>{
  for(const bytes of [ftyp("mif1","heic","isom"),ftyp("isom","avif"),ftyp("M4A ","isom"),new Uint8Array()]) {
    assert.equal(videoSignature(bytes),false);
  }
  const heic=Buffer.from(readFileSync(new URL("./fixtures/green.heic.base64",import.meta.url),"utf8").trim(),"base64");
  assert.equal(videoSignature(heic.subarray(0,512)),false);
  assert.match(await loadImage(`${cdn}photo`,async()=>new Response(heic)),/^data:image\/jpeg;base64,/);
  for(const bytes of [new Uint8Array([255,216,255,0]),new Uint8Array([137,80,78,71,13,10,26,10])]) {
    assert.equal(videoSignature(bytes),false);
    assert.match(await loadImage(`${cdn}photo?filename=clip.mp4`,async()=>new Response(bytes)),/^data:image\//);
  }
  let canceled=false;
  const tooLarge=new ReadableStream({start(c){c.enqueue(new Uint8Array(512));},cancel(){canceled=true;}});
  await assert.rejects(loadImage(`${cdn}photo`,async()=>new Response(tooLarge,{headers:{"content-length":"1000000000"}})),{message:"unsupported_photo"});
  assert.equal(canceled,true);
});
