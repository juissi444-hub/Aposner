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

// Simple localStorage adapter with Chrome compatibility
// Uses standard localStorage API with proper error handling
const createCustomStorage = () => {
  // Test if localStorage is available
  const testStorage = () => {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.error('❌ localStorage not available:', e);
      return false;
    }
  };

  const isAvailable = testStorage();

  if (!isAvailable) {
    console.warn('⚠️ localStorage not available - auth will not persist across refreshes');
  }

  return {
    getItem: (key) => {
      if (!isAvailable) return null;
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        console.error('❌ Storage read error:', e);
        return null;
      }
    },
    setItem: (key, value) => {
      if (!isAvailable) return;
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        console.error('❌ Storage write error:', e);
      }
    },
    removeItem: (key) => {
      if (!isAvailable) return;
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        console.error('❌ Storage remove error:', e);
      }
    }
  };
};

// Create Supabase client with persistent session storage
// This ensures login persists across page refreshes
// Uses simple localStorage adapter for Chrome compatibility
export const supabase = isValidCredentials()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true, // CRITICAL: Keep user logged in across refreshes
        autoRefreshToken: true, // Auto-refresh tokens to keep session alive
        detectSessionInUrl: false, // Don't check URL for auth callbacks
        storage: createCustomStorage() // Simple localStorage for Chrome compatibility
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
