import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Custom storage adapter that's more reliable on mobile with better persistence
const customStorageAdapter = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined') {
        // Always prioritize localStorage for persistence across page refreshes
        if (window.localStorage) {
          const item = window.localStorage.getItem(key);
          if (item !== null && item !== undefined && item !== 'undefined') {
            console.log(`✅ Retrieved session from localStorage: ${key.substring(0, 20)}...`);
            return item;
          }
        }
        // Only fallback to sessionStorage if localStorage truly has nothing
        if (window.sessionStorage) {
          const item = window.sessionStorage.getItem(key);
          if (item !== null && item !== undefined && item !== 'undefined') {
            console.log(`⚠️ Retrieved session from sessionStorage (fallback): ${key.substring(0, 20)}...`);
            // Copy to localStorage for next time
            try {
              window.localStorage.setItem(key, item);
              console.log('📝 Copied session to localStorage for persistence');
            } catch (e) {
              console.warn('Could not copy to localStorage:', e);
            }
            return item;
          }
        }
      }
      console.warn(`❌ No session found in storage for key: ${key.substring(0, 20)}...`);
      return null;
    } catch (error) {
      console.error('❌ Error reading from storage:', error);
      // Try sessionStorage as last resort
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          const item = window.sessionStorage.getItem(key);
          if (item !== null && item !== undefined && item !== 'undefined') {
            return item;
          }
        }
      } catch (e) {
        console.error('❌ SessionStorage also failed:', e);
      }
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        // Ensure we're not storing undefined or null values
        if (value === null || value === undefined || value === 'undefined' || value === 'null') {
          console.warn(`⚠️ Attempted to store invalid value: ${value}`);
          return;
        }

        console.log(`💾 Storing session in localStorage: ${key.substring(0, 20)}...`);

        // Always write to localStorage first for persistence
        if (window.localStorage) {
          window.localStorage.setItem(key, value);
          console.log('✅ Session saved to localStorage');
        }
        // Also save to sessionStorage as backup
        if (window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
          console.log('✅ Session saved to sessionStorage (backup)');
        }
      }
    } catch (error) {
      console.error('❌ Error writing to localStorage:', error);
      // Fallback to sessionStorage only
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(key, value);
          console.warn('⚠️ Saved to sessionStorage only (localStorage failed)');
        }
      } catch (e) {
        console.error('❌ SessionStorage also failed:', e);
      }
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined') {
        console.log(`🗑️ Removing session: ${key.substring(0, 20)}...`);
        if (window.localStorage) {
          window.localStorage.removeItem(key);
        }
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(key);
        }
        console.log('✅ Session removed from both storages');
      }
    } catch (error) {
      console.error('❌ Error removing from storage:', error);
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
