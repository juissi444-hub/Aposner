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

// Enhanced storage adapter for mobile Chrome compatibility
// Provides fallback chain: localStorage -> sessionStorage -> memory
// This ensures authentication persists across page refreshes even on problematic browsers
const createCustomStorage = () => {
  const memoryStore = new Map(); // Last resort fallback

  // Test if storage APIs are available
  const testStorage = (storage) => {
    try {
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  };

  const localStorageAvailable = testStorage(window.localStorage);
  const sessionStorageAvailable = testStorage(window.sessionStorage);

  console.log('🔐 Storage availability:', {
    localStorage: localStorageAvailable,
    sessionStorage: sessionStorageAvailable
  });

  return {
    getItem: (key) => {
      try {
        const keyStr = String(key || '');
        // Try localStorage first (persists across browser restarts)
        if (localStorageAvailable) {
          const item = window.localStorage.getItem(key);
          if (item !== null) {
            console.log('✅ Retrieved from localStorage:', keyStr.substring(0, 20) + '...');
            return item;
          }
        }

        // Try sessionStorage second (persists across page refreshes)
        if (sessionStorageAvailable) {
          const item = window.sessionStorage.getItem(key);
          if (item !== null) {
            console.log('✅ Retrieved from sessionStorage:', keyStr.substring(0, 20) + '...');
            // Copy to localStorage for future persistence
            if (localStorageAvailable) {
              try {
                window.localStorage.setItem(key, item);
              } catch (e) {
                // Ignore if localStorage is full
              }
            }
            return item;
          }
        }

        // Last resort: memory store (only lasts until page refresh)
        const item = memoryStore.get(key);
        if (item !== null && item !== undefined) {
          console.warn('⚠️ Retrieved from memory store (will not persist refresh):', keyStr.substring(0, 20) + '...');
        }
        return item || null;
      } catch (e) {
        console.error('❌ Storage read error:', e);
        return memoryStore.get(key) || null;
      }
    },
    setItem: (key, value) => {
      try {
        const keyStr = String(key || '');
        let stored = false;

        // Try localStorage first
        if (localStorageAvailable) {
          try {
            window.localStorage.setItem(key, value);
            console.log('✅ Stored in localStorage:', keyStr.substring(0, 20) + '...');
            stored = true;
          } catch (e) {
            console.warn('⚠️ localStorage write failed:', e.message);
          }
        }

        // Try sessionStorage as backup
        if (sessionStorageAvailable) {
          try {
            window.sessionStorage.setItem(key, value);
            if (!stored) {
              console.log('✅ Stored in sessionStorage:', keyStr.substring(0, 20) + '...');
            }
            stored = true;
          } catch (e) {
            console.warn('⚠️ sessionStorage write failed:', e.message);
          }
        }

        // Always store in memory as last resort
        memoryStore.set(key, value);
        if (!stored) {
          console.warn('⚠️ Only stored in memory (will not persist refresh):', keyStr.substring(0, 20) + '...');
        }
      } catch (e) {
        console.error('❌ Storage write error:', e);
        memoryStore.set(key, value);
      }
    },
    removeItem: (key) => {
      try {
        const keyStr = String(key || '');
        if (localStorageAvailable) {
          window.localStorage.removeItem(key);
        }
        if (sessionStorageAvailable) {
          window.sessionStorage.removeItem(key);
        }
        memoryStore.delete(key);
        console.log('✅ Removed from all storage:', keyStr.substring(0, 20) + '...');
      } catch (e) {
        console.error('❌ Storage remove error:', e);
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
