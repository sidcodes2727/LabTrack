import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn('Supabase URL or Service key is missing. API calls will fail until env is configured.');
}

export const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
