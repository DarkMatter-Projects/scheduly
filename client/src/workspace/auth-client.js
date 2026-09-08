import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_WORKSPACE_SUPABASE_URL;
const key = import.meta.env.VITE_WORKSPACE_SUPABASE_PUBLISHABLE_KEY;
const hosted = Boolean(import.meta.env.VITE_WORKSPACE_API_URL);
if (hosted && (!url || !key))
  throw new Error("Hosted workspace authentication is not configured.");
export const supabase = hosted
  ? createClient(url, key, { auth: { flowType: "implicit" } })
  : null;
