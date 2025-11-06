# Reset User Stats Instructions

## Why Reset is Needed

Due to recent fixes in the level completion tracking logic, existing users may have incorrect data showing 0% completion. New users will have this working correctly, but old data needs to be cleared.

## What Gets Reset

- **Leaderboard entries**: All progress, levels, and scores
- **User accounts**: NOT deleted (users can still log in)
- **Local progress**: NOT affected (localStorage remains unchanged)

## How to Reset

### Option 1: Reset Leaderboard Only (Recommended)

This keeps user accounts but clears their leaderboard stats:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `reset-leaderboard.sql`
5. Click **Run**
6. Verify the output shows `remaining_entries = 0`

**Result**: Users can still log in, but they'll need to play in Adaptive mode to rebuild their stats with the correct data.

### Option 2: Complete Reset (User Accounts + Leaderboard)

This deletes everything and starts fresh:

```sql
-- WARNING: This deletes all users and their leaderboard data!

-- Delete all leaderboard entries
DELETE FROM leaderboard;

-- Delete all user accounts
DELETE FROM auth.users;

-- Reset sequences
ALTER SEQUENCE IF EXISTS leaderboard_id_seq RESTART WITH 1;
```

**Result**: Everyone needs to sign up again from scratch.

## After Reset

Once reset is complete:

1. Users log in (or sign up if you did complete reset)
2. Users play Adaptive mode
3. Complete a level (e.g., Level 1 with 15/30 correct)
4. Leaderboard will now correctly show: **"Level 1 - 50% completed"** ✅

## Verifying the Fix Works

After reset, have a user:

1. Sign up with a new account
2. Play Adaptive Mode
3. Complete Level 1 with any score (e.g., 27/30)
4. Check leaderboard - should show: "Level 1 - 90% completed"

If it shows 0%, check browser console for errors.

## Technical Details

**The Fix**:
- New users start at `level 0` with `best_score 0`
- When they complete level 1, it's recognized as NEW highest level
- `best_score` is properly saved (e.g., 27 for 27/30 correct)
- Leaderboard calculates: `(27/30) * 100 = 90%`

**Old Behavior** (before fix):
- Users started at `level 1` with `best_score 0`
- When completing level 1, code thought "you're already at level 1"
- Score didn't get saved properly → 0% displayed

## Troubleshooting

**Leaderboard still shows 0% after reset:**
- Check browser console (F12) for error messages
- Look for: `📊 Leaderboard entry: {best_score: 0}`
- If best_score is 0, the save isn't working
- Copy console logs and check for errors in `updateLeaderboard`

**Users getting logged out:**
- Session persistence should work now
- Check console for: `✅ Session found for user`
- If seeing `❌ No active session`, there's still an issue
