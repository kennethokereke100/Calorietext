import test from "node:test";
import assert from "node:assert/strict";
import { processOne } from "../supabase/functions/process-messages/processor.mjs";
import { encryptPayload, decryptPayload, phoneHash } from "../supabase/functions/_shared/runtime.mjs";
import { trustedMediaUrl, loadImage } from "../supabase/functions/process-messages/media.mjs";
import { validateReply, generateReply } from "../supabase/functions/process-messages/ai.mjs";

const ENV = { CALORIETEXT_INGEST_ENABLED:"true",CALORIETEXT_REPLY_ENABLED:"true",OPENAI_API_KEY:"test-only-openai",
  SENDBLUE_API_KEY:"test-only-sendblue",SENDBLUE_API_SECRET:"test-only-sendblue-secret",MESSAGE_ENCRYPTION_KEY:"ab".repeat(32),PHONE_HASH_KEY:"cd".repeat(32),
  SENDBLUE_FROM_NUMBER:"+12025550123",PILOT_ALLOWED_NUMBERS:"+12025550124" };
const meal = { description:"One apple",calories:95,protein_g:0.5,carbs_g:25,fat_g:0.3 };
async function fixture({text="hello",media="",allowed=true,optedOut=false,budget=true,claim=true,lease=true,sendFails=false,mealWriteFails=false}={}) {
  const event = {id:"event-id",lock_token:"lock-id",payload_ciphertext:await encryptPayload({from_number:allowed?"+12025550124":"+12025550125",to_number:ENV.SENDBLUE_FROM_NUMBER,content:text,media_url:media,message_handle:"inbound-test"},ENV.MESSAGE_ENCRYPTION_KEY)};
  const calls=[], requests=[];
  const db=async(path,opts={})=>{
    calls.push({path,...opts});
    if(path==="rpc/calorietext_claim_event") return claim?[event]:[];
    if(path==="rpc/calorietext_reserve_ai_call") return budget;
    if(path==="rpc/calorietext_begin_send") return lease;
    if(path.startsWith("calorietext_trainers?")) return [{id:"trainer-id"}];
    if(path.startsWith("calorietext_clients?trainer_id=")) return [{id:"client-id",opted_out_at:optedOut?"2026-01-01":null}];
    if(path.startsWith("calorietext_messages?provider_message_id=")) return [{id:"message-id"}];
    if(path.startsWith("calorietext_messages?client_id=")) return [];
    if(path.startsWith("calorietext_meals?client_id=")) return [meal];
    if(path.startsWith("calorietext_meals?") && opts.method==="POST" && mealWriteFails) throw new Error("database_503");
    return [];
  };
  const fetchImpl=async(url,opts)=>{
    requests.push({url,...opts});
    if(url.includes("api.openai.com")) return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({reply:"Estimated apple: about 95 calories.",meal})}]}]});
    if(url.includes("send-message")) {
      if(sendFails) throw new Error("Sensitive provider failure must not be persisted");
      return Response.json({message_handle:"outbound-test",status:"QUEUED"});
    }
    throw new Error("Unexpected external request");
  };
  return {run:()=>processOne({getEnv:key=>ENV[key],db,fetchImpl}),calls,requests,db,fetchImpl};
}

test("greeting completes through REST with empty successful insert responses",async()=>{
  const f=await fixture();
  const env={...ENV,SUPABASE_URL:"https://database.example.test",SUPABASE_SECRET_KEYS:JSON.stringify({default:"sb_secret_test_only"})};
  let minimalWrites=0;
  const fetchImpl=async(url,opts)=>{
    if(!url.startsWith(`${env.SUPABASE_URL}/rest/v1/`)) return f.fetchImpl(url,opts);
    const path=url.slice(`${env.SUPABASE_URL}/rest/v1/`.length);
    const data=await f.db(path,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined});
    if(opts.headers.Prefer.includes("return=minimal")) {
      minimalWrites++;
      return new Response(null,{status:201});
    }
    return Response.json(data);
  };
  assert.equal((await processOne({getEnv:key=>env[key],fetchImpl})).state,"sent");
  assert.equal(minimalWrites,3);
  assert.equal(f.requests.length,1);
  assert.ok(f.calls.some(c=>c.body?.status==="completed"));
});

test("encryption detects tampering and phone hashes use a separate key",async()=>{
  const value=await encryptPayload({text:"private"},ENV.MESSAGE_ENCRYPTION_KEY);
  assert.deepEqual(await decryptPayload(value,ENV.MESSAGE_ENCRYPTION_KEY),{text:"private"});
  await assert.rejects(decryptPayload(value,"00".repeat(32)));
  const hash=await phoneHash("+12025550124",ENV.PHONE_HASH_KEY);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.notEqual(hash,await phoneHash("+12025550124",ENV.MESSAGE_ENCRYPTION_KEY));
});

