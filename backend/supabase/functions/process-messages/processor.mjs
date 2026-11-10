import { database, encryptPayload, decryptPayload, phoneHash, sendblueHeaders } from "../_shared/runtime.mjs";
import { generateReply } from "./ai.mjs";
import { loadImage } from "./media.mjs";
import { sendReaction } from "./reactions.mjs";
const STOP = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;
const START = /^(start|unstop)$/i;
const HELP = /^(help|hi|hello|hey|get started)$/i;
const TODAY = /^(today|summary|daily total)$/i;
const HELP_TEXT = "Hey! I'm Calorietext, your AI food and fitness buddy 👋 Send me a food pic or tell me what you ate, and I'll estimate the calories and macros. Include portions if you can. TODAY shows your logged daily total (UTC). STOP pauses replies.";

export async function processOne({ getEnv, fetchImpl = fetch, db = database(getEnv, fetchImpl) }) {
  if (getEnv("CALORIETEXT_INGEST_ENABLED") !== "true" || getEnv("CALORIETEXT_REPLY_ENABLED") !== "true") return { state: "disabled" };
  for (const name of ["OPENAI_API_KEY","SENDBLUE_API_KEY","SENDBLUE_API_SECRET","PHONE_HASH_KEY","MESSAGE_ENCRYPTION_KEY"]) {
    if (!getEnv(name)) return { state: "setup_incomplete" };
  }
  const events = await db("rpc/calorietext_claim_event", { method: "POST", body: {} });
  const event = events?.[0]; if (!event) return { state: "empty" };
  const key = getEnv("MESSAGE_ENCRYPTION_KEY");
  const path = `calorietext_webhook_events?id=eq.${event.id}&lock_token=eq.${event.lock_token}`;
  let sendStarted = false;
  const finish = (status, last_error = null) => db(path, { method: "PATCH", body: {
    status, last_error, processed_at: new Date().toISOString(),
    ...(status === "completed" ? { payload_ciphertext: "v1:cleared", reply_ciphertext: null } : {}),
  } });
  try {
    const payload = await decryptPayload(event.payload_ciphertext, key);
    const allowed = (getEnv("PILOT_ALLOWED_NUMBERS") || "").split(",").map(s => s.trim());
    if (!allowed.includes(payload.from_number) || payload.to_number !== getEnv("SENDBLUE_FROM_NUMBER")) {
      await finish("completed", "contact_not_allowed"); return { state: "ignored" };
    }
    const trainers = await db("calorietext_trainers?slug=eq.calorietext&select=id");
    if (!trainers?.[0]) throw new Error("trainer_not_configured");
    const hash = await phoneHash(payload.from_number, getEnv("PHONE_HASH_KEY"));
    const clientFilter = `trainer_id=eq.${trainers[0].id}&phone_lookup_hash=eq.${hash}`;
    await db("calorietext_clients?on_conflict=trainer_id,phone_lookup_hash", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: {
      trainer_id: trainers[0].id, phone_lookup_hash: hash, phone_ciphertext: await encryptPayload(payload.from_number, key), consented_at: new Date().toISOString(),
    } });
    const client = (await db(`calorietext_clients?${clientFilter}&select=id,opted_out_at`))[0];
    if (!client) throw new Error("client_unavailable");
    const text = (payload.content || "").trim();
    if (STOP.test(text) || (payload.opted_out === true && !START.test(text))) {
      await db(`calorietext_clients?id=eq.${client.id}`, { method: "PATCH", body: { opted_out_at: new Date().toISOString() } });
      await finish("completed", "opted_out"); return { state: "opted_out" };
    }
    if (client.opted_out_at && !START.test(text)) { await finish("completed", "opted_out"); return { state: "opted_out" }; }
    if (START.test(text)) await db(`calorietext_clients?id=eq.${client.id}`, { method: "PATCH", body: { opted_out_at: null, consented_at: new Date().toISOString() } });

    await db("calorietext_messages?on_conflict=provider_message_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: {
      client_id: client.id, provider_message_id: payload.message_handle, direction: "inbound",
      body_ciphertext: await encryptPayload({ content: text, has_photo: !!payload.media_url }, key),
    } });
    const message = (await db(`calorietext_messages?provider_message_id=eq.${encodeURIComponent(payload.message_handle)}&select=id`))[0];
    let result = event.reply_ciphertext ? await decryptPayload(event.reply_ciphertext, key) : null;
    if (!result) {
      if (HELP.test(text) && !payload.media_url || START.test(text)) result = { reply: HELP_TEXT, meal: null };
      else if (TODAY.test(text) && !payload.media_url) {
        const day = new Date().toISOString().slice(0,10);
        const meals = await db(`calorietext_meals?client_id=eq.${client.id}&eaten_at=gte.${day}T00:00:00Z&select=calories,protein_g,carbs_g,fat_g`);
        const total = meals.reduce((a,m) => { for (const k of Object.keys(a)) a[k] += Number(m[k]); return a; }, { calories:0, protein_g:0, carbs_g:0, fat_g:0 });
        result = { meal: null, reply: meals.length ? `Here's your day so far (UTC) 🍽️\nAbout ${Math.round(total.calories)} calories\n${Math.round(total.protein_g)}g protein · ${Math.round(total.carbs_g)}g carbs · ${Math.round(total.fat_g)}g fat\nFrom ${meals.length} logged ${meals.length === 1 ? "meal" : "meals"}.` : "Nothing logged today yet (UTC). Send me a food pic or tell me what you ate 🍽️" };
      } else {
        let image;
        if (payload.media_url) {
          try { image = await loadImage(payload.media_url, fetchImpl); }
          catch { result = { meal: null, reply: "I couldn't open that photo. Try opening it in Photos, taking a screenshot, and sending the screenshot here. You can also describe your meal and portions in a text." }; }
        }
        if (!result) {
          const reserved = await db("rpc/calorietext_reserve_ai_call", { method: "POST", body: {} });
          if (!reserved) result = { meal: null, reply: "This private pilot has reached its 20 AI requests for today (UTC). Try tomorrow. You can still text TODAY to see logged meals or STOP to pause replies." };
          else {
            const rows = await db(`calorietext_messages?client_id=eq.${client.id}&provider_message_id=neq.${encodeURIComponent(payload.message_handle)}&order=created_at.desc&limit=6&select=direction,body_ciphertext`);
            const history = [];
            for (const row of rows.reverse()) {
              const data = await decryptPayload(row.body_ciphertext, key);
              if (data.content) history.push({ role: row.direction === "inbound" ? "user" : "assistant", content: data.content.slice(0,2000) });
            }
            result = await generateReply({ getEnv, fetchImpl, text: text.slice(0,4000), image, history });
          }
        }
      }
      await db(`${path}&status=eq.processing`, { method: "PATCH", body: { reply_ciphertext: await encryptPayload(result,key) } });
    }
    if (result.meal) {
      await db("calorietext_meals?on_conflict=source_message_id", { method:"POST", prefer:"resolution=ignore-duplicates,return=minimal",
        body: { ...result.meal, client_id: client.id, source_message_id: message.id, is_estimate:true } });
    }
    if (!await db("rpc/calorietext_begin_send", { method:"POST", body: { event_id:event.id,event_lock:event.lock_token } })) return { state:"lease_lost" };
    sendStarted = true;
    // The vendor's send endpoint does not document an idempotency key. Never blindly retry an ambiguous send.
    const response = await fetchImpl("https://api.sendblue.com/api/send-message", {
      method:"POST", headers:sendblueHeaders(getEnv), signal:AbortSignal.timeout(20000),
      body:JSON.stringify({ number:payload.from_number,from_number:getEnv("SENDBLUE_FROM_NUMBER"),content:result.reply }),
    });
    const sent = await response.json();
    if (!response.ok || !sent.message_handle || ["ERROR","DECLINED","TIMEOUT"].includes(sent.status)) {
      await finish("uncertain", `sendblue_${response.status}`); return { state:"send_needs_review" };
    }
    await db(path, { method:"PATCH", body: { status:"completed",processed_at:new Date().toISOString(),sent_provider_id:sent.message_handle,
      payload_ciphertext:"v1:cleared",reply_ciphertext:null,last_error:null } });
    await db("calorietext_messages?on_conflict=provider_message_id", { method:"POST",prefer:"resolution=ignore-duplicates,return=minimal",
      body: { client_id:client.id,provider_message_id:sent.message_handle,direction:"outbound",body_ciphertext:await encryptPayload({content:result.reply},key) } });
    const reaction = await sendReaction({ getEnv, fetchImpl, payload, reaction: result.reaction });
    return { state:"sent", reaction };
  } catch (error) {
    const safeCode = /^[a-z_]+(?:_\d{3})?$/.test(error.message || "") ? error.message : "processing_failed";
    try { await db(`${path}&status=in.(processing,sending)`, { method:"PATCH", body: {
      status:sendStarted ? "uncertain" : "failed",last_error:safeCode,retry_after:new Date(Date.now()+60000).toISOString(),
    } }); } catch { /* A later lease recovery handles this without logging message content. */ }
    return { state:sendStarted ? "send_needs_review" : "retry_pending" };
  }
}
