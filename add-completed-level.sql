-- Add completed_level column to leaderboard table
-- This tracks which level the best_score was achieved on
-- Run this SQL in your Supabase SQL Editor

-- Add completed_level column to leaderboard table
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS completed_level INTEGER DEFAULT 1;

-- Add comment to explain the column
COMMENT ON COLUMN leaderboard.completed_level IS 'The level at which the best_score was achieved';

-- Update existing records to set completed_level = highest_level as initial value
UPDATE leaderboard
SET completed_level = highest_level
WHERE completed_level IS NULL;
