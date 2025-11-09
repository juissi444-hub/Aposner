-- Comprehensive migration to add ALL optional features to leaderboard table
-- Run this SQL in your Supabase SQL Editor to enable all features
-- This migration is SAFE to run multiple times (uses IF NOT EXISTS)

-- ============================================================================
-- 1. Add user progress tracking table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1,
  highest_level INTEGER DEFAULT 1,
  current_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);

-- Enable Row Level Security for user_progress
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow users to read own progress" ON user_progress;
DROP POLICY IF EXISTS "Allow users to insert own progress" ON user_progress;
DROP POLICY IF EXISTS "Allow users to update own progress" ON user_progress;

-- Create RLS policies for user_progress
CREATE POLICY "Allow users to read own progress"
  ON user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert own progress"
  ON user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update own progress"
  ON user_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. Add average answer time column to leaderboard
-- ============================================================================
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS average_answer_time DECIMAL(10, 2);

COMMENT ON COLUMN leaderboard.average_answer_time IS 'Average answer time in milliseconds for correct answers';

-- ============================================================================
-- 3. Add user settings columns to leaderboard
-- ============================================================================
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_continue_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_continue_delay INTEGER DEFAULT 3 CHECK (auto_continue_delay >= 1 AND auto_continue_delay <= 20),
ADD COLUMN IF NOT EXISTS experimental_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chinese_numerals_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS korean_numerals_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN leaderboard.sound_enabled IS 'Enable/disable sound effects during gameplay';
COMMENT ON COLUMN leaderboard.auto_continue_enabled IS 'Enable/disable auto-continue to next trial after delay';
COMMENT ON COLUMN leaderboard.auto_continue_delay IS 'Auto-continue delay in seconds (1-20)';
COMMENT ON COLUMN leaderboard.experimental_mode IS 'Enable experimental relation types at all levels';
COMMENT ON COLUMN leaderboard.chinese_numerals_enabled IS 'Enable Chinese numerals in training';
COMMENT ON COLUMN leaderboard.korean_numerals_enabled IS 'Enable Sino-Korean numerals in training';

-- ============================================================================
-- 4. Add training time tracking columns to leaderboard
-- ============================================================================
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS total_training_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS training_sessions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS training_goal_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_training_date DATE;

CREATE INDEX IF NOT EXISTS idx_leaderboard_training_time ON leaderboard(total_training_minutes DESC);

COMMENT ON COLUMN leaderboard.training_sessions IS 'Array of training sessions: [{date: "YYYY-MM-DD", minutes: number, seconds: number, level_reached: number}]';

-- ============================================================================
-- 5. Create training time update function (WITH SECONDS SUPPORT)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_training_time(
  p_user_id UUID,
  p_minutes INTEGER,
  p_seconds INTEGER DEFAULT 0,
  p_level_reached INTEGER DEFAULT 1
)
RETURNS void AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_sessions JSONB;
  v_today_session JSONB;
BEGIN
  -- Get current sessions
  SELECT training_sessions INTO v_sessions
  FROM leaderboard
  WHERE user_id = p_user_id;

  -- Initialize if null
  IF v_sessions IS NULL THEN
    v_sessions := '[]'::jsonb;
  END IF;

  -- Check if today's session exists
  SELECT value INTO v_today_session
  FROM jsonb_array_elements(v_sessions)
  WHERE value->>'date' = v_today::text
  LIMIT 1;

  IF v_today_session IS NOT NULL THEN
    -- Update today's session with proper seconds overflow handling
    v_sessions := (
      SELECT jsonb_agg(
        CASE
          WHEN value->>'date' = v_today::text
          THEN jsonb_build_object(
            'date', v_today,
            'minutes', (value->>'minutes')::int + p_minutes + ((COALESCE((value->>'seconds')::int, 0) + p_seconds) / 60),
            'seconds', (COALESCE((value->>'seconds')::int, 0) + p_seconds) % 60,
            'level_reached', GREATEST((value->>'level_reached')::int, p_level_reached)
          )
          ELSE value
        END
      )
      FROM jsonb_array_elements(v_sessions)
    );
  ELSE
    -- Add new session for today
    v_sessions := v_sessions || jsonb_build_object(
      'date', v_today,
      'minutes', p_minutes,
      'seconds', p_seconds,
      'level_reached', p_level_reached
    );
  END IF;

  -- Keep only last 90 days of sessions
  v_sessions := (
    SELECT jsonb_agg(value ORDER BY value->>'date' DESC)
    FROM (
      SELECT value
      FROM jsonb_array_elements(v_sessions)
      WHERE (value->>'date')::date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY value->>'date' DESC
      LIMIT 90
    ) AS recent_sessions
  );

  -- Update leaderboard
  UPDATE leaderboard
  SET
    training_sessions = v_sessions,
    total_training_minutes = total_training_minutes + p_minutes,
    last_training_date = v_today
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Create/update trigger for user_progress updated_at
-- ============================================================================
-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_user_progress_updated_at ON user_progress;

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All optional features have been added to your database!
--
-- Features enabled:
-- ✅ User progress tracking (syncs progress across devices)
-- ✅ Average answer time tracking (for leaderboard tiebreakers)
-- ✅ User settings sync (sound, auto-continue, experimental mode, numerals)
-- ✅ Training time tracking (daily goals, session history)
-- ✅ All necessary RLS policies and indexes
--
-- Your app will now work with ALL features enabled!
