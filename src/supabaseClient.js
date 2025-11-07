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

// Custom storage adapter for Samsung Chrome compatibility
// Samsung Chrome has issues with localStorage in certain modes
const createCustomStorage = () => {
  const memoryStore = new Map(); // Fallback for when localStorage fails

  return {
    getItem: (key) => {
      try {
        // Try localStorage first
        const item = window.localStorage.getItem(key);
        if (item !== null) return item;

        // Fallback to memory store
        return memoryStore.get(key) || null;
      } catch (e) {
        console.warn('localStorage read failed, using memory store:', e);
        return memoryStore.get(key) || null;
      }
    },
    setItem: (key, value) => {
      try {
        // Try localStorage first
        window.localStorage.setItem(key, value);
        // Also store in memory as backup
        memoryStore.set(key, value);
      } catch (e) {
        console.warn('localStorage write failed, using memory store:', e);
        // Fallback to memory store only
        memoryStore.set(key, value);
      }
    },
    removeItem: (key) => {
      try {
        window.localStorage.removeItem(key);
        memoryStore.delete(key);
      } catch (e) {
        console.warn('localStorage remove failed:', e);
        memoryStore.delete(key);
      }
    }
  };
};

// Create Supabase client with persistent session storage
// This ensures login persists across page refreshes
// Uses custom storage adapter for Samsung Chrome compatibility
export const supabase = isValidCredentials()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true, // CRITICAL: Keep user logged in across refreshes
        autoRefreshToken: true, // Auto-refresh tokens to keep session alive
        detectSessionInUrl: false, // Don't check URL for auth callbacks
        storage: createCustomStorage(), // Custom storage for Samsung Chrome
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
