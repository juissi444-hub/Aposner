-- Fix Level 0 Entries in Leaderboard
-- Run this in Supabase SQL Editor

-- WARNING: This will update or delete entries with level 0

-- Option 1: Update level 0 entries to level 1 (minimum level)
UPDATE leaderboard
SET highest_level = 1
WHERE highest_level = 0;

-- Show how many entries were updated
SELECT COUNT(*) as updated_entries
FROM leaderboard
WHERE highest_level = 1;

-- Option 2: If you prefer to delete level 0 entries entirely instead:
-- DELETE FROM leaderboard WHERE highest_level = 0;

-- Verify no more level 0 entries exist
SELECT COUNT(*) as level_zero_entries
FROM leaderboard
WHERE highest_level = 0;

-- Show all current leaderboard entries
SELECT
  id,
  username,
  highest_level,
  best_score,
  ROUND((best_score::numeric / 30) * 100) as completion_percentage
FROM leaderboard
ORDER BY highest_level DESC, best_score DESC;
