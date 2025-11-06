import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// DEBUG: Test if localStorage works at all
console.log('=== STORAGE DEBUG ===');
console.log('Browser:', navigator.userAgent);
try {
  const testKey = 'test-storage-' + Date.now();
  window.localStorage.setItem(testKey, 'test-value');
  const retrieved = window.localStorage.getItem(testKey);
  window.localStorage.removeItem(testKey);
  console.log('✅ localStorage WORKS:', retrieved === 'test-value');
} catch (e) {
  console.error('❌ localStorage BLOCKED:', e);
}

// Storage adapter with detailed debugging
const customStorageAdapter = {
  getItem: (key) => {
    try {
      const value = window.localStorage.getItem(key);
      console.log(`🔍 [STORAGE GET] Key: ${key.substring(0, 20)}..., Found: ${!!value}, Length: ${value?.length || 0}`);
      if (value) {
        console.log(`📦 [STORAGE GET] Value preview: ${value.substring(0, 100)}...`);
      }
      return value;
    } catch (e) {
      console.error('❌ [STORAGE GET] Error:', e);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      console.log(`💾 [STORAGE SET] Key: ${key.substring(0, 20)}..., Length: ${value?.length || 0}`);
      console.log(`📦 [STORAGE SET] Value preview: ${value.substring(0, 100)}...`);
      window.localStorage.setItem(key, value);

      // Verify it was actually saved
      const verify = window.localStorage.getItem(key);
      if (verify === value) {
        console.log('✅ [STORAGE SET] Verified saved correctly');
      } else {
        console.error('❌ [STORAGE SET] Verification FAILED - not saved!');
      }
    } catch (e) {
      console.error('❌ [STORAGE SET] Error:', e.name, e.message);
    }
  },
  removeItem: (key) => {
    try {
      console.log(`🗑️ [STORAGE REMOVE] Key: ${key.substring(0, 20)}...`);
      window.localStorage.removeItem(key);
      console.log('✅ [STORAGE REMOVE] Done');
    } catch (e) {
      console.error('❌ [STORAGE REMOVE] Error:', e);
    }
  }
};

console.log('=== SUPABASE CONFIG ===');
console.log('URL configured:', !!supabaseUrl);
console.log('Key configured:', !!supabaseAnonKey);

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

if (supabase) {
  console.log('✅ Supabase client created');
} else {
  console.error('❌ Supabase client NOT created - missing credentials');
}

export const isSupabaseConfigured = () => {
  return supabase !== null;
};
