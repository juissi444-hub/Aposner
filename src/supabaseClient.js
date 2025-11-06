import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Test if storage is actually available (Chrome can block it)
const isStorageAvailable = (type) => {
  try {
    const storage = window[type];
    const test = '__storage_test__';
    storage.setItem(test, test);
    storage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

// Custom storage adapter that works reliably across all browsers (Chrome, Firefox, Safari, Edge)
const customStorageAdapter = {
  getItem: (key) => {
    try {
      if (typeof window === 'undefined') return null;

      // Try localStorage first (works in Chrome, Firefox, Safari)
      if (isStorageAvailable('localStorage')) {
        try {
          const item = window.localStorage.getItem(key);
          if (item && item !== 'undefined' && item !== 'null') {
            console.log(`✅ [${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'}] Retrieved from localStorage`);
            return item;
          }
        } catch (e) {
          console.warn('localStorage.getItem failed:', e);
        }
      }

      // Fallback to sessionStorage (Chrome sometimes prefers this)
      if (isStorageAvailable('sessionStorage')) {
        try {
          const item = window.sessionStorage.getItem(key);
          if (item && item !== 'undefined' && item !== 'null') {
            console.log(`⚠️ Retrieved from sessionStorage (fallback)`);
            // Try to copy to localStorage for next time
            if (isStorageAvailable('localStorage')) {
              try {
                window.localStorage.setItem(key, item);
              } catch (e) {
                // Quota exceeded or blocked - ignore
              }
            }
            return item;
          }
        } catch (e) {
          console.warn('sessionStorage.getItem failed:', e);
        }
      }

      console.warn(`❌ No session found in any storage`);
      return null;
    } catch (error) {
      console.error('❌ Storage access completely blocked:', error);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window === 'undefined') return;

      // Validate value
      if (!value || value === 'undefined' || value === 'null') {
        console.warn(`⚠️ Skipping invalid value: ${value}`);
        return;
      }

      console.log(`💾 Storing session (Chrome-safe)`);

      let savedToLocalStorage = false;
      let savedToSessionStorage = false;

      // Try localStorage first
      if (isStorageAvailable('localStorage')) {
        try {
          window.localStorage.setItem(key, value);
          savedToLocalStorage = true;
          console.log('✅ Saved to localStorage');
        } catch (e) {
          // Chrome quota exceeded or blocked
          console.warn('localStorage.setItem failed:', e.name);
          if (e.name === 'QuotaExceededError') {
            // Try to clear old data
            try {
              window.localStorage.clear();
              window.localStorage.setItem(key, value);
              savedToLocalStorage = true;
              console.log('✅ Saved to localStorage after clearing quota');
            } catch (e2) {
              console.warn('Still failed after clearing');
            }
          }
        }
      }

      // Always also save to sessionStorage as backup (Chrome-friendly)
      if (isStorageAvailable('sessionStorage')) {
        try {
          window.sessionStorage.setItem(key, value);
          savedToSessionStorage = true;
          console.log('✅ Saved to sessionStorage (backup)');
        } catch (e) {
          console.warn('sessionStorage.setItem failed:', e.name);
        }
      }

      if (!savedToLocalStorage && !savedToSessionStorage) {
        console.error('❌ Failed to save session to any storage!');
      }
    } catch (error) {
      console.error('❌ Unexpected error in setItem:', error);
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window === 'undefined') return;

      console.log(`🗑️ Removing session (all browsers)`);

      // Remove from both storages (Chrome-safe)
      if (isStorageAvailable('localStorage')) {
        try {
          window.localStorage.removeItem(key);
        } catch (e) {
          console.warn('localStorage.removeItem failed:', e);
        }
      }

      if (isStorageAvailable('sessionStorage')) {
        try {
          window.sessionStorage.removeItem(key);
        } catch (e) {
          console.warn('sessionStorage.removeItem failed:', e);
        }
      }

      console.log('✅ Session removed from all storages');
    } catch (error) {
      console.error('❌ Error in removeItem:', error);
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
        storageKey: 'aposner-auth-token',
        // Chrome-specific settings for better compatibility
        flowType: 'implicit', // Better for Chrome
        debug: false
      }
    })
  : null;

export const isSupabaseConfigured = () => {
  return supabase !== null;
};
