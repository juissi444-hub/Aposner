-- Fix RLS Policy for Leaderboard
-- Run this in Supabase SQL Editor to enable proper RLS

-- First, drop all existing policies on leaderboard
DROP POLICY IF EXISTS "Allow public read access to leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "Allow users to insert own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Allow users to update own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON leaderboard;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON leaderboard;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON leaderboard;

-- Enable RLS (in case it was disabled)
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: Create NEW policies with correct syntax

-- 1. Allow ANYONE (even unauthenticated) to read ALL leaderboard entries
CREATE POLICY "leaderboard_select_all"
  ON leaderboard
  FOR SELECT
  TO public
  USING (true);

-- 2. Allow authenticated users to insert their own entry
CREATE POLICY "leaderboard_insert_own"
  ON leaderboard
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Allow authenticated users to update their own entry
CREATE POLICY "leaderboard_update_own"
  ON leaderboard
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify policies were created
SELECT
  policyname,
  cmd as command,
  roles,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'leaderboard'
ORDER BY cmd;
