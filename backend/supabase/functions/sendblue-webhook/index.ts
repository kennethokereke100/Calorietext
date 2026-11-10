import { createHandler } from "./handler.mjs";
import { processOne } from "../process-messages/processor.mjs";

const getEnv = (name: string) => Deno.env.get(name);
Deno.serve(createHandler({
  getEnv,
  onRecorded: () => EdgeRuntime.waitUntil(processOne({ getEnv }).catch(() => undefined)),
}));
