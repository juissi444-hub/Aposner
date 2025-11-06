-- Verification queries for leaderboard data
-- Run these in Supabase SQL Editor to debug leaderboard issues

-- Query 1: Check total number of entries in leaderboard (bypasses RLS)
SELECT
  COUNT(*) as total_entries,
  'Total entries in leaderboard table' as description
FROM leaderboard;

-- Query 2: List ALL entries in leaderboard (bypasses RLS)
SELECT
  id,
  username,
  highest_level,
  best_score,
  created_at,
  user_id
FROM leaderboard
ORDER BY highest_level DESC, best_score DESC;

-- Query 3: Check if RLS is enabled
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'leaderboard';

-- Query 4: List all RLS policies on leaderboard table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'leaderboard';

-- Query 5: Simulate what a client query would see (with RLS)
-- This is what the app's query should return
SET ROLE anon;
SELECT
  COUNT(*) as entries_visible_to_anon,
  'Entries visible with RLS as anon role' as description
FROM leaderboard;
RESET ROLE;

-- Query 6: Test the exact query the app uses
SELECT *
FROM leaderboard
ORDER BY highest_level DESC, best_score DESC;