test("media rejects internal URLs, credentials, other buckets and misleading hosts",async()=>{
  for(const url of ["http://storage.googleapis.com/inbound-file-store/a.jpg","https://127.0.0.1/a","https://169.254.169.254/a",
    "https://storage.googleapis.com.evil.test/inbound-file-store/a","https://storage.googleapis.com/another-bucket/a",
    "https://name:pass@storage.googleapis.com/inbound-file-store/a","https://storage.googleapis.com:444/inbound-file-store/a"]) {
    assert.equal(trustedMediaUrl(url),false);
    await assert.rejects(loadImage(url,()=>{throw new Error("must not fetch");}));
  }
  const url="https://storage.googleapis.com/inbound-file-store/test.jpg";
  let options;
  const image=await loadImage(url,async(_url,opts)=>{options=opts;return new Response(new Uint8Array([255,216,255,0]));});
  assert.ok(image.startsWith("data:image/jpeg;base64,"));
  assert.equal(options.redirect,"error");
  await assert.rejects(loadImage(url,async()=>new Response("not an image")));
  await assert.rejects(loadImage(url,async()=>new Response("x",{headers:{"content-length":String(9*1024*1024)}})));
});

test("AI response rejects invalid numeric estimates and oversized replies",()=>{
  assert.equal(validateReply({reply:"Fine",meal:null}).meal,null);
  for(const bad of [{reply:"",meal:null},{reply:"x".repeat(1601),meal:null},{reply:"Fine",meal:{...meal,calories:-1}},
    {reply:"Fine",meal:{...meal,calories:NaN}},{reply:"Fine",meal:{...meal,fat_g:Infinity}}]) assert.throws(()=>validateReply(bad));
});

test("AI requests limit output, disable response storage and handle incomplete generation",async()=>{
  let request;
  await assert.rejects(generateReply({getEnv:key=>ENV[key],text:"An apple",fetchImpl:async(_url,opts)=>{
    request=JSON.parse(opts.body);return Response.json({status:"incomplete",output:[]});
  }}));
  assert.equal(request.store,false);
  assert.equal(request.max_output_tokens,800);
  assert.equal(request.text.format.strict,true);
  assert.equal(request.tools,undefined);
  assert.ok(!JSON.stringify(request).includes(ENV.OPENAI_API_KEY));
});

test("empty queue and non-allowlisted contacts trigger no external requests",async()=>{
  for(const opts of [{claim:false},{allowed:false}]) {
    const f=await fixture(opts);await f.run();assert.equal(f.requests.length,0);
  }
});

test("STOP persists opt-out and suppresses all model and send calls",async()=>{
  const f=await fixture({text:" STOP "});
  assert.equal((await f.run()).state,"opted_out");
  assert.equal(f.requests.length,0);
  assert.ok(f.calls.some(c=>c.path==="calorietext_clients?id=eq.client-id" && c.body.opted_out_at));
  const paused=await fixture({text:"Log an apple",optedOut:true});
  assert.equal((await paused.run()).state,"opted_out");assert.equal(paused.requests.length,0);
});

test("START resumes the existing client without calling the model",async()=>{
  const f=await fixture({text:"START",optedOut:true});
  assert.equal((await f.run()).state,"sent");
  assert.ok(f.calls.some(c=>c.body?.opted_out_at===null));
  assert.equal(f.requests.length,1);
});

test("greeting and UTC daily totals use stored values without AI",async()=>{
  for(const text of ["hello","TODAY"]) {
    const f=await fixture({text});assert.equal((await f.run()).state,"sent");
    assert.equal(f.requests.length,1);
    const outgoing=JSON.parse(f.requests[0].body);
    assert.equal(outgoing.number,ENV.PILOT_ALLOWED_NUMBERS);
    assert.ok(text==="TODAY"?outgoing.content.includes("95 calories"):outgoing.content.includes("AI"));
  }
});

test("meal persists before sending and failure cannot claim it was logged",async()=>{
  const f=await fixture({text:"I ate one apple"});assert.equal((await f.run()).state,"sent");
  assert.equal(f.requests.length,2);
  const mealWrite=f.calls.find(c=>c.path.startsWith("calorietext_meals?on_conflict"));
  assert.equal(mealWrite.body.source_message_id,"message-id");assert.equal(mealWrite.body.is_estimate,true);
  const failing=await fixture({text:"I ate one apple",mealWriteFails:true});
  assert.equal((await failing.run()).state,"retry_pending");
  assert.ok(!failing.requests.some(r=>r.url.includes("send-message")));
});

test("daily budget blocks additional model calls",async()=>{
  const f=await fixture({text:"Log an apple",budget:false});assert.equal((await f.run()).state,"sent");
  assert.equal(f.requests.length,1);assert.ok(JSON.parse(f.requests[0].body).content.includes("20 AI requests"));
});

test("lost lease prevents sending; ambiguous send is not automatically retried",async()=>{
  const lost=await fixture({lease:false});assert.equal((await lost.run()).state,"lease_lost");assert.equal(lost.requests.length,0);
  const failed=await fixture({sendFails:true});assert.equal((await failed.run()).state,"send_needs_review");
  assert.equal(failed.requests.length,1);
  const update=failed.calls.at(-1);assert.equal(update.body.status,"uncertain");assert.equal(update.body.last_error,"processing_failed");
});

test("unsupported photo prompts for another format without contacting an arbitrary host",async()=>{
  const f=await fixture({text:"",media:"https://example.com/photo.heic"});assert.equal((await f.run()).state,"sent");
  assert.equal(f.requests.length,1);assert.ok(JSON.parse(f.requests[0].body).content.includes("screenshot"));
});
