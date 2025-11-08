-- Add user settings to leaderboard table
-- These settings will be saved per user and persist across sessions

ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_continue_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_continue_delay INTEGER DEFAULT 3 CHECK (auto_continue_delay >= 1 AND auto_continue_delay <= 20),
ADD COLUMN IF NOT EXISTS experimental_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chinese_numerals_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS korean_numerals_enabled BOOLEAN DEFAULT false;

-- Add comments to describe the settings
COMMENT ON COLUMN leaderboard.sound_enabled IS 'Enable/disable sound effects during gameplay';
COMMENT ON COLUMN leaderboard.auto_continue_enabled IS 'Enable/disable auto-continue to next trial after delay';
COMMENT ON COLUMN leaderboard.auto_continue_delay IS 'Auto-continue delay in seconds (1-20)';
COMMENT ON COLUMN leaderboard.experimental_mode IS 'Enable experimental relation types at all levels';
COMMENT ON COLUMN leaderboard.chinese_numerals_enabled IS 'Enable Chinese numerals in training';
COMMENT ON COLUMN leaderboard.korean_numerals_enabled IS 'Enable Sino-Korean numerals in training';
