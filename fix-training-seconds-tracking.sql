-- Fix training time tracking to include seconds
-- This migration updates the update_training_time function to properly track seconds

-- Update the comment to reflect the new structure
COMMENT ON COLUMN leaderboard.training_sessions IS 'Array of training sessions: [{date: "YYYY-MM-DD", minutes: number, seconds: number, level_reached: number}]';

-- Recreate the function with seconds parameter
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
    -- Update today's session
    -- When adding seconds, handle overflow: if total seconds >= 60, convert to minutes
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
