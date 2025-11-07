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

// Enhanced localStorage adapter with Chrome/Samsung compatibility
// Uses standard localStorage API with robust error handling and retry logic
const createCustomStorage = () => {
  let storageAvailable = null; // Cache availability check result
  let failureCount = 0; // Track consecutive failures
  const MAX_FAILURES = 3; // Max failures before marking as unavailable

  // Test if localStorage is available and working
  const testStorage = () => {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, 'test');
      const retrieved = window.localStorage.getItem(testKey);
      window.localStorage.removeItem(testKey);
      return retrieved === 'test';
    } catch (e) {
      console.error('❌ localStorage test failed:', e.message || e);
      return false;
    }
  };

  // Check storage availability with caching
  const isStorageAvailable = () => {
    // Return cached result if we've tested recently
    if (storageAvailable !== null && failureCount < MAX_FAILURES) {
      return storageAvailable;
    }

    // Re-test storage
    storageAvailable = testStorage();

    if (!storageAvailable) {
      console.warn('⚠️ localStorage not available - auth may not persist across refreshes');
      console.warn('⚠️ This can happen on Samsung Chrome with strict privacy settings');
    } else if (failureCount > 0) {
      console.log('✅ localStorage recovered after', failureCount, 'failures');
      failureCount = 0; // Reset failure count on success
    }

    return storageAvailable;
  };

  return {
    getItem: (key) => {
      if (!isStorageAvailable()) return null;

      try {
        const value = window.localStorage.getItem(key);
        if (failureCount > 0) {
          failureCount = 0; // Reset on successful read
        }
        return value;
      } catch (e) {
        failureCount++;
        console.error('❌ Storage read error:', e.message || e, `(failure ${failureCount}/${MAX_FAILURES})`);

        // Mark as unavailable if too many failures
        if (failureCount >= MAX_FAILURES) {
          storageAvailable = false;
        }

        return null;
      }
    },
    setItem: (key, value) => {
      if (!isStorageAvailable()) return;

      try {
        window.localStorage.setItem(key, value);
        if (failureCount > 0) {
          failureCount = 0; // Reset on successful write
        }
      } catch (e) {
        failureCount++;
        console.error('❌ Storage write error:', e.message || e, `(failure ${failureCount}/${MAX_FAILURES})`);

        // Handle quota exceeded errors specifically
        if (e.name === 'QuotaExceededError') {
          console.error('❌ localStorage quota exceeded - consider clearing old data');
        }

        // Mark as unavailable if too many failures
        if (failureCount >= MAX_FAILURES) {
          storageAvailable = false;
        }
      }
    },
    removeItem: (key) => {
      if (!isStorageAvailable()) return;

      try {
        window.localStorage.removeItem(key);
        if (failureCount > 0) {
          failureCount = 0; // Reset on successful remove
        }
      } catch (e) {
        failureCount++;
        console.error('❌ Storage remove error:', e.message || e, `(failure ${failureCount}/${MAX_FAILURES})`);

        // Mark as unavailable if too many failures
        if (failureCount >= MAX_FAILURES) {
          storageAvailable = false;
        }
      }
    }
  };
};

// Create Supabase client with persistent session storage
// This ensures login persists across page refreshes
// Enhanced configuration for Chrome/Samsung compatibility
export const supabase = isValidCredentials()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true, // CRITICAL: Keep user logged in across refreshes
        autoRefreshToken: true, // Auto-refresh tokens to keep session alive
        detectSessionInUrl: false, // Don't check URL for auth callbacks
        storage: createCustomStorage(), // Enhanced localStorage adapter for Chrome/Samsung
        storageKey: 'sb-auth-token', // Use standard storage key
        flowType: 'pkce' // Use PKCE flow for better security and compatibility
      },
      global: {
        headers: {
          'X-Client-Info': 'supabase-js-web' // Help identify client type
        }
      },
      db: {
        schema: 'public'
      },
      realtime: {
        params: {
          eventsPerSecond: 2 // Rate limit for better mobile performance
        }
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
