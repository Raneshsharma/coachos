import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.");
  }

  cachedClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}
