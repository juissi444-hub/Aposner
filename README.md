# Adaptive Posner

A cognitive task game built with React to test your mental agility through various relationship recognition challenges.

## Features

- **Multiple Relationship Types**:
  - Whole-Part relationships (e.g., fish-pike, world-France)
  - Antonyms/Opposites (e.g., dark-light, cold-warm)
  - Same Color associations (e.g., grass-emerald, paper-snow)
  - Sequential Numbers (e.g., 3-4, 24-25)
  - Number Forms (e.g., seven-two, XI-V, 7-4)
  - Same Meaning Numbers (e.g., 2-two, V-5, five-5)
  - Same Time (e.g., 🕐-1:00, 3:30-half past three)

- **Two Game Modes**:
  - **Manual Mode**: Choose your own level (1-18) and number of tasks (10-60)
  - **Adaptive Mode**: Start at level 1, progress automatically with 90% accuracy (27/30 correct)
    - Get 6 wrong and level decreases!
    - Progress is saved automatically
    - Only adaptive mode counts towards leaderboard
    - **Based on Scientific Research**: Follows the study design from "Training semantic long-term memory retrieval transfers to executive function and reading fluency"
      - **Level 1**: Same Format (1-2, III-IV, 五-六) - Physical property retrieval
      - **Level 2**: Same Meaning (2-二-II) - Semantic property retrieval
      - Uses numbers 1-9 in Arabic, Chinese (一~九), and Roman numerals (I-IX)
      - Difficulty increases ONLY through time pressure (2000ms → 87.5ms), NOT task type changes
      - Level 3-4 tasks (odd/even parity) were used only for pre/post testing in the study, NOT for training

- **Experimental Mode** (Optional):
  - Enable in settings to use all relation types at all levels
  - Deviates from the research-based progression
  - Useful for custom training or testing

- **Sound Effects**:
  - Correct/incorrect answer feedback sounds
  - Celebration sound for perfect scores (30/30)
  - Boo sound when failing (6 incorrect answers)
  - Toggle sound on/off in settings

- **Authentication & Leaderboard** (Optional - requires Supabase setup):
  - Username/password authentication
  - Global leaderboard tracking highest levels and best scores
  - Only tracks adaptive mode performance

- **Instant Feedback**: Visual color-coded feedback for correct/incorrect/timeout responses
- **Performance Tracking**: View your accuracy percentage at the end of each session
- **Mobile Support**: Touch-friendly buttons for mobile devices

## Local Development

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Aposner
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Optional: Supabase Setup (for Authentication & Leaderboard)

If you want to enable the authentication and leaderboard features, you'll need to set up a Supabase project:

