import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import jpeg from "jpeg-js";
import {convertHeic,heicSignature,resizeHeicPlane} from "../supabase/functions/process-messages/heic.mjs";
import {loadImage} from "../supabase/functions/process-messages/media.mjs";

const sample=Buffer.from(readFileSync(new URL("./fixtures/green.heic.base64",import.meta.url),"utf8").trim(),"base64");

test("HEIC photos become a correctly sized JPEG with recognizable pixels",async()=>{
  assert.equal(heicSignature(sample),true);
  const output=await convertHeic(sample);
  const image=jpeg.decode(output,{useTArray:true});
  assert.equal(image.width,16);assert.equal(image.height,12);
  for(const [i,value] of [34,170,85].entries()) assert.ok(Math.abs(image.data[i]-value)<12);
  const loaded=await loadImage("https://storage.googleapis.com/inbound-file-store/test.HEIC",async()=>new Response(sample));
  assert.match(loaded,/^data:image\/jpeg;base64,/);
});

test("HEIC detection rejects truncated, corrupt and non-HEIC containers",async()=>{
  for(const bytes of [new Uint8Array(),sample.subarray(0,10),new TextEncoder().encode("not an image")]){
    assert.equal(heicSignature(bytes),false);await assert.rejects(convertHeic(bytes));
  }
  const fake=new Uint8Array(24);new DataView(fake.buffer).setUint32(0,24);
  fake.set(new TextEncoder().encode("ftypavif"),4);
  assert.equal(heicSignature(fake),false);
  fake.set(new TextEncoder().encode("heic"),8);
  assert.equal(heicSignature(fake),true);
  await assert.rejects(convertHeic(fake),{message:"photo_conversion_failed"});
});

test("HEIC resizing respects padded rows and enforces pixel limits",()=>{
  const plane={width:1,height:2,stride:8,data:new Uint8Array([255,0,0,255,0,0,0,0,0,0,255,255,0,0,0,0])};
  assert.deepEqual([...resizeHeicPlane(plane,1,2).data],[255,0,0,255,0,0,255,255]);
  assert.throws(()=>resizeHeicPlane(plane,6000,4000),{message:"photo_dimensions_exceeded"});
  assert.throws(()=>resizeHeicPlane({...plane,stride:2},1,2));
  assert.throws(()=>resizeHeicPlane(plane,NaN,1));
});
