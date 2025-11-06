-- Reset Leaderboard Stats
-- Run this SQL in your Supabase SQL Editor to clear all leaderboard data

-- WARNING: This will delete all leaderboard entries!
-- Users will need to play again to appear on the leaderboard.

-- Delete all leaderboard entries
DELETE FROM leaderboard;

-- Optional: Reset the sequence counter (if using SERIAL/BIGSERIAL)
ALTER SEQUENCE IF EXISTS leaderboard_id_seq RESTART WITH 1;

-- Verify the table is empty
SELECT COUNT(*) as remaining_entries FROM leaderboard;

-- You should see: remaining_entries = 0

-- Note: This does NOT delete user accounts.
-- Users can still log in, but their leaderboard stats will be reset.
-- When they play in Adaptive mode again, new entries will be created.
