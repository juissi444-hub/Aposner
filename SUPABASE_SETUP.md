# Supabase Database Setup Instructions

## Prerequisites
- A Supabase account (https://supabase.com)
- A Supabase project created

## Step 1: Set Up Environment Variables

Create a `.env` file in the project root with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project:
- Go to Project Settings → API
- Copy the "Project URL" and "anon public" key

## Step 2: Run the Database Schema

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the entire contents of `supabase-schema.sql` into the editor
5. Click "Run" to execute the SQL

This will create:
- The `leaderboard` table
- Necessary indexes for performance
- Row Level Security (RLS) policies
- Auto-update triggers

## Step 3: Verify the Setup

### Check Table Creation
1. In Supabase dashboard, go to "Table Editor"
2. You should see a table named "leaderboard" with columns:
   - `id` (bigint, primary key)
   - `user_id` (uuid, foreign key to auth.users)
   - `username` (text)
   - `highest_level` (integer)
   - `best_score` (integer)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

### Check RLS Policies
1. Go to "Authentication" → "Policies"
2. Select the "leaderboard" table
3. You should see three policies:
   - "Allow public read access to leaderboard" (SELECT)
   - "Allow users to insert own leaderboard entry" (INSERT)
   - "Allow users to update own leaderboard entry" (UPDATE)

## Step 4: Test the Application

1. Start the development server: `npm run dev`
2. Switch to "Adaptive Mode"
3. Sign up with a username and password
4. Play a few rounds
5. Click the "Leaderboard" button to verify data is displayed

## Troubleshooting

### Leaderboard shows "No entries yet"
- **Check console logs**: Open browser console (F12) and look for error messages when clicking leaderboard
- **Verify schema was run**: Check Supabase Table Editor to ensure the leaderboard table exists
- **Check RLS policies**: Ensure the policies are created and enabled
- **Verify environment variables**: Make sure `.env` file is properly configured

### "Refresh still resets" issue
- **Check session persistence**: The app is configured to persist sessions in localStorage
- **Verify you're logged in**: Check console logs for "✅ Session found for user" message on page load
- **Try a hard refresh**: Sometimes a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) is needed after setup changes

### Authentication errors
- **Email format**: The app uses `username@adaptiveposner.local` format automatically
- **Supabase email confirmation**: Make sure email confirmation is disabled in Supabase (Settings → Authentication → Email Auth → Disable "Enable email confirmations")

## Database Schema Details

The leaderboard table tracks:
- **user_id**: Links to Supabase auth.users
- **username**: Display name
- **highest_level**: Highest level reached by the user
- **best_score**: Best score achieved at their highest level
- **created_at**: When the entry was created
- **updated_at**: Last time the entry was updated (auto-updated by trigger)

## Security

The RLS policies ensure:
- Anyone can view all leaderboard entries (public read)
- Users can only insert entries for themselves
- Users can only update their own entries
- The database enforces these rules at the database level
