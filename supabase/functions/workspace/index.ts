import { createTikTokService } from "../../../platform/src/tiktok.mjs";
import {
  bindTeamUser,
  listTeam,
  saveTeamMember,
} from "../../../platform/src/team.mjs";
import { createClient } from "@supabase/supabase-js";
import { createMediaService } from "../../../platform/src/media.mjs";
import { createHostedHandler } from "../../../platform/src/hosted-handler.mjs";
const dbUrl = Deno.env.get("SUPABASE_DB_URL");
if (!dbUrl) throw new Error("Hosted database is not configured.");
const { snapshot, savePost, act, membership } =
  await import("../../../platform/src/service.mjs");
const authClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { transaction } = await import("../../../platform/src/database.mjs");
const storageClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const media = createMediaService({
  transaction,
  membership,
  storage: storageClient.storage,
});
const handler = createHostedHandler({
  tiktok: createTikTokService({
    transaction,
    storage: storageClient.storage,
    config: {
      clientKey: Deno.env.get("TIKTOK_CLIENT_KEY"),
      clientSecret: Deno.env.get("TIKTOK_CLIENT_SECRET"),
      tokenKey: Deno.env.get("PROVIDER_TOKEN_KEY"),
      environment: Deno.env.get("TIKTOK_ENVIRONMENT") || "sandbox",
      redirectUri: "https://scheduly-workspace.vercel.app/workspace.html",
    },
  }),
  authenticate: async (token: string) => {
    const { data, error } = await authClient.auth.getUser(token);
    return error ? null : data.user;
  },
  snapshot,
  savePost,
  act,
  media,
  team: {
    bind: bindTeamUser,
    list: listTeam,
    save: saveTeamMember,
    invite: async (user: string, input: { email: string }) => {
      const { members } = await listTeam(user);
      const member = members.find(
        (m: { email: string; active: boolean }) =>
          m.email === input.email && m.active,
      );
      if (!member) throw new Error("Active team member required.");
      const { error } = await authClient.auth.signInWithOtp({
        email: member.email,
        options: {
          emailRedirectTo:
            "https://scheduly-workspace.vercel.app/workspace.html",
        },
      });
      if (error) throw error;
      return { sent: true };
    },
  },
  allowedOrigins: (
    Deno.env.get("SCHEDULY_ALLOWED_ORIGINS") ||
    "https://scheduly-workspace.vercel.app,http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:5176,http://localhost:5176"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});
Deno.serve(handler);
