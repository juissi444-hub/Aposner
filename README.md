# Adaptive Posner

A cognitive task game built with React to train your reading comprehension and speed through various relationship recognition challenges.

## Website to use the app: https://aposner.vercel.app

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
    - **Based on Scientific Research**: Follows the 4-level Posner task design from "Training semantic long-term memory retrieval transfers to executive function and reading fluency"
      - **Level 1**: Same Format (1-2, III-IV, 五-六) - Physical property retrieval
      - **Level 2**: Same Meaning (2-二-II) - Semantic property retrieval
      - **Level 3**: Both Odd/Even - Same Format (1-3, 二-四) - Conceptual retrieval
      - **Level 4**: Both Odd/Even - Mixed Format (1-三, 2-IV) - Conceptual retrieval
      - Uses numbers 1-1000 in Arabic and verbal forms, 1-30 in Roman numerals (I-XXX), 1-9 in Chinese (一~九), and 1-9 in Korean (일~구)
      - Difficulty increases ONLY through time pressure (2000ms → 87.5ms), NOT task type changes

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
