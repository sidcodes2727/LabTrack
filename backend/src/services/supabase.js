import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const isPublishableKey = String(serviceKey || '').startsWith('sb_publishable_');

if (!supabaseUrl || !serviceKey) {
  console.warn('Supabase URL or Service key is missing. API calls will fail until env is configured.');
}

if (isPublishableKey) {
  console.warn('SUPABASE_SERVICE_KEY appears to be a publishable key. Use SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) on backend to avoid RLS upload failures.');
}

export const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
