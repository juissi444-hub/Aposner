import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Simple storage adapter - no custom logic, just use browser defaults
// This works the same way in Chrome, Firefox, Safari, and Edge
const customStorageAdapter = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // Storage blocked or quota exceeded - ignore
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      // Ignore errors
    }
  }
};

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: customStorageAdapter,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'aposner-auth-token'
      }
    })
  : null;

export const isSupabaseConfigured = () => {
  return supabase !== null;
};
