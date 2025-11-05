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
   - Run the SQL script from `supabase-schema.sql` (in the project root)
   - This creates the `leaderboard` table and sets up Row Level Security policies

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
