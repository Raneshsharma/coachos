import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let envBindings: Record<string, string> | null = null;

export function initEnv(env: Record<string, string>) {
  envBindings = env;
}

export function getEnv(key: string): string | undefined {
  return envBindings?.[key] ?? (process.env as Record<string, string>)?.[key];
}

export function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseKey = getEnv("SUPABASE_SERVICE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.");
  }

  cachedClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}
