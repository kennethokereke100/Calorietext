import { json, secretsMatch } from "../_shared/runtime.mjs";
import { processOne } from "./processor.mjs";
const getEnv = (name: string) => Deno.env.get(name);
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405,{error:"method_not_allowed"});
  if (!await secretsMatch(getEnv("CALORIETEXT_ADMIN_SECRET"),req.headers.get("x-calorietext-admin-secret"))) return json(401,{error:"unauthorized"});
  try { return json(200,await processOne({getEnv})); }
  catch { return json(503,{error:"worker_unavailable"}); }
});
