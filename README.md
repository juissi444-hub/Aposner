# Cognitive Task Game

A cognitive task game built with React to test your mental agility through various relationship recognition challenges.

## Features

- **Multiple Relationship Types**:
  - Whole-Part relationships (e.g., fish-pike, world-France)
  - Antonyms/Opposites (e.g., dark-light, cold-warm)
  - Same Color associations (e.g., grass-emerald, paper-snow)
  - Sequential Numbers (e.g., 3-4, 24-25)
  - Number Forms (e.g., seven-two, XI-V, 7-4)
  - Same Meaning Numbers (e.g., 2-two, V-5, five-5)

- **Configurable Difficulty**: 10 levels with decreasing response times
- **Customizable Sessions**: Choose between 10-60 tasks per session
- **Instant Feedback**: Visual color-coded feedback for correct/incorrect/timeout responses
- **Performance Tracking**: View your accuracy percentage at the end of each session

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

## How to Play

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
