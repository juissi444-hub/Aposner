import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Custom storage adapter that's more reliable on mobile with fallback to sessionStorage
const customStorageAdapter = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined') {
        // Try localStorage first
        if (window.localStorage) {
          const item = window.localStorage.getItem(key);
          if (item !== null) return item;
        }
        // Fallback to sessionStorage if localStorage fails
        if (window.sessionStorage) {
          return window.sessionStorage.getItem(key);
        }
      }
      return null;
    } catch (error) {
      console.warn('Error reading from storage:', error);
      // Try sessionStorage as last resort
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          return window.sessionStorage.getItem(key);
        }
      } catch (e) {
        console.warn('SessionStorage also failed:', e);
      }
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        // Try localStorage first
        if (window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        // Also save to sessionStorage as backup for mobile browsers
        if (window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
        }
      }
    } catch (error) {
      console.warn('Error writing to localStorage, trying sessionStorage:', error);
      // Fallback to sessionStorage only
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn('SessionStorage also failed:', e);
      }
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined') {
        if (window.localStorage) {
          window.localStorage.removeItem(key);
        }
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('Error removing from storage:', error);
    }
  }
};

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storage: customStorageAdapter,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'aposner-auth-token'
      }
    })
  : null;

export const isSupabaseConfigured = () => {
  return supabase !== null;
};
