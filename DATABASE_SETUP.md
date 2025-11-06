# Database Setup Instructions

## IMPORTANT: Run This SQL Migration!

Before using the latest features (server progress tracking and leaderboard tiebreaker), you **MUST** run the SQL migration in your Supabase SQL Editor.

### Steps to Update Your Database:

1. **Log in to Supabase** at https://supabase.com
2. **Navigate to your project**
3. **Click on "SQL Editor"** in the left sidebar
4. **Create a new query**
5. **Copy and paste** the contents of `add-progress-tracking.sql` into the editor
6. **Click "Run"** to execute the migration

### What This Migration Does:

- **Adds `average_answer_time` column** to the `leaderboard` table
  - This enables tiebreaker sorting: players with the same level and score are ranked by fastest average response time

- **Creates `user_progress` table** to store current progress
  - Stores `current_level`, `highest_level`, and `current_score` on the server
  - Progress syncs between devices when you log in
  - Prevents progress loss on mobile when refreshing

- **Sets up Row Level Security (RLS) policies** for the new table
  - Users can only read/write their own progress data

### Features Enabled After Migration:

✅ **Server-side progress storage** - Your progress is saved to the database, not just localStorage
✅ **Cross-device sync** - Log in from any device and continue where you left off
✅ **Mobile refresh fix** - Refreshing on mobile won't reset your progress
✅ **Leaderboard tiebreaker** - Players with identical scores ranked by speed
✅ **Better data persistence** - Progress survives even if localStorage is cleared

### What Happens If You Don't Run The Migration?

The app will still work, but:
- ⚠️ Progress will only be saved in localStorage (can be lost on mobile)
- ⚠️ Refreshing on mobile may reset progress
- ⚠️ No cross-device sync
- ⚠️ Leaderboard won't use average answer time for tiebreaking
- ⚠️ You'll see warnings in the console about missing tables/columns

The code is designed to gracefully handle missing tables, so the app won't crash - but you'll miss out on these features!

### Verification:

After running the migration, check in Supabase:
1. Go to **Table Editor**
2. You should see a new **`user_progress`** table
3. Click on the **`leaderboard`** table
4. Verify there's an **`average_answer_time`** column

That's it! Your database is now fully updated.
