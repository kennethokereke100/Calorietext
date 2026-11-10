import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../supabase/functions/_shared/runtime.mjs";

const env={SUPABASE_URL:"https://database.example.test",SUPABASE_SECRET_KEYS:JSON.stringify({default:"sb_secret_test_only"})};
const getEnv=name=>env[name];

test("REST writes accept empty 201, 200 and 204 success bodies",async()=>{
  for(const status of [201,200,204]) {
    const db=database(getEnv,async()=>new Response(null,{status}));
    assert.equal(await db("table",{method:"POST",body:{},prefer:"return=minimal"}),null);
  }
});

test("REST reads preserve JSON values including false RPC results",async()=>{
  for(const value of [[{id:"test-row"}],false,true,[]]) {
    const db=database(getEnv,async()=>Response.json(value));
    assert.deepEqual(await db("resource"),value);
  }
});

test("REST errors and malformed nonempty responses still fail",async()=>{
  const denied=database(getEnv,async()=>new Response("private detail",{status:403}));
  await assert.rejects(denied("resource"),{message:"database_403"});
  const malformed=database(getEnv,async()=>new Response("invalid json",{status:200}));
  await assert.rejects(malformed("resource"));
});
