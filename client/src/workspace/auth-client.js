import { createClient } from "@supabase/supabase-js";
// Remove provider codes before the auth SDK or other UI can inspect the URL.
const callbackParams = new URLSearchParams(window.location.search);
export const tiktokCallback = /^[0-9a-f]{64}$/.test(
  callbackParams.get("state") || "",
)
  ? {
      state: callbackParams.get("state"),
      code: callbackParams.get("code"),
      error: callbackParams.get("error"),
    }
  : null;
if (tiktokCallback)
  window.history.replaceState(null, "", window.location.pathname);
const url = import.meta.env.VITE_WORKSPACE_SUPABASE_URL;
const key = import.meta.env.VITE_WORKSPACE_SUPABASE_PUBLISHABLE_KEY;
const hosted = Boolean(import.meta.env.VITE_WORKSPACE_API_URL);
if (hosted && (!url || !key))
  throw new Error("Hosted workspace authentication is not configured.");
export const supabase = hosted
  ? createClient(url, key, { auth: { flowType: "implicit" } })
  : null;
