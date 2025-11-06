-- Fix Level 0 Entries in Leaderboard
-- Run this in Supabase SQL Editor

-- NOTE: The app now auto-corrects level 0 to level 1 when saving,
-- so this should only be needed for old entries created before the fix.

-- Update level 0 entries to level 1 (minimum level)
-- This preserves the user's score while fixing the level
UPDATE leaderboard
SET highest_level = 1
WHERE highest_level = 0;

-- Verify no more level 0 entries exist
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ No level 0 entries found'
    ELSE '⚠️ Still have ' || COUNT(*) || ' level 0 entries'
  END as status
FROM leaderboard
WHERE highest_level = 0;

-- Show all current leaderboard entries with completion percentage
SELECT
  id,
  username,
  highest_level,
  best_score,
  ROUND((best_score::numeric / 30) * 100) as completion_percentage,
  created_at
FROM leaderboard
ORDER BY highest_level DESC, best_score DESC;

-- Example output:
-- If a player stopped at Level 1 with 15 correct answers:
-- Level 1, Score 15, Completion 50%
-- This shows they're working on Level 1 and have completed 50% of it
