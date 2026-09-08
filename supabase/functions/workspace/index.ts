import { createClient } from '@supabase/supabase-js';
import { createHostedHandler } from '../../../platform/src/hosted-handler.mjs';
const dbUrl = Deno.env.get('SUPABASE_DB_URL');
if (!dbUrl) throw new Error('Hosted database is not configured.');
const { snapshot, savePost, act } = await import('../../../platform/src/service.mjs');
const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
const handler = createHostedHandler({
  authenticate: async (token: string) => {
    const {data,error} = await authClient.auth.getUser(token);
    return error ? null : data.user;
  },
  snapshot, savePost, act,
  allowedOrigins: (Deno.env.get('SCHEDULY_ALLOWED_ORIGINS') || 'http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:5176,http://localhost:5176').split(',').map(s=>s.trim()).filter(Boolean),
});
Deno.serve(handler);
