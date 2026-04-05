/**
 * Supabase client for CoachOS API (Cloudflare Workers).
 * Uses the service role key for server-side operations.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jmbrinamojsgfkfwgsce.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYnJpbmFtb2pzZ2ZrZndnc2NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NjcwOCwiZXhwIjoyMDkwOTUyNzA4fQ.P2m32L8He6VdqyAqYH3EBWBdS-feVSAdZ2wFqc0y7kU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
