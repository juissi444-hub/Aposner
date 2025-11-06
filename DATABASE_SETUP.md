# Database Setup Instructions

## IMPORTANT: Run These SQL Migrations!

Before using the latest features, you **MUST** run the SQL migrations in your Supabase SQL Editor.

### Steps to Update Your Database:

1. **Log in to Supabase** at https://supabase.com
2. **Navigate to your project**
3. **Click on "SQL Editor"** in the left sidebar
4. **Create a new query**
5. **Run the migrations in order:**
   - First: `add-progress-tracking.sql` (adds server progress tracking and tiebreaker)
   - Then: `add-completed-level.sql` (fixes level completion percentage display)
6. **Click "Run"** to execute each migration

### What These Migrations Do:

**Migration 1: `add-progress-tracking.sql`**
- **Adds `average_answer_time` column** to the `leaderboard` table
  - This enables tiebreaker sorting: players with the same level and score are ranked by fastest average response time

- **Creates `user_progress` table** to store current progress
  - Stores `current_level`, `highest_level`, and `current_score` on the server
  - Progress syncs between devices when you log in
  - Prevents progress loss on mobile when refreshing

- **Sets up Row Level Security (RLS) policies** for the new table
  - Users can only read/write their own progress data

**Migration 2: `add-completed-level.sql`**
- **Adds `completed_level` column** to the `leaderboard` table
  - Tracks which level the player achieved their best score on
  - Fixes the level completion percentage display to show the correct level
  - Example: If you get 100% on Level 3, it shows "Level 3 - 100% completed" (not "Level 4 - 33%")

### Features Enabled After Migrations:

✅ **Server-side progress storage** - Your progress is saved to the database, not just localStorage
✅ **Cross-device sync** - Log in from any device and continue where you left off
✅ **Mobile refresh fix** - Refreshing on mobile won't reset your progress
✅ **Leaderboard tiebreaker** - Players with identical scores ranked by speed
✅ **Better data persistence** - Progress survives even if localStorage is cleared
✅ **Accurate level completion display** - Shows the actual level where you achieved your best score

### What Happens If You Don't Run The Migration?

The app will still work, but:
- ⚠️ Progress will only be saved in localStorage (can be lost on mobile)
- ⚠️ Refreshing on mobile may reset progress
- ⚠️ No cross-device sync
- ⚠️ Leaderboard won't use average answer time for tiebreaking
- ⚠️ You'll see warnings in the console about missing tables/columns

The code is designed to gracefully handle missing tables, so the app won't crash - but you'll miss out on these features!

### Verification:

After running both migrations, check in Supabase:
1. Go to **Table Editor**
2. You should see a new **`user_progress`** table
3. Click on the **`leaderboard`** table
4. Verify there's an **`average_answer_time`** column
5. Verify there's a **`completed_level`** column

That's it! Your database is now fully updated.