1. Create a free account at [Supabase](https://supabase.com)

2. Create a new project

3. In your Supabase project dashboard:
   - Go to **SQL Editor**
   - Click "New Query"
   - Copy and paste the complete setup SQL below
   - Click "Run" to execute

**Complete Leaderboard Setup SQL:**

```sql
-- Complete Leaderboard Setup for Adaptive Posner
-- Run this in your Supabase SQL Editor

-- ============================================
-- STEP 1: Create leaderboard table
-- ============================================

CREATE TABLE IF NOT EXISTS leaderboard (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  highest_level INTEGER DEFAULT 1,
  best_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_user_id ON leaderboard(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_highest_level ON leaderboard(highest_level DESC);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
DROP TRIGGER IF EXISTS update_leaderboard_updated_at ON leaderboard;
CREATE TRIGGER update_leaderboard_updated_at
  BEFORE UPDATE ON leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 2: Enable Row Level Security
-- ============================================

ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies first
DROP POLICY IF EXISTS "Allow public read access to leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "Allow users to insert own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Allow users to update own leaderboard entry" ON leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON leaderboard;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON leaderboard;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON leaderboard;

-- Create NEW policies with correct syntax

-- 1. Allow ANYONE (even unauthenticated) to read ALL leaderboard entries
CREATE POLICY "leaderboard_select_all"
  ON leaderboard
  FOR SELECT
  TO public
  USING (true);

-- 2. Allow authenticated users to insert their own entry
CREATE POLICY "leaderboard_insert_own"
  ON leaderboard
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. Allow authenticated users to update their own entry
CREATE POLICY "leaderboard_update_own"
  ON leaderboard
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- STEP 3: Verify Setup
-- ============================================

-- Check table exists
SELECT 'Table created successfully' as status, COUNT(*) as row_count
FROM leaderboard;

-- Check RLS policies
SELECT
  policyname,
  cmd as command,
  roles,
  CASE
    WHEN qual = 'true' THEN 'All rows visible'
    ELSE qual::text
  END as access_rule
FROM pg_policies
WHERE tablename = 'leaderboard'
ORDER BY cmd;
```

4. Get your project credentials:
   - Go to **Project Settings** > **API**
   - Copy your **Project URL** and **anon/public** API key

5. Create a `.env` file in the project root:
```bash
cp .env.example .env
```

6. Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

7. Restart the development server to apply the changes

**Note**: The game works without Supabase - authentication and leaderboard features simply won't be available.

### Troubleshooting Supabase Setup

**Leaderboard shows only 3 users or is empty:**
- Re-run the complete setup SQL above in Supabase SQL Editor (it's safe to run multiple times)
- Check browser console (F12) for error messages
- Verify the `leaderboard` table exists in Supabase Table Editor
- Ensure users have played in Adaptive mode (Manual mode doesn't save to leaderboard)

**Leaderboard shows 0% completion:**
- This happens if users played before the database was set up correctly
- Have users play again in Adaptive mode to update their scores
- Or reset the leaderboard with this SQL:
  ```sql
  DELETE FROM leaderboard;
  ALTER SEQUENCE IF EXISTS leaderboard_id_seq RESTART WITH 1;
  ```

**Authentication errors:**
- Disable email confirmation in Supabase: Settings → Authentication → Email Auth → Disable "Enable email confirmations"
- The app uses format `username@adaptiveposner.local` automatically

**Table already exists error:**
- The setup SQL is safe to run multiple times
- It uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS` to prevent errors
- If you need a fresh start, delete the table first: `DROP TABLE IF EXISTS leaderboard CASCADE;`

### Build for Production

To create a production build:
```bash
npm run build
```

The built files will be in the `dist` directory.

## Deployment to Netlify

### Option 1: Deploy via Netlify UI

1. Push your code to GitHub
2. Log in to [Netlify](https://netlify.com)
3. Click "Add new site" > "Import an existing project"
4. Choose your GitHub repository
5. Netlify will auto-detect the settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Click "Deploy"

### Option 2: Deploy via Netlify CLI

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Login to Netlify:
```bash
netlify login
```

3. Initialize and deploy:
```bash
netlify init
netlify deploy --prod
```

### Option 3: Drag and Drop

1. Build the project locally:
```bash
npm run build
```

2. Go to [Netlify Drop](https://app.netlify.com/drop)
3. Drag the `dist` folder to the upload area

## How to Train

1. **Start**: Click "Start Game" on the main menu
2. **Read the Relationship**: Each round shows a possible relationship type
3. **Press SPACE**: Continue to see the word pair
4. **Respond Quickly**:
   - Press **J** if the words match the relationship
   - Press **F** if they don't match
5. **Get Feedback**:
   - **Green** = Correct answer
   - **Red** = Wrong answer
   - **Gray** = Timeout (no answer given)
6. **Complete the Session**: View your final score and percentage

## Technology Stack

- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling
- **Lucide React**: Icons
- **Netlify**: Hosting platform

## Project Structure

```
Aposner/
├── src/
│   ├── CognitiveTaskGame.jsx    # Main game component
│   ├── index.jsx                # React entry point
│   └── index.css                # Tailwind CSS imports
├── index.html                   # HTML template
├── package.json                 # Dependencies and scripts
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration
├── netlify.toml                # Netlify build settings
└── README.md                   # This file
```

## License

This project is open source and available under the MIT License.
