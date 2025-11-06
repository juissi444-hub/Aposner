-- Add average answer time tracking to leaderboard and create user progress table
-- Run this SQL in your Supabase SQL Editor

-- Add average_answer_time column to leaderboard table
ALTER TABLE leaderboard
ADD COLUMN IF NOT EXISTS average_answer_time DECIMAL(10, 2);

-- Add comment to explain the column
COMMENT ON COLUMN leaderboard.average_answer_time IS 'Average answer time in milliseconds for correct answers';

-- Create user_progress table to store current progress
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

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);

-- Enable Row Level Security
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read their own progress
CREATE POLICY "Allow users to read own progress"
  ON user_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own progress
CREATE POLICY "Allow users to insert own progress"
  ON user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own progress
CREATE POLICY "Allow users to update own progress"
  ON user_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
