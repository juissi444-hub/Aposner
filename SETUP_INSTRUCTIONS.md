# Setup Instructions for Adaptive Posner

## Required: Supabase Configuration

To enable leaderboard and login persistence, you **must** configure Supabase credentials.

### Steps:

1. **Create a Supabase account** at https://supabase.com if you haven't already

2. **Create a new project** in your Supabase dashboard

3. **Get your credentials**:
   - Go to Project Settings > API
   - Copy the "Project URL" (looks like: `https://xxxxx.supabase.co`)
   - Copy the "anon/public" key (long string starting with `eyJ...`)

4. **Update the .env file**:
   - Open `/home/user/Aposner/.env`
   - Replace `your_supabase_url_here` with your actual Project URL
   - Replace `your_supabase_anon_key_here` with your actual anon key

   Example:
   ```
   VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

5. **Create the database tables**:

   Go to your Supabase SQL Editor and run:

   ```sql
   -- Create leaderboard table
   CREATE TABLE IF NOT EXISTS leaderboard (
     id BIGSERIAL PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     username TEXT NOT NULL,
     highest_level INTEGER NOT NULL DEFAULT 1,
     best_score INTEGER NOT NULL DEFAULT 0,
     average_answer_time INTEGER,
     is_anonymous BOOLEAN DEFAULT false,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE(user_id)
   );

   -- Create index for faster queries
   CREATE INDEX IF NOT EXISTS idx_leaderboard_best_score ON leaderboard(best_score DESC);

   -- Create progress table
   CREATE TABLE IF NOT EXISTS user_progress (
     id BIGSERIAL PRIMARY KEY,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     current_level INTEGER NOT NULL DEFAULT 1,
     highest_level INTEGER NOT NULL DEFAULT 1,
     best_score INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE(user_id)
   );

   -- Enable Row Level Security
   ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY "Public read access" ON leaderboard FOR SELECT USING (true);
   CREATE POLICY "Users can insert their own data" ON leaderboard FOR INSERT WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "Users can update their own data" ON leaderboard FOR UPDATE USING (auth.uid() = user_id);

   CREATE POLICY "Users can read their own progress" ON user_progress FOR SELECT USING (auth.uid() = user_id);
   CREATE POLICY "Users can insert their own progress" ON user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
   CREATE POLICY "Users can update their own progress" ON user_progress FOR UPDATE USING (auth.uid() = user_id);
   ```

6. **Restart your development server**:
   ```bash
   npm run dev
   ```

## Verification

After setup:
- You should see a "Login / Sign Up" button on the main screen
- After logging in, the leaderboard button should appear
- Your login should persist across page refreshes
- Scores should be saved to the leaderboard

## Troubleshooting

- **Login doesn't persist**: Make sure you've set the correct Supabase URL and anon key
- **Leaderboard is empty**: Check that you've created the database tables
- **Can't login**: Check browser console for errors, ensure Supabase project is active
- **Auth section doesn't appear**: Verify .env file has actual credentials, not placeholder text
