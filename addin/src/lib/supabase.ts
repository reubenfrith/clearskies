import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.warn(
    "ClearSkies: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — " +
    "copy addin/.env.example to addin/.env and fill in your Supabase credentials."
  );
}

// Fall back to stub values so createClient doesn't throw at module-load time.
// All Supabase calls will fail gracefully and surface errors inside each component.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  key ?? "placeholder-key"
);
