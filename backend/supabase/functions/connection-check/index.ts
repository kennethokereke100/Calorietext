import { createConnectionCheck } from "./handler.mjs";
Deno.serve(createConnectionCheck({ getEnv: (name: string) => Deno.env.get(name) }));
