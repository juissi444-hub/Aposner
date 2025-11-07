import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate that credentials are not placeholder values
const isValidCredentials = () => {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  if (supabaseUrl.includes('your_supabase_url_here')) return false;
  if (supabaseAnonKey.includes('your_supabase_anon_key_here')) return false;
  if (!supabaseUrl.includes('supabase.co')) return false;
  if (supabaseAnonKey.length < 100) return false; // Valid keys are long
  return true;
};

// Create Supabase client with persistent session storage
// This ensures login persists across page refreshes
export const supabase = isValidCredentials()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true, // CRITICAL: Keep user logged in across refreshes
        autoRefreshToken: true, // Auto-refresh tokens to keep session alive
        detectSessionInUrl: false, // Don't check URL for auth callbacks
        storage: window.localStorage, // Explicitly use localStorage for persistence
        storageKey: 'aposner-auth-session', // Custom key for session storage
        flowType: 'pkce' // Use PKCE flow for better security
      }
    })
  : null;

// Check if Supabase is properly configured with valid credentials
export const isSupabaseConfigured = () => {
  const configured = supabase !== null;

  if (!configured) {
    console.warn('⚠️ Supabase is not configured. Please set up your .env file with valid credentials.');
    console.warn('📖 See SETUP_INSTRUCTIONS.md for details.');
  }

  return configured;
};
