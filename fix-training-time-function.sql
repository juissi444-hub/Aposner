-- Fix training time tracking function to include seconds parameter
-- Run this in your Supabase SQL Editor to fix training time tracking
-- This migration is SAFE to run multiple times

-- ============================================================================
-- Ensure training time columns exist
-- ============================================================================
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS total_training_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS training_sessions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS training_goal_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_training_date DATE;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_leaderboard_training_time ON leaderboard(total_training_minutes DESC);

-- Update comment to reflect the correct structure with seconds
COMMENT ON COLUMN leaderboard.training_sessions IS 'Array of training sessions: [{date: "YYYY-MM-DD", minutes: number, seconds: number, level_reached: number}]';

-- ============================================================================
-- Create or replace the training time update function with SECONDS support
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

  -- Log if no rows were updated (user doesn't exist in leaderboard)
  IF NOT FOUND THEN
    RAISE NOTICE 'User % not found in leaderboard table', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Training time tracking is now properly configured with seconds support!
--
-- The function now accepts:
-- - p_user_id: UUID (required)
-- - p_minutes: INTEGER (required)
-- - p_seconds: INTEGER (optional, default 0)
-- - p_level_reached: INTEGER (optional, default 1)
--
-- Seconds will automatically overflow to minutes when >= 60
-- This matches what the JavaScript code is calling!
