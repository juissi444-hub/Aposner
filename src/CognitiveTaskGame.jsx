import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const CognitiveTaskGame = () => {
  // Performance optimization: Memoize expensive computations
  const memoizedRelationTypes = useRef(null);

  // Ensure CJK fonts are loaded and applied
  useEffect(() => {
    const fontStyle = document.createElement('style');
    fontStyle.textContent = `
      /* Force CJK font for all elements */
      * {
        font-family: "Noto Sans SC", "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", sans-serif !important;
      }
      /* Specific font-face for CJK unicode range */
      @font-face {
        font-family: 'CJK-Fallback';
        src: local('Noto Sans SC'), local('Microsoft YaHei'), local('PingFang SC'), local('Hiragino Sans GB');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B73F, U+2B740-2B81F, U+2B820-2CEAF, U+F900-FAFF, U+2F800-2FA1F;
      }
    `;
    document.head.appendChild(fontStyle);
    return () => document.head.removeChild(fontStyle);
  }, []);

  // Add keyframe animation for 1st place glow
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes gloriously-shine {
        0%, 100% {
          box-shadow: 0 0 20px rgba(255, 215, 0, 0.8),
                      0 0 40px rgba(255, 215, 0, 0.6),
                      0 0 60px rgba(255, 215, 0, 0.4),
                      inset 0 0 20px rgba(255, 255, 255, 0.2);
          transform: scale(1);
        }
        50% {
          box-shadow: 0 0 30px rgba(255, 215, 0, 1),
                      0 0 60px rgba(255, 215, 0, 0.8),
                      0 0 90px rgba(255, 215, 0, 0.6),
                      inset 0 0 30px rgba(255, 255, 255, 0.3);
          transform: scale(1.02);
        }
      }
      .first-place-glow {
        animation: gloriously-shine 2s ease-in-out infinite;
        margin: 6px; /* Prevent glow from being cut off */
        transform: scale(1.15); /* Make 1st place significantly bigger */
        font-size: 1.15em; /* Larger text */
        will-change: transform, box-shadow; /* Performance optimization */
        transform: translateZ(0); /* GPU acceleration */
        backface-visibility: hidden; /* Prevent flickering */
      }
      /* Mobile-specific adjustments */
      @media (max-width: 640px) {
        .first-place-glow {
          margin: 8px; /* Extra margin on mobile to prevent overflow */
          transform: scale(1.12); /* Slightly less scale on mobile */
          font-size: 1.12em;
        }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const celebrationAudioRef = useRef(null);
  const correctAudioRef = useRef(null);
  const incorrectAudioRef = useRef(null);
  const levelDownAudioRef = useRef(null);
  const successAudioRef = useRef(null);
  const timeoutRef = useRef(null);
  const autoContinueTimerRef = useRef(null);
  const levelTransitionTimerRef = useRef(null); // For level up/down transition delays
  const gameStateRef = useRef('menu'); // Ref to track current gameState for cleanup
  const [gameState, setGameState] = useState('menu');
  const [mode, setMode] = useState(null); // 'manual' or 'adaptive'
  const [level, setLevel] = useState(1);
  const [savedAdaptiveLevel, setSavedAdaptiveLevel] = useState(1);
  const [highestLevel, setHighestLevel] = useState(1);
  const [selectedRelationTypes, setSelectedRelationTypes] = useState({
    'same-format': true,
    'meaning': true,
    'parity-same-format': true,
    'parity-mixed-format': true,
    'whole-part': true,
    'antonym': true,
    'same-color': true,
    'followup-numerical': true,
    'physical-numerical': true,
    'same-time': true,
    'even': true,
    'odd': true,
    'doubled': true,
    'tripled': true
  });
  const [showManualModeOptions, setShowManualModeOptions] = useState(false); // Toggle for showing manual mode options
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(false);
  const [autoContinueDelay, setAutoContinueDelay] = useState(3); // 1-20 seconds
  const [experimentalMode, setExperimentalMode] = useState(false); // Enable experimental relation types
  const [numTasks, setNumTasks] = useState(32);
  const [matchPercentage, setMatchPercentage] = useState(50); // Percentage of tasks that should be matches (manual mode only)
  const [taskMatchSequence, setTaskMatchSequence] = useState([]); // Pre-determined sequence of match/no-match for current game
  const [currentTask, setCurrentTask] = useState(0);
  const [currentRelation, setCurrentRelation] = useState('');
  const [currentWords, setCurrentWords] = useState(['', '']);
  const [isActualRelation, setIsActualRelation] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0); // Track wrong answers in adaptive mode
  const [feedback, setFeedback] = useState(null);
  const [userAnswered, setUserAnswered] = useState(false);
  const [taskHistory, setTaskHistory] = useState([]);
  const [usedPairs, setUsedPairs] = useState(new Set()); // Track used word pairs in current session
  const [trialStartTime, setTrialStartTime] = useState(null); // Track when trial starts
  const [responseTimes, setResponseTimes] = useState([]); // Track all response times for correct answers

  // Authentication and leaderboard states
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showBellCurve, setShowBellCurve] = useState(false);
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);

  // Training time tracking states
  const [sessionStartTime, setSessionStartTime] = useState(null); // Track when training session starts
  const [totalSessionMinutes, setTotalSessionMinutes] = useState(0); // Total minutes trained today
  const [totalSessionSeconds, setTotalSessionSeconds] = useState(0); // Total seconds trained today (remainder after minutes)
  const [trainingGoalMinutes, setTrainingGoalMinutes] = useState(0); // User's daily training goal (0-500)
  const [trainingSessions, setTrainingSessions] = useState([]); // Array of {date, minutes, seconds, level_reached}
  const [totalTrainingMinutes, setTotalTrainingMinutes] = useState(0); // Total training time across all sessions

  // Numeral system enable states
  const [chineseNumeralsEnabled, setChineseNumeralsEnabled] = useState(false);
  const [koreanNumeralsEnabled, setKoreanNumeralsEnabled] = useState(false);
  const [showChineseReference, setShowChineseReference] = useState(false);
  const [showKoreanReference, setShowKoreanReference] = useState(false);

  const getTimeForLevel = (lvl) => {
    // Levels 1-5: 2000ms down to 1000ms (decreasing by 250ms per level)
    if (lvl <= 5) return 2000 - (lvl - 1) * 250;

    // Levels 6-15: 750ms down to 300ms (decreasing by 50ms per level)
    if (lvl <= 15) {
      return 750 - (lvl - 6) * 50;
    }

    // Levels 16-28: Explicit timings (final level is 28)
    const levelTimings = {
      16: 275,
      17: 250,
      18: 225,
      19: 200,
      20: 187.5,
      21: 175,
      22: 162.5,
      23: 150,
      24: 137.5,
      25: 125,
      26: 112.5,
      27: 100,
      28: 87.5
    };

    // Return explicit timing for levels 16-28, or 87.5ms for any level beyond 28
    return levelTimings[lvl] || 87.5;
  };

  // Get color class for a number/character based on its value (1-9)
  const getNumberColor = (char) => {
    // Map characters to numeric values
    const numberMap = {
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9,
      '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '칠': 7, '팔': 8, '구': 9
    };

    const value = numberMap[char];

    // Return color based on value (matching Chinese character guide)
    if (value >= 1 && value <= 3) return 'text-blue-400';
    if (value >= 4 && value <= 6) return 'text-green-400';
    if (value >= 7 && value <= 9) return 'text-purple-400';

    // Default color for non-numeric values
    return 'text-yellow-400';
  };

  // Keep gameStateRef in sync with gameState
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Load progress from localStorage on mount
  useEffect(() => {
    console.log('🔄 Loading progress from localStorage on mount...');
    const savedLevel = localStorage.getItem('adaptivePosnerLevel');
    const savedHighest = localStorage.getItem('adaptivePosnerHighest');
    const savedSound = localStorage.getItem('adaptivePosnerSound');
    const savedAutoContinue = localStorage.getItem('adaptivePosnerAutoContinue');
    const savedAutoContinueDelay = localStorage.getItem('adaptivePosnerAutoContinueDelay');
    const savedExperimentalMode = localStorage.getItem('adaptivePosnerExperimental');

    console.log('📦 localStorage values:', {
      savedLevel,
      savedHighest,
      savedSound,
      savedAutoContinue,
      savedAutoContinueDelay,
      savedExperimentalMode
    });

    if (savedLevel) {
      const levelNum = parseInt(savedLevel);
      // Ensure level is at least 1
      if (levelNum <= 0) {
        console.warn('⚠️ Invalid saved level detected:', levelNum, '- resetting to 1');
        localStorage.setItem('adaptivePosnerLevel', '1');
        setSavedAdaptiveLevel(1);
        setLevel(1);
      } else {
        console.log('✅ Loaded savedAdaptiveLevel from localStorage:', levelNum);
        setSavedAdaptiveLevel(levelNum);
        setLevel(levelNum);
      }
    } else {
      console.log('⚠️ No saved level found in localStorage, using default: 1');
    }

    if (savedHighest) {
      const highestNum = parseInt(savedHighest);
      // Ensure highest is at least 1
      if (highestNum <= 0) {
        console.warn('⚠️ Invalid saved highest level detected:', highestNum, '- resetting to 1');
        localStorage.setItem('adaptivePosnerHighest', '1');
        setHighestLevel(1);
      } else {
        console.log('✅ Loaded highestLevel from localStorage:', highestNum);
        setHighestLevel(highestNum);
      }
    } else {
      console.log('⚠️ No saved highest level found in localStorage, using default: 1');
    }

    if (savedSound !== null) {
      setSoundEnabled(savedSound === 'true');
    }

    if (savedAutoContinue !== null) {
      setAutoContinueEnabled(savedAutoContinue === 'true');
    }

    if (savedAutoContinueDelay) {
      const delay = parseInt(savedAutoContinueDelay);
      if (delay >= 1 && delay <= 20) {
        setAutoContinueDelay(delay);
      }
    }

    if (savedExperimentalMode !== null) {
      setExperimentalMode(savedExperimentalMode === 'true');
    }

    console.log('✅ localStorage load complete');
  }, []);

  // Calculate today's training time from sessions
  useEffect(() => {
    if (!trainingSessions || trainingSessions.length === 0) {
      setTotalSessionMinutes(0);
      setTotalSessionSeconds(0);
      return;
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Sum up all minutes and seconds from today's sessions
    const todaySessions = trainingSessions.filter(session => session.date === todayString);
    const totalSeconds = todaySessions.reduce((total, session) =>
      total + (session.minutes || 0) * 60 + (session.seconds || 0), 0);

    const todayMinutes = Math.floor(totalSeconds / 60);
    const todaySeconds = totalSeconds % 60;

    setTotalSessionMinutes(todayMinutes);
    setTotalSessionSeconds(todaySeconds);
    console.log(`📊 Today's training time calculated: ${todayMinutes}m ${todaySeconds}s from ${todaySessions.length} sessions`);
  }, [trainingSessions]);

  // Separate effect for authentication
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let mounted = true;

    // Restore session on mount with extended retry for Chrome/Samsung compatibility
    const restoreSession = async (retryCount = 0) => {
      const maxRetries = 3; // Increased from 1 to 3 for Samsung Chrome
      const retryDelays = [500, 1000, 2000]; // Exponential backoff delays

      try {
        console.log('🔐 Attempting to restore session...', retryCount > 0 ? `(retry ${retryCount}/${maxRetries})` : '');

        // Add delay before attempting if this is a retry, to allow storage to stabilize
        if (retryCount > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('❌ Session restore error:', error.message, error.code || '');

          // Retry with exponential backoff for Chrome/Samsung
          if (retryCount < maxRetries) {
            const delay = retryDelays[retryCount] || 2000;
            console.log(`⏳ Retrying session restore in ${delay}ms...`);
            setTimeout(() => {
              if (mounted) restoreSession(retryCount + 1);
            }, delay);
            return;
          }

          console.error('❌ Session restore failed after', maxRetries, 'retries');
          setUser(null);
          return;
        }

        if (session?.user) {
          console.log('✅ Session restored successfully:', session.user.email);
          setUser(session.user);
          setShowAuth(false);
          // loadUserProgress now handles waiting for auth to be fully ready internally
          loadUserProgress(session.user.id);
        } else {
          console.log('ℹ️ No active session found');
          setUser(null);
        }
      } catch (error) {
        console.error('❌ Session restore exception:', error.message || error);

        // Retry with exponential backoff for Chrome/Samsung
        if (retryCount < maxRetries) {
          const delay = retryDelays[retryCount] || 2000;
          console.log(`⏳ Retrying session restore in ${delay}ms after exception...`);
          setTimeout(() => {
            if (mounted) restoreSession(retryCount + 1);
          }, delay);
          return;
        }

        console.error('❌ Session restore failed after', maxRetries, 'retries (exception)');
        setUser(null);
      }
    };

    restoreSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log('🔔 Auth state change:', event, session?.user?.email || 'no user');

      if (event === 'SIGNED_IN' && session?.user) {
        console.log('✅ User signed in:', session.user.email);
        setUser(session.user);
        setShowAuth(false);
        const username = session.user.user_metadata?.username || session.user.email;
        migrateAnonymousToAccount(session.user.id, username);
        // loadUserProgress now handles waiting for auth to be fully ready internally
        loadUserProgress(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        console.log('🚪 User signed out');
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log('🔄 Token refreshed successfully for:', session.user.email);
        setUser(session.user);
      } else if (event === 'TOKEN_REFRESH_FAILED') {
        console.error('❌ Token refresh failed - attempting to restore session');
        // Try to restore session with extended retry logic
        setTimeout(() => {
          if (mounted) {
            console.log('🔄 Attempting session restore after token refresh failure...');
            restoreSession(0);
          }
        }, 1000);
      } else if (event === 'USER_UPDATED' && session?.user) {
        console.log('👤 User updated:', session.user.email);
        setUser(session.user);
      }
    });

    return () => {
      console.log('🔌 Cleaning up auth effect');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Only run once on mount

  // Toggle sound setting
  const toggleSound = async () => {
    const newSoundState = !soundEnabled;
    setSoundEnabled(newSoundState);
    localStorage.setItem('adaptivePosnerSound', String(newSoundState));

    // Save to server
    if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
      try {
        await supabase
          .from('leaderboard')
          .update({ sound_enabled: newSoundState })
          .eq('user_id', user.id);
        console.log('✅ Sound setting saved to server:', newSoundState);
      } catch (err) {
        console.warn('⚠️ Failed to save sound setting to server:', err.message);
      }
    }
  };

  // Toggle auto-continue setting
  const toggleAutoContinue = async () => {
    const newState = !autoContinueEnabled;
    setAutoContinueEnabled(newState);
    localStorage.setItem('adaptivePosnerAutoContinue', String(newState));

    // Save to server
    if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
      try {
        await supabase
          .from('leaderboard')
          .update({ auto_continue_enabled: newState })
          .eq('user_id', user.id);
        console.log('✅ Auto-continue setting saved to server:', newState);
      } catch (err) {
        console.warn('⚠️ Failed to save auto-continue setting to server:', err.message);
      }
    }
  };

  // Update auto-continue delay
  const updateAutoContinueDelay = async (delay) => {
    const delayNum = parseInt(delay);
    if (delayNum >= 1 && delayNum <= 20) {
      setAutoContinueDelay(delayNum);
      localStorage.setItem('adaptivePosnerAutoContinueDelay', String(delayNum));

      // Save to server
      if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
        try {
          await supabase
            .from('leaderboard')
            .update({ auto_continue_delay: delayNum })
            .eq('user_id', user.id);
          console.log('✅ Auto-continue delay saved to server:', delayNum);
        } catch (err) {
          console.warn('⚠️ Failed to save auto-continue delay to server:', err.message);
        }
      }
    }
  };

  // Toggle experimental mode
  const toggleExperimentalMode = async () => {
    const newState = !experimentalMode;
    setExperimentalMode(newState);
    localStorage.setItem('adaptivePosnerExperimental', String(newState));

    // Save to server
    if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
      try {
        await supabase
          .from('leaderboard')
          .update({ experimental_mode: newState })
          .eq('user_id', user.id);
        console.log('✅ Experimental mode setting saved to server:', newState);
      } catch (err) {
        console.warn('⚠️ Failed to save experimental mode setting to server:', err.message);
      }
    }
  };

  // Toggle Chinese numerals
  const toggleChineseNumerals = async () => {
    const newState = !chineseNumeralsEnabled;
    setChineseNumeralsEnabled(newState);
    localStorage.setItem('chineseNumeralsEnabled', String(newState));
    console.log('🇨🇳 Chinese numerals', newState ? 'enabled' : 'disabled');

    // Save to server
    if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
      try {
        await supabase
          .from('leaderboard')
          .update({ chinese_numerals_enabled: newState })
          .eq('user_id', user.id);
        console.log('✅ Chinese numerals setting saved to server:', newState);
      } catch (err) {
        console.warn('⚠️ Failed to save Chinese numerals setting to server:', err.message);
      }
    }
  };

  // Toggle Korean numerals
  const toggleKoreanNumerals = async () => {
    const newState = !koreanNumeralsEnabled;
    setKoreanNumeralsEnabled(newState);
    localStorage.setItem('koreanNumeralsEnabled', String(newState));
    console.log('🇰🇷 Korean numerals', newState ? 'enabled' : 'disabled');

    // Save to server
    if (isSupabaseConfigured() && user && !user.id.startsWith('anon_')) {
      try {
        await supabase
          .from('leaderboard')
          .update({ korean_numerals_enabled: newState })
          .eq('user_id', user.id);
        console.log('✅ Korean numerals setting saved to server:', newState);
      } catch (err) {
        console.warn('⚠️ Failed to save Korean numerals setting to server:', err.message);
      }
    }
  };

  // Stop all currently playing sounds
  const stopAllSounds = useCallback(() => {
    [celebrationAudioRef, correctAudioRef, incorrectAudioRef, levelDownAudioRef, successAudioRef].forEach(ref => {
      if (ref.current) {
        ref.current.pause();
        ref.current.currentTime = 0;
      }
    });
  }, []);

  // Authentication functions
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!isSupabaseConfigured()) return;

    setAuthError('');

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: `${username}@adaptiveposner.local`,
          password: password,
          options: {
            data: {
              username: username
            }
          }
        });
        if (error) throw error;

        // Create leaderboard entry for new user
        if (data.user) {
          console.log('📝 Creating leaderboard entry for new user:', username);
          // Get current settings from localStorage to preserve them
          const currentSettings = {
            sound_enabled: localStorage.getItem('adaptivePosnerSound') === 'true' || localStorage.getItem('adaptivePosnerSound') === null,
            auto_continue_enabled: localStorage.getItem('adaptivePosnerAutoContinue') === 'true',
            auto_continue_delay: parseInt(localStorage.getItem('adaptivePosnerAutoContinueDelay')) || 3,
            experimental_mode: localStorage.getItem('adaptivePosnerExperimental') === 'true',
            chinese_numerals_enabled: localStorage.getItem('chineseNumeralsEnabled') === 'true',
            korean_numerals_enabled: localStorage.getItem('koreanNumeralsEnabled') === 'true',
            training_goal_minutes: parseInt(localStorage.getItem('trainingGoalMinutes')) || 0
          };

          const { error: insertError } = await supabase
            .from('leaderboard')
            .insert([
              {
                user_id: data.user.id,
                username: username,
                highest_level: 0,
                best_score: 0,
                ...currentSettings
              }
            ]);
          if (insertError) {
            console.error('❌ Failed to create leaderboard entry:', insertError);
            throw insertError;
          }
          console.log('✅ Leaderboard entry created - starting at level 0');

          // Migrate anonymous data if exists
          await migrateAnonymousToAccount(data.user.id, username);
        }

        setShowAuth(false);
        setUsername('');
        setPassword('');
        setShowPassword(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: `${username}@adaptiveposner.local`,
          password: password
        });
        if (error) throw error;
        setShowAuth(false);
        setUsername('');
        setPassword('');
        setShowPassword(false);
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  // Migrate anonymous user data to authenticated account
  const migrateAnonymousToAccount = useCallback(async (userId, username) => {
    if (!isSupabaseConfigured()) return;

    // Safety check: never query leaderboard with anonymous user IDs
    if (!userId || userId.toString().startsWith('anon_')) {
      console.warn('⚠️ migrateAnonymousToAccount called with invalid userId:', userId);
      return;
    }

    const anonId = localStorage.getItem('aposner-anonymous-id');
    if (!anonId) {
      return;
    }

    try {
      // Anonymous users don't have leaderboard entries (only authenticated users do)
      // Just get their local progress from user_progress table
      const { data: anonData, error: anonError} = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', anonId)
        .single();

      // Ignore any errors - anonymous data migration is optional
      if (anonError || !anonData) {
        localStorage.removeItem('aposner-anonymous-id');
        return;
      }

      // Get user's existing data
      const { data: userData } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', userId)
        .single();

      // If anonymous data has better progress, update user's leaderboard
      const currentLevel = anonData.current_level || 0;
      const highestLevel = anonData.highest_level || 0;
      const bestScore = anonData.best_score || 0;

      if (highestLevel > (userData?.highest_level || 0) ||
          bestScore > (userData?.best_score || 0)) {
        await supabase
          .from('leaderboard')
          .upsert({
            user_id: userId,
            username: username,
            highest_level: Math.max(highestLevel, userData?.highest_level || 0),
            best_score: Math.max(bestScore, userData?.best_score || 0),
            is_anonymous: false,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      }

      // Delete anonymous progress entry
      await supabase
        .from('user_progress')
        .delete()
        .eq('user_id', anonId);

      // Clear anonymous ID
      localStorage.removeItem('aposner-anonymous-id');
    } catch (error) {
      console.error('❌ Migration failed:', error);
    }
  }, []);

  const handleLogout = async () => {
    if (!isSupabaseConfigured()) return;
    console.log('🚪 Logging out user...');
    try {
      // Sign out from Supabase (let Supabase handle session cleanup)
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ Error signing out:', error);
        throw error;
      }
      console.log('✅ Successfully signed out from Supabase');

      // Clear UI state (Supabase will handle storage cleanup via onAuthStateChange)
      setUser(null);
      setShowLeaderboard(false);
      setShowAuth(false);
      setLeaderboard([]);

      console.log('✅ Logout complete - UI state cleared');
    } catch (error) {
      console.error('❌ Exception during sign out:', error);
      // Even if there's an error, clear the UI state
      setUser(null);
      setShowLeaderboard(false);
      setShowAuth(false);
      setLeaderboard([]);
    }
  };

  // Load user progress from Supabase
  const loadUserProgress = useCallback(async (userId) => {
    if (!isSupabaseConfigured()) return;

    try {
      console.log('═'.repeat(80));
      console.log('📥 Loading user progress from server for user:', userId);

      // CRITICAL: Wait for auth session to be fully ready on mobile Chrome
      // Mobile Chrome needs extra time for auth context to initialize
      let sessionReady = false;
      let retries = 0;
      const maxRetries = 5;

      while (!sessionReady && retries < maxRetries) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (session && session.user && session.user.id === userId) {
            console.log('✅ Auth session confirmed ready for queries');
            sessionReady = true;
          } else if (error) {
            console.warn(`⚠️ Session check attempt ${retries + 1} failed:`, error.message);
          } else {
            console.warn(`⚠️ Session not ready yet, attempt ${retries + 1}/${maxRetries}`);
          }
        } catch (err) {
          console.warn(`⚠️ Session check error attempt ${retries + 1}:`, err.message);
        }

        if (!sessionReady) {
          retries++;
          // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
          await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, retries - 1)));
        }
      }

      if (!sessionReady) {
        console.error('❌ Auth session never became ready after', maxRetries, 'attempts');
        return;
      }

      // Get current local values first (these are the fallback)
      const localLevel = parseInt(localStorage.getItem('adaptivePosnerLevel') || '0');
      const localHighest = parseInt(localStorage.getItem('adaptivePosnerHighest') || '0');
      const localBestScore = parseInt(localStorage.getItem('adaptivePosnerBestScore') || '0');

      console.log('📦 Current localStorage:', { localLevel, localHighest, localBestScore });

      let serverCurrentLevel = 0;
      let serverHighestLevel = 0;
      let serverBestScore = 0;

      // Try to load from user_progress table (current progress)
      try {
        const { data: progressData, error: progressError } = await supabase
          .from('user_progress')
          .select('current_level, highest_level, current_score')
          .eq('user_id', userId)
          .single();

        if (progressError && progressError.code !== 'PGRST116') {
          console.warn('⚠️ user_progress table query failed (table may not exist yet):', progressError.message);
        } else if (progressData) {
          serverCurrentLevel = progressData.current_level || 0;
          serverHighestLevel = progressData.highest_level || 0;
          console.log('📥 Loaded from user_progress:', { serverCurrentLevel, serverHighestLevel });
        }
      } catch (err) {
        console.warn('⚠️ Error loading user_progress:', err.message);
      }

      // Try to load from leaderboard table (best achievements) - only for authenticated users
      if (!userId.startsWith('anon_')) {
        try {
          // First try with all columns including training time (for migrated databases)
          let { data: leaderboardData, error: leaderboardError } = await supabase
            .from('leaderboard')
            .select('highest_level, best_score, total_training_minutes, training_sessions, training_goal_minutes, sound_enabled, auto_continue_enabled, auto_continue_delay, experimental_mode, chinese_numerals_enabled, korean_numerals_enabled')
            .eq('user_id', userId)
            .single();

          // If query failed due to missing columns, retry with ONLY base schema columns
          if (leaderboardError && leaderboardError.message && leaderboardError.message.includes('does not exist')) {
            console.log('⚠️ Extended columns not found, retrying with minimal base schema only');
            const { data: baseData, error: baseError } = await supabase
              .from('leaderboard')
              .select('highest_level, best_score')
              .eq('user_id', userId)
              .single();

            leaderboardData = baseData;
            leaderboardError = baseError;
          }

          if (leaderboardError && leaderboardError.code !== 'PGRST116') {
            console.warn('⚠️ leaderboard table query failed:', leaderboardError.message);
          } else if (leaderboardData) {
            serverHighestLevel = Math.max(serverHighestLevel, leaderboardData.highest_level || 0);
            serverBestScore = leaderboardData.best_score || 0;
            console.log('📥 Loaded from leaderboard:', { serverHighestLevel, serverBestScore });

            // Load training data (if columns exist in database)
            if (leaderboardData.total_training_minutes !== undefined) {
              setTotalTrainingMinutes(leaderboardData.total_training_minutes);
              console.log('📥 Loaded training minutes:', leaderboardData.total_training_minutes);
            }
            if (leaderboardData.training_sessions !== undefined) {
              setTrainingSessions(leaderboardData.training_sessions);
              console.log('📥 Loaded training sessions:', leaderboardData.training_sessions.length);
            }
            if (leaderboardData.training_goal_minutes !== undefined) {
              setTrainingGoalMinutes(leaderboardData.training_goal_minutes);
              localStorage.setItem('trainingGoalMinutes', String(leaderboardData.training_goal_minutes));
              console.log('📥 Loaded training goal:', leaderboardData.training_goal_minutes);
            }

            // Load all user settings
            if (leaderboardData.sound_enabled !== null && leaderboardData.sound_enabled !== undefined) {
              setSoundEnabled(leaderboardData.sound_enabled);
              localStorage.setItem('adaptivePosnerSound', String(leaderboardData.sound_enabled));
              console.log('📥 Loaded sound setting:', leaderboardData.sound_enabled);
            }
            if (leaderboardData.auto_continue_enabled !== null && leaderboardData.auto_continue_enabled !== undefined) {
              setAutoContinueEnabled(leaderboardData.auto_continue_enabled);
              localStorage.setItem('adaptivePosnerAutoContinue', String(leaderboardData.auto_continue_enabled));
              console.log('📥 Loaded auto-continue setting:', leaderboardData.auto_continue_enabled);
            }
            if (leaderboardData.auto_continue_delay) {
              setAutoContinueDelay(leaderboardData.auto_continue_delay);
              localStorage.setItem('adaptivePosnerAutoContinueDelay', String(leaderboardData.auto_continue_delay));
              console.log('📥 Loaded auto-continue delay:', leaderboardData.auto_continue_delay);
            }
            if (leaderboardData.experimental_mode !== null && leaderboardData.experimental_mode !== undefined) {
              setExperimentalMode(leaderboardData.experimental_mode);
              localStorage.setItem('adaptivePosnerExperimental', String(leaderboardData.experimental_mode));
              console.log('📥 Loaded experimental mode:', leaderboardData.experimental_mode);
            }
            if (leaderboardData.chinese_numerals_enabled !== null && leaderboardData.chinese_numerals_enabled !== undefined) {
              setChineseNumeralsEnabled(leaderboardData.chinese_numerals_enabled);
              localStorage.setItem('chineseNumeralsEnabled', String(leaderboardData.chinese_numerals_enabled));
              console.log('📥 Loaded Chinese numerals setting:', leaderboardData.chinese_numerals_enabled);
            }
            if (leaderboardData.korean_numerals_enabled !== null && leaderboardData.korean_numerals_enabled !== undefined) {
              setKoreanNumeralsEnabled(leaderboardData.korean_numerals_enabled);
              localStorage.setItem('koreanNumeralsEnabled', String(leaderboardData.korean_numerals_enabled));
              console.log('📥 Loaded Korean numerals setting:', leaderboardData.korean_numerals_enabled);
            }
          }
        } catch (err) {
          console.warn('⚠️ Error loading leaderboard:', err.message);
        }
      } else {
        console.log('⚠️ Anonymous user - skipping leaderboard query');
      }

      // Use the maximum values, but ensure at least 1
      const maxCurrentLevel = Math.max(1, localLevel, serverCurrentLevel);
      const maxHighestLevel = Math.max(1, localHighest, serverHighestLevel);
      const maxBestScore = Math.max(0, localBestScore, serverBestScore);

      console.log('🔢 Calculated maximums:', { maxCurrentLevel, maxHighestLevel, maxBestScore });

      // ONLY update localStorage if we actually have data from server OR localStorage had values
      // Don't write default values if both local and server are empty
      const hasLocalData = localLevel > 0 || localHighest > 0 || localBestScore > 0;
      const hasServerData = serverCurrentLevel > 0 || serverHighestLevel > 0 || serverBestScore > 0;

      if (hasLocalData || hasServerData) {
        console.log('💾 Updating localStorage with merged data');
        localStorage.setItem('adaptivePosnerLevel', String(maxCurrentLevel));
        localStorage.setItem('adaptivePosnerHighest', String(maxHighestLevel));
        localStorage.setItem('adaptivePosnerBestScore', String(maxBestScore));
      } else {
        console.log('⚠️ No data from server or localStorage - NOT overwriting localStorage with defaults');
      }

      // Always update state (React state defaults are fine)
      setSavedAdaptiveLevel(maxCurrentLevel);
      setHighestLevel(maxHighestLevel);
      setLevel(maxCurrentLevel);

      console.log(`✅ Progress sync complete:`);
      console.log(`   Current Level: Local=${localLevel}, Server=${serverCurrentLevel}, Using=${maxCurrentLevel}`);
      console.log(`   Highest Level: Local=${localHighest}, Server=${serverHighestLevel}, Using=${maxHighestLevel}`);
      console.log(`   Best Score: Local=${localBestScore}, Server=${serverBestScore}, Using=${maxBestScore}`);
      console.log('═'.repeat(80));
    } catch (error) {
      console.error('Error loading user progress:', error);
      // Even if server fails, keep localStorage values
      console.log('✅ Keeping localStorage values due to server error');
    }
  }, []);

  // Leaderboard loading
  const loadLeaderboard = useCallback(async (retryCount = 0) => {
    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Leaderboard load skipped - Supabase not configured');
      return;
    }

    console.log('📊 Loading leaderboard data...', retryCount > 0 ? `(retry ${retryCount})` : '');

    // Check if we have a valid session first
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.warn('⚠️ Session check failed before leaderboard load:', sessionError.message);
        // Try to restore session if this is the first attempt
        if (retryCount === 0) {
          console.log('🔄 Attempting to restore session before loading leaderboard...');
          setTimeout(() => loadLeaderboard(1), 1000);
          return;
        }
      }

      if (!session && retryCount === 0) {
        console.log('ℹ️ No active session - will load public leaderboard data');
      } else if (session?.user) {
        console.log('✅ Valid session found for:', session.user.email);
      }
    } catch (sessionCheckError) {
      console.warn('⚠️ Session check exception:', sessionCheckError);
    }

    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('highest_level', { ascending: false })
        .order('best_score', { ascending: false })
        .limit(100); // Limit to top 100 to improve performance

      if (error) {
        console.error('❌ Leaderboard query error:', error);
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        console.error('   Error details:', error.details);

        // If it's an auth error and we haven't retried yet, try again after refreshing session
        if ((error.code === 'PGRST301' || error.message?.includes('JWT')) && retryCount === 0) {
          console.log('🔄 Auth error detected - retrying leaderboard load after session refresh...');
          setTimeout(() => loadLeaderboard(1), 1500);
          return;
        }

        setLeaderboard([]);
      } else {
        console.log(`✅ Leaderboard loaded: ${data?.length || 0} entries`);
        if (data && data.length > 0) {
          console.log('📊 Sample entry:', data[0]);
        }
        setLeaderboard(data || []);
      }
    } catch (error) {
      console.error('❌ Leaderboard load exception:', error);

      // Retry once if network or auth issue
      if (retryCount === 0 && (error.message?.includes('JWT') || error.message?.includes('network'))) {
        console.log('🔄 Retrying leaderboard load after exception...');
        setTimeout(() => loadLeaderboard(1), 1500);
        return;
      }

      setLeaderboard([]);
    }
  }, []); // No dependencies - this function doesn't need to be recreated

  // Auto-load leaderboard when modal opens
  useEffect(() => {
    if (showLeaderboard && isSupabaseConfigured()) {
      console.log('📊 Leaderboard modal opened - auto-loading data...');
      loadLeaderboard();
    }
  }, [showLeaderboard, loadLeaderboard]);

  const updateLeaderboard = useCallback(async (newLevel, newScore, currentResponseTimes = []) => {
    console.log('═'.repeat(80));
    console.log('🔥🔥🔥 updateLeaderboard CALLED 🔥🔥🔥');
    console.log('🔥 newLevel:', newLevel);
    console.log('🔥 newScore:', newScore);
    console.log('🔥 responseTimes count:', currentResponseTimes.length);
    console.log('🔥 isSupabaseConfigured():', isSupabaseConfigured());
    console.log('🔥 user:', user?.email);
    console.log('🔥 mode:', mode);

    if (!isSupabaseConfigured()) {
      console.error('❌ BLOCKED: Supabase not configured');
      return;
    }

    if (mode !== 'adaptive') {
      console.log('⚠️ BLOCKED: Not in adaptive mode (current mode:', mode, ')');
      return;
    }

    // Get or create anonymous user ID for non-logged-in users
    let userId;
    let username;
    let isAnonymous = false;

    if (user) {
      userId = user.id;
      username = user.user_metadata?.username || user.email;
      console.log(`📝 Logged in user:`, username);
    } else {
      // Anonymous user - get or create a unique ID
      let anonId = localStorage.getItem('aposner-anonymous-id');
      if (!anonId) {
        anonId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('aposner-anonymous-id', anonId);
        console.log(`👤 Created new anonymous ID:`, anonId);
      } else {
        console.log(`👤 Using existing anonymous ID:`, anonId);
      }
      userId = anonId;
      username = 'Anonymous User';
      isAnonymous = true;
    }

    // Validate and correct data before attempting to save
    // If level is 0 or negative, set to 1 (minimum level)
    let validLevel = newLevel;
    if (validLevel <= 0) {
      console.warn('⚠️ Level <= 0 detected, adjusting to level 1. Original:', newLevel);
      validLevel = 1;
    }

    let validScore = newScore;
    if (validScore < 0) {
      console.warn('⚠️ Negative score detected, adjusting to 0. Original:', newScore);
      validScore = 0;
    }

    // Anonymous users don't save to leaderboard - only logged-in users do
    if (isAnonymous) {
      console.log('⚠️ Anonymous user - skipping leaderboard save (anonymous users only use localStorage)');
      return;
    }

    console.log(`📝 Saving to leaderboard: Level ${validLevel}, Score ${validScore}`);

    try {
      console.log(`📝 ✅ All checks passed - proceeding with leaderboard update`);
      console.log(`📝 User:`, username);
      console.log(`📝 User ID:`, userId);

      // Get current leaderboard entry
      const { data: currentData, error: fetchError } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error fetching current leaderboard data:', fetchError);
        throw fetchError;
      }

      console.log('📝 Current leaderboard data:', JSON.stringify(currentData, null, 2));

      // Determine the values to save
      let highestLevel = validLevel;
      let bestScore = validScore;

      if (currentData) {
        console.log(`📝 Comparing: new level ${validLevel} vs current ${currentData.highest_level}`);
        if (validLevel > currentData.highest_level) {
          // Player reached a new highest level - use new level and its score
          console.log(`✅ New highest level reached: ${validLevel} > ${currentData.highest_level}`);
          highestLevel = validLevel;
          bestScore = validScore;
        } else if (validLevel === currentData.highest_level) {
          // Same level - keep the highest level, update best score if higher
          console.log(`✅ Same level ${validLevel}, comparing scores: new=${validScore}, old=${currentData.best_score}`);
          console.log(`✅ Score types: new is ${typeof validScore}, old is ${typeof currentData.best_score}`);
          const oldScore = currentData.best_score || 0;
          const maxScore = Math.max(validScore, oldScore);
          console.log(`✅ Math.max(${validScore}, ${oldScore}) = ${maxScore}`);
          highestLevel = currentData.highest_level;
          bestScore = maxScore;
        } else {
          // Playing a lower level - don't update
          console.log(`⚠️ Lower level ${validLevel} < ${currentData.highest_level}, skipping update`);
          return;
        }
      } else {
        console.log(`📝 No current data found, creating new entry with Level ${validLevel}, Score ${validScore}`);
      }

      console.log(`💾 Saving to leaderboard: Level ${highestLevel}, Score ${bestScore}`);

      // Calculate average response time (in milliseconds)
      let averageAnswerTime = null;
      if (currentResponseTimes.length > 0) {
        const sum = currentResponseTimes.reduce((acc, time) => acc + time, 0);
        averageAnswerTime = Math.round(sum / currentResponseTimes.length);
        console.log(`⏱️ Average answer time: ${averageAnswerTime}ms (from ${currentResponseTimes.length} correct answers)`);
      }

      // Prepare data to save - include average_answer_time if we have it
      const dataToSave = {
        user_id: userId,
        username: username,
        highest_level: highestLevel,
        best_score: bestScore,
        is_anonymous: false, // Only logged-in users reach this point
        updated_at: new Date().toISOString()
      };

      // Only include average_answer_time if we have valid data
      if (averageAnswerTime !== null) {
        dataToSave.average_answer_time = averageAnswerTime;
      }

      // Calculate training time for this session
      if (sessionStartTime) {
        const sessionEndTime = Date.now();
        const sessionTotalSeconds = Math.floor((sessionEndTime - sessionStartTime) / 1000);
        const sessionMinutes = Math.floor(sessionTotalSeconds / 60);
        const sessionSeconds = sessionTotalSeconds % 60;

        if (sessionMinutes > 0 || sessionSeconds > 0) {
          console.log(`⏱️ Training session duration: ${sessionMinutes}m ${sessionSeconds}s`);

          // Update training time via database function (database only tracks minutes)
          try {
            const { error: trainingError } = await supabase
              .rpc('update_training_time', {
                p_user_id: userId,
                p_minutes: sessionMinutes,
                p_level_reached: highestLevel
              });

            if (trainingError) {
              console.warn('⚠️ Error updating training time:', trainingError.message);
            } else {
              console.log('✅ Training time updated successfully');
              // Update local state
              const today = new Date();
              const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

              // Add this session to trainingSessions array
              setTrainingSessions(prev => {
                // Check if there's already a session for today
                const existingTodayIndex = prev.findIndex(s => s.date === todayString);
                if (existingTodayIndex >= 0) {
                  // Update existing session
                  const updated = [...prev];
                  updated[existingTodayIndex] = {
                    ...updated[existingTodayIndex],
                    minutes: updated[existingTodayIndex].minutes + sessionMinutes,
                    seconds: (updated[existingTodayIndex].seconds || 0) + sessionSeconds,
                    level_reached: Math.max(updated[existingTodayIndex].level_reached, highestLevel)
                  };
                  return updated;
                } else {
                  // Add new session
                  return [...prev, { date: todayString, minutes: sessionMinutes, seconds: sessionSeconds, level_reached: highestLevel }];
                }
              });

              setTotalTrainingMinutes(prev => prev + sessionMinutes);
              // totalSessionMinutes and totalSessionSeconds will be updated automatically by the useEffect
            }
          } catch (err) {
            console.warn('⚠️ Failed to call update_training_time function:', err.message);
          }
        }
      }

      console.log(`💾 Data being saved:`, dataToSave);

      // Use upsert with onConflict to specify which column to check for duplicates
      const { data: upsertData, error: updateError } = await supabase
        .from('leaderboard')
        .upsert(dataToSave, { onConflict: 'user_id' })
        .select();

      console.log(`💾 Upsert operation executed (INSERT if new, UPDATE if exists)`);

      if (updateError) {
        console.error('❌ Error upserting leaderboard:', updateError);
        console.error('❌ Error details:', JSON.stringify(updateError, null, 2));
        alert(`Failed to save to leaderboard: ${updateError.message}\n\nCheck browser console for details.`);
        throw updateError;
      }

      console.log(`✅ Leaderboard updated successfully!`);
      console.log(`✅ Data saved to database:`, upsertData);
      console.log(`✅ SUCCESS: Entry saved with level ${highestLevel} and score ${bestScore}`);

      // Verify the save by querying back
      const { data: verifyData } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', userId)
        .single();
      console.log(`✅ Verification query - data in database:`, verifyData);
      console.log(`✅ Verification: highest_level=${verifyData?.highest_level}, best_score=${verifyData?.best_score}`);
      console.log('═'.repeat(80));
    } catch (error) {
      console.error('═'.repeat(80));
      console.error('❌❌❌ LEADERBOARD UPDATE FAILED ❌❌❌');
      console.error('❌ Error updating leaderboard:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error code:', error.code);
      console.error('❌ Full error:', JSON.stringify(error, null, 2));
      console.error('═'.repeat(80));

      // For anonymous users, don't show alert - just log
      if (!isAnonymous) {
        alert(`CRITICAL ERROR: Failed to save to leaderboard!\n\n${error.message}\n\nCheck browser console for details.`);
      } else {
        console.warn('⚠️ Anonymous users need RLS policies configured. See SQL commands in documentation.');
      }
    }
  }, [user, mode]);

  // Save user progress to server (for both logged-in and anonymous users)
  const saveProgressToServer = useCallback(async (currentLevel, currentHighest, currentScore) => {
    if (!isSupabaseConfigured()) {
      return;
    }

    // Get user ID (logged-in or anonymous)
    let userId;
    if (user) {
      userId = user.id;
    } else {
      // Anonymous user - get or create ID
      let anonId = localStorage.getItem('aposner-anonymous-id');
      if (!anonId) {
        anonId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('aposner-anonymous-id', anonId);
      }
      userId = anonId;
    }

    try {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: userId,
          current_level: currentLevel,
          highest_level: currentHighest,
          best_score: currentScore,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        // Silently fail for anonymous users - they still have localStorage
        if (user) {
          console.warn('⚠️ Could not save progress to server:', error.message);
        }
      }
    } catch (error) {
      console.warn('⚠️ Error saving progress to server:', error.message);
      console.warn('⚠️ Progress is still saved in localStorage');
    }
  }, [user]);

  // Load user progress from server
  const loadProgressFromServer = useCallback(async () => {
    if (!isSupabaseConfigured() || !user) {
      console.log('⚠️ Skipping server progress load - not configured or not logged in');
      return null;
    }

    try {
      console.log('📥 Loading progress from server for user:', user.id);

      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error loading progress from server:', error);
        return null;
      }

      if (data) {
        console.log('✅ Progress loaded from server:', data);
        return data;
      } else {
        console.log('ℹ️ No progress found on server');
        return null;
      }
    } catch (error) {
      console.error('❌ Error loading progress from server:', error);
      return null;
    }
  }, [user]);

  // Save training goal to database
  const saveTrainingGoal = useCallback(async (goalMinutes) => {
    if (!isSupabaseConfigured() || !user) {
      console.log('⚠️ Skipping training goal save - not configured or not logged in');
      localStorage.setItem('trainingGoalMinutes', String(goalMinutes));
      return;
    }

    try {
      console.log('💾 Saving training goal:', goalMinutes, 'minutes');

      const { error } = await supabase
        .from('leaderboard')
        .update({ training_goal_minutes: goalMinutes })
        .eq('user_id', user.id);

      if (error) {
        console.warn('⚠️ Could not save training goal to server:', error.message);
      } else {
        console.log('✅ Training goal saved successfully');
        localStorage.setItem('trainingGoalMinutes', String(goalMinutes));
      }
    } catch (error) {
      console.warn('⚠️ Error saving training goal:', error.message);
    }
  }, [user]);

  // Load training goal and numeral settings from localStorage on mount
  useEffect(() => {
    const savedGoal = localStorage.getItem('trainingGoalMinutes');
    if (savedGoal) {
      const goalValue = parseInt(savedGoal);
      if (!isNaN(goalValue)) {
        setTrainingGoalMinutes(goalValue);
        console.log('📥 Loaded training goal from localStorage:', goalValue);
      }
    }

    // Load numeral system settings
    const chineseEnabled = localStorage.getItem('chineseNumeralsEnabled') === 'true';
    const koreanEnabled = localStorage.getItem('koreanNumeralsEnabled') === 'true';
    setChineseNumeralsEnabled(chineseEnabled);
    setKoreanNumeralsEnabled(koreanEnabled);
    console.log('📥 Loaded numeral settings - Chinese:', chineseEnabled, 'Korean:', koreanEnabled);
  }, []);

  // Play success sound on perfect score
  useEffect(() => {
    if (gameState === 'perfectScore' && soundEnabled && successAudioRef.current) {
      successAudioRef.current.play().catch(error => {
        console.log('Audio playback failed:', error);
      });
    }
  }, [gameState, soundEnabled]);

  // Play sad sound on level decrease
  useEffect(() => {
    if (gameState === 'levelDown' && soundEnabled && levelDownAudioRef.current) {
      levelDownAudioRef.current.play().catch(error => {
        console.log('Audio playback failed:', error);
      });
    }
  }, [gameState, soundEnabled]);

  // Save progress to localStorage
  const saveProgress = useCallback((newLevel, currentScore = 0) => {
    console.log('═'.repeat(80));
    console.log(`💾 💾 💾 saveProgress called 💾 💾 💾`);
    console.log(`💾 newLevel: ${newLevel}`);
    console.log(`💾 currentScore: ${currentScore}`);
    console.log(`💾 mode: ${mode}`);
    console.log(`💾 currentScore type: ${typeof currentScore}`);
    console.log(`💾 currentScore === 0: ${currentScore === 0}`);
    console.log(`💾 Percentage this represents: ${Math.round((currentScore / 32) * 100)}%`);

    try {
      localStorage.setItem('adaptivePosnerLevel', String(newLevel));
      // Verify the save worked
      const verified = localStorage.getItem('adaptivePosnerLevel');
      if (verified === String(newLevel)) {
        console.log(`✅ localStorage saved and verified: adaptivePosnerLevel=${verified}`);
      } else {
        console.error(`❌ localStorage verification FAILED! Tried to save ${newLevel}, got back ${verified}`);
      }
    } catch (e) {
      console.error(`❌ Failed to save to localStorage:`, e);
    }
    setSavedAdaptiveLevel(newLevel);

    // Update highest level if needed
    if (newLevel > highestLevel) {
      try {
        localStorage.setItem('adaptivePosnerHighest', String(newLevel));
        console.log(`📈 New highest level saved: ${newLevel}`);
      } catch (e) {
        console.error(`❌ Failed to save highest level:`, e);
      }
      setHighestLevel(newLevel);
    }

    // Save best score to localStorage
    try {
      const currentBestScore = parseInt(localStorage.getItem('adaptivePosnerBestScore') || '0');
      if (currentScore > currentBestScore) {
        localStorage.setItem('adaptivePosnerBestScore', String(currentScore));
        console.log(`🎯 New best score saved: ${currentScore} (previous: ${currentBestScore})`);
      }
    } catch (e) {
      console.error(`❌ Failed to save best score:`, e);
    }

    // Save to server
    saveProgressToServer(newLevel, highestLevel, currentScore);

    // Update leaderboard if in adaptive mode
    if (mode === 'adaptive') {
      console.log(`📤 Calling updateLeaderboard from saveProgress`);
      console.log(`📤 Passing: level=${newLevel}, score=${currentScore}`);
      console.log(`📤 User status:`, user ? `Logged in as ${user.email}` : 'NOT LOGGED IN');

      if (currentScore === 0) {
        console.warn(`⚠️⚠️⚠️ WARNING: About to save score=0 to leaderboard!`);
        console.warn(`⚠️ This may overwrite a better score. Stack trace:`);
        console.trace();
      }

      updateLeaderboard(newLevel, currentScore, responseTimes);
    } else {
      console.log(`⚠️ Not calling updateLeaderboard - mode is ${mode}, not adaptive`);
    }
    console.log('═'.repeat(80));
  }, [highestLevel, mode, updateLeaderboard, user, responseTimes, saveProgressToServer]);

  // Reset progress
  const resetProgress = () => {
    localStorage.removeItem('adaptivePosnerLevel');
    localStorage.removeItem('adaptivePosnerHighest');
    localStorage.removeItem('adaptivePosnerBestScore');
    setSavedAdaptiveLevel(1);
    setHighestLevel(1);
    setLevel(1);
  };

  // Helper function to get proper ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const getOrdinalSuffix = (num) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + 'st';
    if (j === 2 && k !== 12) return num + 'nd';
    if (j === 3 && k !== 13) return num + 'rd';
    return num + 'th';
  };

  const relationTypes = {
    // Level 1-2 tasks (Lower grade retrieval - from study)
    'same-format': 'Same Format (1-2, V-VI, 三-四) - Physical property',
    'meaning': 'Same Meaning (2-二-II) - Semantic property',

    // Level 3-4 tasks (Higher grade retrieval - from study)
    'parity-same-format': 'Both Odd or Both Even - Same Format (1-3, 一-三, I-III)',
    'parity-mixed-format': 'Both Odd or Both Even - Mixed Format (1-一, 2-II, 四-4)',

    // Experimental tasks (all other relation types)
    'whole-part': 'Whole-Part (fish-pike, world-France)',
    'antonym': 'Antonym/Opposite (dark-light, cold-warm)',
    'same-color': 'Same Color (grass-emerald, paper-snow)',
    'followup-numerical': 'Sequential Numbers (3-4, 24-25)',
    'physical-numerical': 'Sequential Number Forms (one-two, II-III, 3-4)',
    'same-time': 'Same Time (🕐-1:00, 3:30-half past three)',
    'even': 'Both Even (2-4, IV-VIII, two-six)',
    'odd': 'Both Odd (3-5, VII-IX, three-nine)',
    'doubled': 'Doubled (2-4, II-IV, two-four)',
    'tripled': 'Tripled (3-9, III-IX, three-nine)'
  };

  // Get available relation types for a given level based on study design
  // Study used 4 levels of Posner tasks
  const getRelationTypesForLevel = (level, mode, experimentalEnabled) => {
    // In experimental mode or manual mode, all relation types are available
    if (experimentalEnabled || mode === 'manual') {
      return Object.keys(relationTypes);
    }

    // In standard adaptive mode, use all 4 Posner task levels:
    // Level 1: Physical property (same format)
    // Level 2: Semantic property (same meaning)
    // Level 3: Conceptual (parity - same format)
    // Level 4: Conceptual (parity - mixed format)
    if (mode === 'adaptive') {
      return ['same-format', 'meaning', 'parity-same-format', 'parity-mixed-format'];
    }

    // Default: all types
    return Object.keys(relationTypes);
  };

  const wordPairs = {
    // Level 1-2 tasks from study (using numbers 1-9 in different formats)
    'same-format': [
      // Arabic-Arabic pairs
      ['1', '2'], ['3', '4'], ['5', '6'], ['7', '8'], ['1', '9'],
      ['2', '3'], ['4', '5'], ['6', '7'], ['8', '9'], ['1', '3'],
      ['2', '4'], ['3', '5'], ['4', '6'], ['5', '7'], ['6', '8'],
      ['7', '9'], ['1', '4'], ['2', '5'], ['3', '6'], ['4', '7'],

      // Chinese-Chinese pairs (一~九)
      ['一', '二'], ['三', '四'], ['五', '六'], ['七', '八'], ['一', '九'],
      ['二', '三'], ['四', '五'], ['六', '七'], ['八', '九'], ['一', '三'],
      ['二', '四'], ['三', '五'], ['四', '六'], ['五', '七'], ['六', '八'],
      ['七', '九'], ['一', '四'], ['二', '五'], ['三', '六'], ['四', '七'],

      // Sino-Korean pairs (일~구)
      ['일', '이'], ['삼', '사'], ['오', '육'], ['칠', '팔'], ['일', '구'],
      ['이', '삼'], ['사', '오'], ['육', '칠'], ['팔', '구'], ['일', '삼'],
      ['이', '사'], ['삼', '오'], ['사', '육'], ['오', '칠'], ['육', '팔'],
      ['칠', '구'], ['일', '사'], ['이', '오'], ['삼', '육'], ['사', '칠'],

      // Roman-Roman pairs (I-IX)
      ['I', 'II'], ['III', 'IV'], ['V', 'VI'], ['VII', 'VIII'], ['I', 'IX'],
      ['II', 'III'], ['IV', 'V'], ['VI', 'VII'], ['VIII', 'IX'], ['I', 'III'],
      ['II', 'IV'], ['III', 'V'], ['IV', 'VI'], ['V', 'VII'], ['VI', 'VIII'],
      ['VII', 'IX'], ['I', 'IV'], ['II', 'V'], ['III', 'VI'], ['IV', 'VII'],

      // Verbal-Verbal pairs (English number words)
      ['one', 'two'], ['two', 'three'], ['three', 'four'], ['four', 'five'], ['five', 'six'],
      ['six', 'seven'], ['seven', 'eight'], ['eight', 'nine'], ['one', 'three'], ['two', 'four'],
      ['three', 'five'], ['four', 'six'], ['five', 'seven'], ['six', 'eight'], ['seven', 'nine'],
      ['one', 'four'], ['two', 'five'], ['three', 'six'], ['four', 'seven'], ['five', 'eight'],
      ['eleven', 'twelve'], ['twelve', 'thirteen'], ['thirteen', 'fourteen'], ['fourteen', 'fifteen'],
      ['fifteen', 'sixteen'], ['sixteen', 'seventeen'], ['seventeen', 'eighteen'], ['eighteen', 'nineteen'],
      ['twenty', 'twenty-one'], ['twenty-one', 'twenty-two'], ['twenty-two', 'twenty-three'],
      ['twenty-three', 'twenty-four'], ['twenty-four', 'twenty-five'], ['twenty-five', 'twenty-six'],
      ['twenty-six', 'twenty-seven'], ['twenty-seven', 'twenty-eight'], ['twenty-eight', 'twenty-nine'],
      ['thirty', 'thirty-one'], ['thirty-one', 'thirty-two'], ['thirty-two', 'thirty-three'],
      ['thirty-three', 'thirty-four'], ['thirty-four', 'thirty-five'], ['thirty-five', 'thirty-six']
    ],

    'meaning': [
      // Same meaning across different formats
      ['1', '一'], ['2', '二'], ['3', '三'], ['4', '四'], ['5', '五'],
      ['6', '六'], ['7', '七'], ['8', '八'], ['9', '九'],
      ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V'],
      ['6', 'VI'], ['7', 'VII'], ['8', 'VIII'], ['9', 'IX'],
      ['일', '一'], ['이', '二'], ['삼', '三'], ['사', '四'], ['오', '五'],
      ['육', '六'], ['칠', '七'], ['팔', '八'], ['구', '九'],
      ['1', '일'], ['2', '이'], ['3', '삼'], ['4', '사'], ['5', '오'],
      ['6', '육'], ['7', '칠'], ['8', '팔'], ['9', '구'],
      ['일', 'I'], ['이', 'II'], ['삼', 'III'], ['사', 'IV'], ['오', 'V'],
      ['육', 'VI'], ['칠', 'VII'], ['팔', 'VIII'], ['구', 'IX'],
      ['一', 'I'], ['二', 'II'], ['三', 'III'], ['四', 'IV'], ['五', 'V'],
      ['六', 'VI'], ['七', 'VII'], ['八', 'VIII'], ['九', 'IX'],

      // Matching numbers in same format
      ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
      ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
      ['일', '일'], ['이', '이'], ['삼', '삼'], ['사', '사'], ['오', '오'],
      ['육', '육'], ['칠', '칠'], ['팔', '팔'], ['구', '구'],
      ['一', '一'], ['二', '二'], ['三', '三'], ['四', '四'], ['五', '五'],
      ['六', '六'], ['七', '七'], ['八', '八'], ['九', '九'],
      ['I', 'I'], ['II', 'II'], ['III', 'III'], ['IV', 'IV'], ['V', 'V'],
      ['VI', 'VI'], ['VII', 'VII'], ['VIII', 'VIII'], ['IX', 'IX']
    ],

    // Level 3 task: Parity judgment - same format
    'parity-same-format': [
      // Both odd - Arabic
      ['1', '3'], ['3', '5'], ['5', '7'], ['7', '9'], ['1', '5'],
      ['1', '7'], ['1', '9'], ['3', '7'], ['3', '9'], ['5', '9'],
      // Both even - Arabic
      ['2', '4'], ['4', '6'], ['6', '8'], ['2', '6'], ['2', '8'],
      ['4', '8'],

      // Both odd - Chinese
      ['일', '삼'], ['삼', '오'], ['오', '칠'], ['칠', '구'], ['일', '오'],
      ['일', '칠'], ['일', '구'], ['삼', '칠'], ['삼', '구'], ['오', '구'],
      // Both even - Korean
      ['이', '사'], ['사', '육'], ['육', '팔'], ['이', '육'], ['이', '팔'],
      ['사', '팔'],

      // Both odd - Chinese
      ['一', '三'], ['三', '五'], ['五', '七'], ['七', '九'], ['一', '五'],
      ['一', '七'], ['一', '九'], ['三', '七'], ['三', '九'], ['五', '九'],
      // Both even - Chinese
      ['二', '四'], ['四', '六'], ['六', '八'], ['二', '六'], ['二', '八'],
      ['四', '八'],

      // Both odd - Roman
      ['I', 'III'], ['III', 'V'], ['V', 'VII'], ['VII', 'IX'], ['I', 'V'],
      ['I', 'VII'], ['I', 'IX'], ['III', 'VII'], ['III', 'IX'], ['V', 'IX'],
      // Both even - Roman
      ['II', 'IV'], ['IV', 'VI'], ['VI', 'VIII'], ['II', 'VI'], ['II', 'VIII'],
      ['IV', 'VIII']
    ],

    // Level 4 task: Parity judgment - mixed format
    'parity-mixed-format': [
      // Both odd - Arabic-Chinese
      ['1', '三'], ['3', '五'], ['5', '七'], ['7', '九'], ['1', '五'],
      ['3', '一'], ['5', '三'], ['7', '五'], ['9', '七'], ['9', '一'],
      // Both even - Arabic-Chinese
      ['2', '四'], ['4', '六'], ['6', '八'], ['2', '六'], ['4', '二'],
      ['6', '四'], ['8', '六'], ['8', '二'],

      // Both odd - Arabic-Korean
      ['1', '삼'], ['3', '오'], ['5', '칠'], ['7', '구'], ['1', '오'],
      ['3', '일'], ['5', '삼'], ['7', '오'], ['9', '칠'], ['9', '일'],
      // Both even - Arabic-Korean
      ['2', '사'], ['4', '육'], ['6', '팔'], ['2', '육'], ['4', '이'],
      ['6', '사'], ['8', '육'], ['8', '이'],

      // Both odd - Korean-Chinese
      ['일', '三'], ['삼', '五'], ['오', '七'], ['칠', '九'], ['일', '五'],
      ['삼', '一'], ['오', '三'], ['칠', '五'], ['구', '七'], ['구', '一'],
      // Both even - Korean-Chinese
      ['이', '四'], ['사', '六'], ['육', '八'], ['이', '六'], ['사', '二'],
      ['육', '四'], ['팔', '六'], ['팔', '二'],

      // Both odd - Arabic-Roman
      ['1', 'III'], ['3', 'V'], ['5', 'VII'], ['7', 'IX'], ['1', 'V'],
      ['3', 'I'], ['5', 'III'], ['7', 'V'], ['9', 'VII'], ['9', 'I'],
      // Both even - Arabic-Roman
      ['2', 'IV'], ['4', 'VI'], ['6', 'VIII'], ['2', 'VI'], ['4', 'II'],
      ['6', 'IV'], ['8', 'VI'], ['8', 'II'],

      // Both odd - Korean-Roman
      ['일', 'III'], ['삼', 'V'], ['오', 'VII'], ['칠', 'IX'], ['일', 'V'],
      ['삼', 'I'], ['오', 'III'], ['칠', 'V'], ['구', 'VII'], ['구', 'I'],
      // Both even - Korean-Roman
      ['이', 'IV'], ['사', 'VI'], ['육', 'VIII'], ['이', 'VI'], ['사', 'II'],
      ['육', 'IV'], ['팔', 'VI'], ['팔', 'II'],

      // Both odd - Chinese-Roman
      ['一', 'III'], ['三', 'V'], ['五', 'VII'], ['七', 'IX'], ['一', 'V'],
      ['三', 'I'], ['五', 'III'], ['七', 'V'], ['九', 'VII'], ['九', 'I'],
      // Both even - Chinese-Roman
      ['二', 'IV'], ['四', 'VI'], ['六', 'VIII'], ['二', 'VI'], ['四', 'II'],
      ['六', 'IV'], ['八', 'VI'], ['八', 'II']
    ],

    'whole-part': [
      ['animal', 'dog'], ['tree', 'oak'], ['fish', 'salmon'], ['bird', 'eagle'], ['flower', 'rose'],
      ['vehicle', 'car'], ['fruit', 'apple'], ['furniture', 'chair'], ['building', 'house'], ['color', 'red'],
      ['emotion', 'joy'], ['body', 'hand'], ['continent', 'Europe'], ['ocean', 'Atlantic'], ['mountain', 'Alps'],
      ['country', 'France'], ['city', 'Paris'], ['instrument', 'guitar'], ['sport', 'soccer'], ['book', 'novel'],
      ['food', 'bread'], ['drink', 'water'], ['clothing', 'shirt'], ['planet', 'Earth'], ['star', 'Sun'],
      ['metal', 'gold'], ['gem', 'diamond'], ['season', 'winter'], ['month', 'January'], ['day', 'Monday'],
      ['meal', 'dinner'], ['room', 'kitchen'], ['tool', 'hammer'], ['weapon', 'sword'], ['plant', 'cactus'],
      ['insect', 'bee'], ['mammal', 'whale'], ['reptile', 'snake'], ['vegetable', 'carrot'], ['grain', 'wheat'],
      ['liquid', 'oil'], ['gas', 'oxygen'], ['disease', 'flu'], ['medicine', 'aspirin'], ['science', 'physics'],
      ['art', 'painting'], ['music', 'jazz'], ['language', 'English'], ['religion', 'Buddhism'], ['world', 'Asia'],
      ['government', 'democracy'], ['economy', 'capitalism'], ['weather', 'rain'], ['disaster', 'earthquake'], ['landform', 'valley'],
      ['water body', 'lake'], ['ecosystem', 'forest'], ['biome', 'desert'], ['climate', 'tropical'], ['precipitation', 'snow'],
      ['furniture', 'table'], ['appliance', 'fridge'], ['utensil', 'spoon'], ['container', 'box'], ['structure', 'bridge'],
      ['material', 'wood'], ['fabric', 'cotton'], ['shape', 'circle'], ['number', 'seven'], ['letter', 'A'],
      ['animal', 'cat'], ['animal', 'horse'], ['animal', 'lion'], ['animal', 'tiger'], ['animal', 'elephant'],
      ['tree', 'pine'], ['tree', 'maple'], ['tree', 'birch'], ['tree', 'willow'], ['tree', 'cedar'],
      ['fish', 'tuna'], ['fish', 'trout'], ['fish', 'bass'], ['fish', 'cod'], ['fish', 'shark'],
      ['bird', 'sparrow'], ['bird', 'robin'], ['bird', 'hawk'], ['bird', 'owl'], ['bird', 'penguin'],
      ['flower', 'tulip'], ['flower', 'lily'], ['flower', 'daisy'], ['flower', 'orchid'], ['flower', 'sunflower'],
      ['vehicle', 'truck'], ['vehicle', 'bus'], ['vehicle', 'train'], ['vehicle', 'plane'], ['vehicle', 'boat'],
      ['fruit', 'orange'], ['fruit', 'banana'], ['fruit', 'grape'], ['fruit', 'strawberry'], ['fruit', 'mango'],
      ['furniture', 'sofa'], ['furniture', 'desk'], ['furniture', 'bed'], ['furniture', 'cabinet'], ['furniture', 'shelf'],
      ['building', 'tower'], ['building', 'castle'], ['building', 'temple'], ['building', 'church'], ['building', 'mosque'],
      ['color', 'blue'], ['color', 'green'], ['color', 'yellow'], ['color', 'purple'], ['color', 'orange'],
      ['emotion', 'anger'], ['emotion', 'fear'], ['emotion', 'surprise'], ['emotion', 'disgust'], ['emotion', 'sadness'],
      ['body', 'foot'], ['body', 'head'], ['body', 'arm'], ['body', 'leg'], ['body', 'heart'],
      ['continent', 'Africa'], ['continent', 'Asia'], ['continent', 'America'], ['continent', 'Australia'], ['continent', 'Antarctica'],
      ['ocean', 'Pacific'], ['ocean', 'Indian'], ['ocean', 'Arctic'], ['ocean', 'Southern'], ['ocean', 'Atlantic'],
      ['mountain', 'Everest'], ['mountain', 'Kilimanjaro'], ['mountain', 'Rockies'], ['mountain', 'Andes'], ['mountain', 'Himalayas'],
      ['country', 'Germany'], ['country', 'Japan'], ['country', 'Brazil'], ['country', 'India'], ['country', 'China'],
      ['city', 'London'], ['city', 'Tokyo'], ['city', 'Rome'], ['city', 'Berlin'], ['city', 'Madrid'],
      ['instrument', 'piano'], ['instrument', 'violin'], ['instrument', 'drums'], ['instrument', 'flute'], ['instrument', 'trumpet'],
      ['sport', 'tennis'], ['sport', 'basketball'], ['sport', 'baseball'], ['sport', 'hockey'], ['sport', 'golf'],
      ['book', 'dictionary'], ['book', 'textbook'], ['book', 'magazine'], ['book', 'encyclopedia'], ['book', 'journal'],
      ['food', 'rice'], ['food', 'pasta'], ['food', 'pizza'], ['food', 'salad'], ['food', 'soup'],
      ['drink', 'juice'], ['drink', 'milk'], ['drink', 'tea'], ['drink', 'coffee'], ['drink', 'soda'],
      ['clothing', 'pants'], ['clothing', 'dress'], ['clothing', 'jacket'], ['clothing', 'shoes'], ['clothing', 'hat'],
      ['planet', 'Mars'], ['planet', 'Jupiter'], ['planet', 'Venus'], ['planet', 'Saturn'], ['planet', 'Mercury'],
      ['star', 'Sirius'], ['star', 'Polaris'], ['star', 'Vega'], ['star', 'Betelgeuse'], ['star', 'Rigel'],
      ['metal', 'silver'], ['metal', 'copper'], ['metal', 'iron'], ['metal', 'platinum'], ['metal', 'aluminum'],
      ['gem', 'ruby'], ['gem', 'emerald'], ['gem', 'sapphire'], ['gem', 'topaz'], ['gem', 'pearl'],
      ['season', 'spring'], ['season', 'summer'], ['season', 'autumn'], ['season', 'fall'], ['season', 'winter'],
      ['month', 'February'], ['month', 'March'], ['month', 'April'], ['month', 'May'], ['month', 'June'],
      ['day', 'Tuesday'], ['day', 'Wednesday'], ['day', 'Thursday'], ['day', 'Friday'], ['day', 'Saturday'],
      ['meal', 'breakfast'], ['meal', 'lunch'], ['meal', 'brunch'], ['meal', 'snack'], ['meal', 'supper'],
      ['room', 'bedroom'], ['room', 'bathroom'], ['room', 'living room'], ['room', 'dining room'], ['room', 'office'],
      ['tool', 'screwdriver'], ['tool', 'wrench'], ['tool', 'saw'], ['tool', 'drill'], ['tool', 'pliers'],
      ['weapon', 'gun'], ['weapon', 'knife'], ['weapon', 'bow'], ['weapon', 'spear'], ['weapon', 'axe'],
      ['plant', 'fern'], ['plant', 'moss'], ['plant', 'vine'], ['plant', 'shrub'], ['plant', 'bush'],
      ['insect', 'ant'], ['insect', 'butterfly'], ['insect', 'beetle'], ['insect', 'fly'], ['insect', 'mosquito'],
      ['mammal', 'dolphin'], ['mammal', 'bear'], ['mammal', 'wolf'], ['mammal', 'deer'], ['mammal', 'rabbit'],
      ['reptile', 'lizard'], ['reptile', 'turtle'], ['reptile', 'crocodile'], ['reptile', 'iguana'], ['reptile', 'gecko'],
      ['vegetable', 'potato'], ['vegetable', 'tomato'], ['vegetable', 'onion'], ['vegetable', 'lettuce'], ['vegetable', 'broccoli'],
      ['grain', 'rice'], ['grain', 'corn'], ['grain', 'barley'], ['grain', 'oats'], ['grain', 'rye'],
      ['liquid', 'water'], ['liquid', 'milk'], ['liquid', 'juice'], ['liquid', 'alcohol'], ['liquid', 'gasoline'],
      ['gas', 'nitrogen'], ['gas', 'hydrogen'], ['gas', 'helium'], ['gas', 'carbon dioxide'], ['gas', 'methane'],
      ['disease', 'cold'], ['disease', 'cancer'], ['disease', 'diabetes'], ['disease', 'malaria'], ['disease', 'asthma'],
      ['medicine', 'ibuprofen'], ['medicine', 'antibiotic'], ['medicine', 'vaccine'], ['medicine', 'painkiller'], ['medicine', 'insulin'],
      ['science', 'chemistry'], ['science', 'biology'], ['science', 'astronomy'], ['science', 'geology'], ['science', 'mathematics'],
      ['art', 'sculpture'], ['art', 'drawing'], ['art', 'photography'], ['art', 'architecture'], ['art', 'pottery'],
      ['music', 'rock'], ['music', 'classical'], ['music', 'pop'], ['music', 'blues'], ['music', 'hip-hop'],
      ['language', 'Spanish'], ['language', 'French'], ['language', 'German'], ['language', 'Chinese'], ['language', 'Arabic'],
      ['religion', 'Christianity'], ['religion', 'Islam'], ['religion', 'Hinduism'], ['religion', 'Judaism'], ['religion', 'Sikhism'],
      ['government', 'monarchy'], ['government', 'republic'], ['government', 'dictatorship'], ['government', 'federation'], ['government', 'oligarchy'],
      ['economy', 'socialism'], ['economy', 'communism'], ['economy', 'mixed economy'], ['economy', 'market economy'], ['economy', 'feudalism'],
      ['weather', 'snow'], ['weather', 'hail'], ['weather', 'fog'], ['weather', 'thunder'], ['weather', 'wind'],
      ['disaster', 'flood'], ['disaster', 'hurricane'], ['disaster', 'tornado'], ['disaster', 'tsunami'], ['disaster', 'wildfire'],
      ['landform', 'plateau'], ['landform', 'canyon'], ['landform', 'plain'], ['landform', 'hill'], ['landform', 'mountain'],
      ['water body', 'river'], ['water body', 'ocean'], ['water body', 'pond'], ['water body', 'stream'], ['water body', 'bay'],
      ['ecosystem', 'rainforest'], ['ecosystem', 'tundra'], ['ecosystem', 'savanna'], ['ecosystem', 'wetland'], ['ecosystem', 'coral reef'],
      ['biome', 'grassland'], ['biome', 'tundra'], ['biome', 'taiga'], ['biome', 'chaparral'], ['biome', 'temperate forest'],
      ['climate', 'arctic'], ['climate', 'temperate'], ['climate', 'arid'], ['climate', 'mediterranean'], ['climate', 'continental'],
      ['precipitation', 'rain'], ['precipitation', 'sleet'], ['precipitation', 'hail'], ['precipitation', 'drizzle'], ['precipitation', 'frost'],
      ['appliance', 'oven'], ['appliance', 'microwave'], ['appliance', 'dishwasher'], ['appliance', 'washer'], ['appliance', 'dryer'],
      ['utensil', 'fork'], ['utensil', 'knife'], ['utensil', 'spatula'], ['utensil', 'ladle'], ['utensil', 'whisk'],
      ['container', 'jar'], ['container', 'bottle'], ['container', 'can'], ['container', 'barrel'], ['container', 'crate'],
      ['structure', 'dam'], ['structure', 'tunnel'], ['structure', 'skyscraper'], ['structure', 'monument'], ['structure', 'pier'],
      ['material', 'plastic'], ['material', 'metal'], ['material', 'glass'], ['material', 'concrete'], ['material', 'stone'],
      ['fabric', 'silk'], ['fabric', 'wool'], ['fabric', 'linen'], ['fabric', 'denim'], ['fabric', 'velvet'],
      ['shape', 'square'], ['shape', 'triangle'], ['shape', 'rectangle'], ['shape', 'pentagon'], ['shape', 'hexagon'],
      ['number', 'one'], ['number', 'two'], ['number', 'three'], ['number', 'four'], ['number', 'five'],
      ['letter', 'B'], ['letter', 'C'], ['letter', 'D'], ['letter', 'E'], ['letter', 'F'],
      ['animal', 'fox'], ['animal', 'giraffe'], ['animal', 'zebra'], ['animal', 'kangaroo'], ['animal', 'koala'],
      ['animal', 'panda'], ['animal', 'gorilla'], ['animal', 'chimpanzee'], ['animal', 'orangutan'], ['animal', 'rhino'],
      ['animal', 'hippo'], ['animal', 'camel'], ['animal', 'llama'], ['animal', 'alpaca'], ['animal', 'buffalo'],
      ['tree', 'palm'], ['tree', 'bamboo'], ['tree', 'redwood'], ['tree', 'sequoia'], ['tree', 'spruce'],
      ['tree', 'fir'], ['tree', 'elm'], ['tree', 'ash'], ['tree', 'beech'], ['tree', 'cypress'],
      ['fish', 'goldfish'], ['fish', 'catfish'], ['fish', 'swordfish'], ['fish', 'marlin'], ['fish', 'barracuda'],
      ['fish', 'eel'], ['fish', 'ray'], ['fish', 'herring'], ['fish', 'anchovy'], ['fish', 'mackerel'],
      ['bird', 'swan'], ['bird', 'duck'], ['bird', 'goose'], ['bird', 'flamingo'], ['bird', 'parrot'],
      ['bird', 'peacock'], ['bird', 'crow'], ['bird', 'raven'], ['bird', 'pigeon'], ['bird', 'seagull'],
      ['flower', 'carnation'], ['flower', 'daffodil'], ['flower', 'peony'], ['flower', 'iris'], ['flower', 'violet'],
      ['flower', 'jasmine'], ['flower', 'marigold'], ['flower', 'hibiscus'], ['flower', 'lavender'], ['flower', 'chrysanthemum'],
      ['vehicle', 'bicycle'], ['vehicle', 'motorcycle'], ['vehicle', 'helicopter'], ['vehicle', 'submarine'], ['vehicle', 'yacht'],
      ['vehicle', 'scooter'], ['vehicle', 'tram'], ['vehicle', 'wagon'], ['vehicle', 'ambulance'], ['vehicle', 'taxi'],
      ['fruit', 'pineapple'], ['fruit', 'watermelon'], ['fruit', 'peach'], ['fruit', 'pear'], ['fruit', 'plum'],
      ['fruit', 'cherry'], ['fruit', 'kiwi'], ['fruit', 'papaya'], ['fruit', 'coconut'], ['fruit', 'lemon'],
      ['furniture', 'bench'], ['furniture', 'stool'], ['furniture', 'couch'], ['furniture', 'dresser'], ['furniture', 'bookshelf'],
      ['furniture', 'wardrobe'], ['furniture', 'nightstand'], ['furniture', 'armchair'], ['furniture', 'recliner'], ['furniture', 'ottoman'],
      ['building', 'palace'], ['building', 'cathedral'], ['building', 'monastery'], ['building', 'fort'], ['building', 'lighthouse'],
      ['building', 'barn'], ['building', 'shed'], ['building', 'garage'], ['building', 'warehouse'], ['building', 'factory'],
      ['color', 'pink'], ['color', 'brown'], ['color', 'gray'], ['color', 'black'], ['color', 'white'],
      ['color', 'violet'], ['color', 'indigo'], ['color', 'turquoise'], ['color', 'maroon'], ['color', 'navy'],
      ['emotion', 'love'], ['emotion', 'hate'], ['emotion', 'envy'], ['emotion', 'pride'], ['emotion', 'shame'],
      ['emotion', 'guilt'], ['emotion', 'anxiety'], ['emotion', 'relief'], ['emotion', 'hope'], ['emotion', 'despair'],
      ['body', 'eye'], ['body', 'ear'], ['body', 'nose'], ['body', 'mouth'], ['body', 'tongue'],
      ['body', 'teeth'], ['body', 'brain'], ['body', 'lung'], ['body', 'stomach'], ['body', 'liver'],
      ['country', 'Italy'], ['country', 'Spain'], ['country', 'Canada'], ['country', 'Mexico'], ['country', 'Russia'],
      ['country', 'Australia'], ['country', 'Egypt'], ['country', 'Nigeria'], ['country', 'Korea'], ['country', 'Thailand'],
      ['city', 'New York'], ['city', 'Los Angeles'], ['city', 'Chicago'], ['city', 'Moscow'], ['city', 'Beijing'],
      ['city', 'Delhi'], ['city', 'Mumbai'], ['city', 'Sydney'], ['city', 'Dubai'], ['city', 'Singapore'],
      ['instrument', 'saxophone'], ['instrument', 'clarinet'], ['instrument', 'trombone'], ['instrument', 'tuba'], ['instrument', 'harp'],
      ['instrument', 'banjo'], ['instrument', 'ukulele'], ['instrument', 'accordion'], ['instrument', 'harmonica'], ['instrument', 'xylophone'],
      ['sport', 'cricket'], ['sport', 'rugby'], ['sport', 'volleyball'], ['sport', 'badminton'], ['sport', 'swimming'],
      ['sport', 'boxing'], ['sport', 'wrestling'], ['sport', 'fencing'], ['sport', 'archery'], ['sport', 'skiing'],
      ['book', 'atlas'], ['book', 'almanac'], ['book', 'biography'], ['book', 'autobiography'], ['book', 'memoir'],
      ['book', 'thriller'], ['book', 'mystery'], ['book', 'romance'], ['book', 'fantasy'], ['book', 'sci-fi'],
      ['food', 'burger'], ['food', 'sandwich'], ['food', 'taco'], ['food', 'sushi'], ['food', 'curry'],
      ['food', 'steak'], ['food', 'chicken'], ['food', 'fish'], ['food', 'noodles'], ['food', 'dumpling'],
      ['drink', 'wine'], ['drink', 'beer'], ['drink', 'cocktail'], ['drink', 'smoothie'], ['drink', 'lemonade'],
      ['drink', 'cocoa'], ['drink', 'espresso'], ['drink', 'cappuccino'], ['drink', 'milkshake'], ['drink', 'cider'],
      ['clothing', 'coat'], ['clothing', 'sweater'], ['clothing', 'skirt'], ['clothing', 'tie'], ['clothing', 'scarf'],
      ['clothing', 'gloves'], ['clothing', 'socks'], ['clothing', 'boots'], ['clothing', 'sandals'], ['clothing', 'belt'],
      ['planet', 'Uranus'], ['planet', 'Neptune'], ['planet', 'Pluto'], ['dwarf planet', 'Ceres'], ['dwarf planet', 'Eris'],
      ['star', 'Antares'], ['star', 'Aldebaran'], ['star', 'Altair'], ['star', 'Deneb'], ['star', 'Spica'],
      ['metal', 'bronze'], ['metal', 'brass'], ['metal', 'steel'], ['metal', 'titanium'], ['metal', 'zinc'],
      ['metal', 'tin'], ['metal', 'lead'], ['metal', 'mercury'], ['metal', 'nickel'], ['metal', 'cobalt'],
      ['gem', 'amethyst'], ['gem', 'garnet'], ['gem', 'opal'], ['gem', 'turquoise'], ['gem', 'jade'],
      ['gem', 'onyx'], ['gem', 'quartz'], ['gem', 'agate'], ['gem', 'coral'], ['gem', 'amber'],
      ['month', 'July'], ['month', 'August'], ['month', 'September'], ['month', 'October'], ['month', 'November'],
      ['month', 'December'], ['day', 'Sunday'], ['meal', 'appetizer'], ['meal', 'dessert'], ['meal', 'teatime'],
      ['room', 'attic'], ['room', 'basement'], ['room', 'garage'], ['room', 'laundry room'], ['room', 'study'],
      ['room', 'library'], ['room', 'pantry'], ['room', 'closet'], ['room', 'hallway'], ['room', 'balcony'],
      ['tool', 'chisel'], ['tool', 'file'], ['tool', 'vise'], ['tool', 'clamp'], ['tool', 'level'],
      ['tool', 'rake'], ['tool', 'shovel'], ['tool', 'hoe'], ['tool', 'pickaxe'], ['tool', 'crowbar'],
      ['weapon', 'dagger'], ['weapon', 'lance'], ['weapon', 'mace'], ['weapon', 'crossbow'], ['weapon', 'cannon'],
      ['weapon', 'grenade'], ['weapon', 'missile'], ['weapon', 'rifle'], ['weapon', 'pistol'], ['weapon', 'club'],
      ['plant', 'grass'], ['plant', 'weed'], ['plant', 'algae'], ['plant', 'fungus'], ['plant', 'lichen'],
      ['plant', 'seaweed'], ['plant', 'bamboo'], ['plant', 'ivy'], ['plant', 'orchid'], ['plant', 'bamboo'],
      ['insect', 'wasp'], ['insect', 'hornet'], ['insect', 'cricket'], ['insect', 'grasshopper'], ['insect', 'dragonfly'],
      ['insect', 'ladybug'], ['insect', 'termite'], ['insect', 'cockroach'], ['insect', 'flea'], ['insect', 'tick'],
      ['mammal', 'monkey'], ['mammal', 'ape'], ['mammal', 'bat'], ['mammal', 'seal'], ['mammal', 'walrus'],
      ['mammal', 'otter'], ['mammal', 'beaver'], ['mammal', 'squirrel'], ['mammal', 'rat'], ['mammal', 'mouse'],
      ['reptile', 'alligator'], ['reptile', 'python'], ['reptile', 'cobra'], ['reptile', 'viper'], ['reptile', 'rattlesnake'],
      ['reptile', 'chameleon'], ['reptile', 'komodo'], ['amphibian', 'frog'], ['amphibian', 'toad'], ['amphibian', 'salamander'],
      ['vegetable', 'cucumber'], ['vegetable', 'pepper'], ['vegetable', 'eggplant'], ['vegetable', 'spinach'], ['vegetable', 'cabbage'],
      ['vegetable', 'cauliflower'], ['vegetable', 'celery'], ['vegetable', 'asparagus'], ['vegetable', 'radish'], ['vegetable', 'beet'],
      ['grain', 'millet'], ['grain', 'quinoa'], ['grain', 'sorghum'], ['grain', 'buckwheat'], ['cereal', 'oatmeal'],
      ['liquid', 'vinegar'], ['liquid', 'syrup'], ['liquid', 'honey'], ['liquid', 'blood'], ['liquid', 'mercury'],
      ['gas', 'neon'], ['gas', 'argon'], ['gas', 'xenon'], ['gas', 'chlorine'], ['gas', 'fluorine'],
      ['disease', 'measles'], ['disease', 'mumps'], ['disease', 'chickenpox'], ['disease', 'pneumonia'], ['disease', 'tuberculosis'],
      ['disease', 'hepatitis'], ['disease', 'cholera'], ['disease', 'typhoid'], ['disease', 'plague'], ['disease', 'leprosy'],
      ['medicine', 'penicillin'], ['medicine', 'morphine'], ['medicine', 'quinine'], ['medicine', 'cortisone'], ['medicine', 'antacid'],
      ['science', 'zoology'], ['science', 'botany'], ['science', 'ecology'], ['science', 'psychology'], ['science', 'sociology'],
      ['art', 'mosaic'], ['art', 'fresco'], ['art', 'collage'], ['art', 'graffiti'], ['art', 'illustration'],
      ['music', 'country'], ['music', 'folk'], ['music', 'gospel'], ['music', 'reggae'], ['music', 'funk'],
      ['music', 'soul'], ['music', 'punk'], ['music', 'metal'], ['music', 'techno'], ['music', 'house'],
      ['language', 'Italian'], ['language', 'Portuguese'], ['language', 'Russian'], ['language', 'Japanese'], ['language', 'Korean'],
      ['language', 'Hindi'], ['language', 'Bengali'], ['language', 'Turkish'], ['language', 'Persian'], ['language', 'Hebrew'],
      ['religion', 'Jainism'], ['religion', 'Shinto'], ['religion', 'Taoism'], ['religion', 'Confucianism'], ['religion', 'Zoroastrianism'],
      ['government', 'theocracy'], ['government', 'autocracy'], ['government', 'aristocracy'], ['government', 'meritocracy'], ['government', 'plutocracy'],
      ['weather', 'drizzle'], ['weather', 'sleet'], ['weather', 'blizzard'], ['weather', 'storm'], ['weather', 'typhoon'],
      ['disaster', 'avalanche'], ['disaster', 'landslide'], ['disaster', 'drought'], ['disaster', 'famine'], ['disaster', 'plague'],
      ['landform', 'cliff'], ['landform', 'cave'], ['landform', 'gorge'], ['landform', 'mesa'], ['landform', 'butte'],
      ['landform', 'delta'], ['landform', 'peninsula'], ['landform', 'island'], ['landform', 'archipelago'], ['landform', 'dune'],
      ['water body', 'sea'], ['water body', 'gulf'], ['water body', 'strait'], ['water body', 'canal'], ['water body', 'reservoir'],
      ['water body', 'lagoon'], ['water body', 'marsh'], ['water body', 'swamp'], ['water body', 'creek'], ['water body', 'fjord'],
      ['ecosystem', 'mangrove'], ['ecosystem', 'prairie'], ['ecosystem', 'steppe'], ['ecosystem', 'taiga'], ['ecosystem', 'jungle'],
      ['biome', 'rainforest'], ['biome', 'savanna'], ['biome', 'marsh'], ['climate', 'subtropical'], ['climate', 'subarctic'],
      ['climate', 'polar'], ['climate', 'oceanic'], ['climate', 'monsoon'], ['precipitation', 'mist'], ['precipitation', 'dew'],
      ['appliance', 'toaster'], ['appliance', 'blender'], ['appliance', 'mixer'], ['appliance', 'kettle'], ['appliance', 'iron'],
      ['appliance', 'vacuum'], ['appliance', 'fan'], ['appliance', 'heater'], ['appliance', 'air conditioner'], ['appliance', 'freezer'],
      ['utensil', 'tongs'], ['utensil', 'peeler'], ['utensil', 'grater'], ['utensil', 'masher'], ['utensil', 'strainer'],
      ['utensil', 'colander'], ['utensil', 'mortar'], ['utensil', 'pestle'], ['utensil', 'rolling pin'], ['utensil', 'cleaver'],
      ['container', 'bucket'], ['container', 'basket'], ['container', 'bag'], ['container', 'sack'], ['container', 'pouch'],
      ['container', 'chest'], ['container', 'trunk'], ['container', 'case'], ['container', 'carton'], ['container', 'vase'],
      ['structure', 'tower'], ['structure', 'pyramid'], ['structure', 'arch'], ['structure', 'dome'], ['structure', 'spire'],
      ['structure', 'aqueduct'], ['structure', 'viaduct'], ['structure', 'fortress'], ['structure', 'bunker'], ['structure', 'wall'],
      ['material', 'rubber'], ['material', 'leather'], ['material', 'paper'], ['material', 'cardboard'], ['material', 'ceramic'],
      ['material', 'porcelain'], ['material', 'clay'], ['material', 'marble'], ['material', 'granite'], ['material', 'limestone'],
      ['fabric', 'polyester'], ['fabric', 'nylon'], ['fabric', 'spandex'], ['fabric', 'fleece'], ['fabric', 'satin'],
      ['fabric', 'chiffon'], ['fabric', 'tweed'], ['fabric', 'canvas'], ['fabric', 'burlap'], ['fabric', 'felt'],
      ['shape', 'octagon'], ['shape', 'oval'], ['shape', 'diamond'], ['shape', 'star'], ['shape', 'heart'],
      ['shape', 'crescent'], ['shape', 'trapezoid'], ['shape', 'rhombus'], ['shape', 'cylinder'], ['shape', 'sphere'],
      ['number', 'six'], ['number', 'eight'], ['number', 'nine'], ['number', 'ten'], ['number', 'eleven'],
      ['letter', 'G'], ['letter', 'H'], ['letter', 'I'], ['letter', 'J'], ['letter', 'K'],
      ['letter', 'L'], ['letter', 'M'], ['letter', 'N'], ['letter', 'O'], ['letter', 'P'],
      ['occupation', 'doctor'], ['occupation', 'teacher'], ['occupation', 'engineer'], ['occupation', 'lawyer'], ['occupation', 'chef'],
      ['hobby', 'painting'], ['hobby', 'reading'], ['hobby', 'gardening'], ['hobby', 'photography'], ['hobby', 'fishing'],
      ['element', 'hydrogen'], ['element', 'carbon'], ['element', 'nitrogen'], ['element', 'oxygen'], ['element', 'sodium'],
      ['organ', 'heart'], ['organ', 'kidney'], ['organ', 'liver'], ['organ', 'pancreas'], ['organ', 'spleen'],
      ['bone', 'skull'], ['bone', 'spine'], ['bone', 'rib'], ['bone', 'femur'], ['bone', 'tibia'],
      ['sense', 'sight'], ['sense', 'hearing'], ['sense', 'smell'], ['sense', 'taste'], ['sense', 'touch'],
      ['virtue', 'honesty'], ['virtue', 'courage'], ['virtue', 'kindness'], ['virtue', 'patience'], ['virtue', 'humility'],
      ['currency', 'dollar'], ['currency', 'euro'], ['currency', 'pound'], ['currency', 'yen'], ['currency', 'rupee'],
      ['constellation', 'Orion'], ['constellation', 'Ursa Major'], ['constellation', 'Cassiopeia'], ['constellation', 'Gemini'], ['constellation', 'Leo'],
      // Additional whole-part relationships
      ['software', 'browser'], ['software', 'editor'], ['software', 'player'], ['software', 'messenger'], ['software', 'calculator'],
      ['game', 'chess'], ['game', 'poker'], ['game', 'checkers'], ['game', 'domino'], ['game', 'puzzle'],
      ['dance', 'waltz'], ['dance', 'tango'], ['dance', 'salsa'], ['dance', 'ballet'], ['dance', 'flamenco'],
      ['exercise', 'pushup'], ['exercise', 'situp'], ['exercise', 'squat'], ['exercise', 'plank'], ['exercise', 'lunge'],
      ['dessert', 'cake'], ['dessert', 'pie'], ['dessert', 'pudding'], ['dessert', 'mousse'], ['dessert', 'tart'],
      ['beverage', 'coffee'], ['beverage', 'tea'], ['beverage', 'juice'], ['beverage', 'soda'], ['beverage', 'wine'],
      ['snack', 'chips'], ['snack', 'cookies'], ['snack', 'crackers'], ['snack', 'nuts'], ['snack', 'pretzels'],
      ['footwear', 'sneakers'], ['footwear', 'boots'], ['footwear', 'sandals'], ['footwear', 'slippers'], ['footwear', 'heels'],
      ['headwear', 'cap'], ['headwear', 'hat'], ['headwear', 'helmet'], ['headwear', 'beret'], ['headwear', 'crown'],
      ['jewelry', 'necklace'], ['jewelry', 'ring'], ['jewelry', 'bracelet'], ['jewelry', 'earring'], ['jewelry', 'brooch'],
      ['toy', 'doll'], ['toy', 'ball'], ['toy', 'car'], ['toy', 'puzzle'], ['toy', 'blocks'],
      ['furniture', 'lamp'], ['furniture', 'mirror'], ['furniture', 'rug'], ['furniture', 'clock'], ['furniture', 'vase'],
      ['stationery', 'pen'], ['stationery', 'pencil'], ['stationery', 'eraser'], ['stationery', 'ruler'], ['stationery', 'stapler'],
      ['vehicle part', 'wheel'], ['vehicle part', 'engine'], ['vehicle part', 'brake'], ['vehicle part', 'steering wheel'], ['vehicle part', 'windshield'],
      ['building part', 'door'], ['building part', 'window'], ['building part', 'roof'], ['building part', 'floor'], ['building part', 'wall'],
      ['tree part', 'branch'], ['tree part', 'leaf'], ['tree part', 'root'], ['tree part', 'trunk'], ['tree part', 'bark'],
      ['flower part', 'petal'], ['flower part', 'stem'], ['flower part', 'pollen'], ['flower part', 'bud'], ['flower part', 'thorn'],
      ['body part', 'finger'], ['body part', 'toe'], ['body part', 'elbow'], ['body part', 'knee'], ['body part', 'shoulder'],
      ['face part', 'nose'], ['face part', 'eye'], ['face part', 'mouth'], ['face part', 'ear'], ['face part', 'chin'],
      ['computer part', 'keyboard'], ['computer part', 'mouse'], ['computer part', 'monitor'], ['computer part', 'processor'], ['computer part', 'memory'],
      ['phone part', 'screen'], ['phone part', 'battery'], ['phone part', 'camera'], ['phone part', 'speaker'], ['phone part', 'microphone'],
      ['kitchen item', 'stove'], ['kitchen item', 'sink'], ['kitchen item', 'fridge'], ['kitchen item', 'counter'], ['kitchen item', 'cabinet'],
      ['bathroom item', 'toilet'], ['bathroom item', 'sink'], ['bathroom item', 'shower'], ['bathroom item', 'bathtub'], ['bathroom item', 'mirror'],
      ['office item', 'desk'], ['office item', 'chair'], ['office item', 'computer'], ['office item', 'printer'], ['office item', 'file cabinet'],
      ['school item', 'desk'], ['school item', 'blackboard'], ['school item', 'textbook'], ['school item', 'notebook'], ['school item', 'backpack'],
      ['garden item', 'hose'], ['garden item', 'rake'], ['garden item', 'shovel'], ['garden item', 'pot'], ['garden item', 'fence'],
      ['bedroom item', 'bed'], ['bedroom item', 'pillow'], ['bedroom item', 'blanket'], ['bedroom item', 'dresser'], ['bedroom item', 'closet'],
      // Additional whole-part pairs (200+ more)
      ['animal', 'squirrel'], ['animal', 'otter'], ['animal', 'beaver'], ['animal', 'hedgehog'], ['animal', 'raccoon'],
      ['animal', 'skunk'], ['animal', 'chipmunk'], ['animal', 'mole'], ['animal', 'badger'], ['animal', 'ferret'],
      ['animal', 'weasel'], ['animal', 'mink'], ['animal', 'mongoose'], ['animal', 'armadillo'], ['animal', 'sloth'],
      ['animal', 'anteater'], ['animal', 'platypus'], ['animal', 'walrus'], ['animal', 'manatee'], ['animal', 'dugong'],
      ['bird', 'hummingbird'], ['bird', 'woodpecker'], ['bird', 'kingfisher'], ['bird', 'pelican'], ['bird', 'stork'],
      ['bird', 'crane'], ['bird', 'heron'], ['bird', 'ibis'], ['bird', 'albatross'], ['bird', 'puffin'],
      ['bird', 'toucan'], ['bird', 'cockatoo'], ['bird', 'macaw'], ['bird', 'canary'], ['bird', 'finch'],
      ['bird', 'warbler'], ['bird', 'lark'], ['bird', 'nightingale'], ['bird', 'thrush'], ['bird', 'starling'],
      ['fish', 'mahi-mahi'], ['fish', 'halibut'], ['fish', 'flounder'], ['fish', 'sole'], ['fish', 'perch'],
      ['fish', 'pike'], ['fish', 'carp'], ['fish', 'tilapia'], ['fish', 'snapper'], ['fish', 'grouper'],
      ['fish', 'wahoo'], ['fish', 'bluefish'], ['fish', 'pompano'], ['fish', 'tarpon'], ['fish', 'bonefish'],
      ['insect', 'centipede'], ['insect', 'millipede'], ['insect', 'scorpion'], ['insect', 'spider'], ['insect', 'tarantula'],
      ['insect', 'praying mantis'], ['insect', 'walking stick'], ['insect', 'caterpillar'], ['insect', 'silkworm'], ['insect', 'moth'],
      ['tree', 'mahogany'], ['tree', 'teak'], ['tree', 'ebony'], ['tree', 'rosewood'], ['tree', 'sandalwood'],
      ['tree', 'baobab'], ['tree', 'acacia'], ['tree', 'eucalyptus'], ['tree', 'magnolia'], ['tree', 'dogwood'],
      ['tree', 'sycamore'], ['tree', 'poplar'], ['tree', 'alder'], ['tree', 'hawthorn'], ['tree', 'mulberry'],
      ['flower', 'azalea'], ['flower', 'begonia'], ['flower', 'camellia'], ['flower', 'dahlia'], ['flower', 'gardenia'],
      ['flower', 'geranium'], ['flower', 'gladiolus'], ['flower', 'hollyhock'], ['flower', 'impatiens'], ['flower', 'magnolia'],
      ['flower', 'narcissus'], ['flower', 'pansy'], ['flower', 'petunia'], ['flower', 'zinnia'], ['flower', 'aster'],
      ['fruit', 'cantaloupe'], ['fruit', 'honeydew'], ['fruit', 'grapefruit'], ['fruit', 'tangerine'], ['fruit', 'persimmon'],
      ['fruit', 'pomegranate'], ['fruit', 'guava'], ['fruit', 'lychee'], ['fruit', 'starfruit'], ['fruit', 'dragonfruit'],
      ['fruit', 'passion fruit'], ['fruit', 'fig'], ['fruit', 'date'], ['fruit', 'apricot'], ['fruit', 'nectarine'],
      ['vegetable', 'zucchini'], ['vegetable', 'squash'], ['vegetable', 'pumpkin'], ['vegetable', 'turnip'], ['vegetable', 'parsnip'],
      ['vegetable', 'rutabaga'], ['vegetable', 'kohlrabi'], ['vegetable', 'artichoke'], ['vegetable', 'brussels sprout'], ['vegetable', 'kale'],
      ['vegetable', 'chard'], ['vegetable', 'collard'], ['vegetable', 'arugula'], ['vegetable', 'watercress'], ['vegetable', 'endive'],
      ['metal', 'tungsten'], ['metal', 'uranium'], ['metal', 'plutonium'], ['metal', 'chromium'], ['metal', 'manganese'],
      ['metal', 'vanadium'], ['metal', 'molybdenum'], ['metal', 'tantalum'], ['metal', 'osmium'], ['metal', 'iridium'],
      ['gem', 'alexandrite'], ['gem', 'aquamarine'], ['gem', 'beryl'], ['gem', 'citrine'], ['gem', 'peridot'],
      ['gem', 'spinel'], ['gem', 'tanzanite'], ['gem', 'tourmaline'], ['gem', 'zircon'], ['gem', 'moonstone'],
      ['instrument', 'mandolin'], ['instrument', 'lute'], ['instrument', 'harpischord'], ['instrument', 'organ'], ['instrument', 'synthesizer'],
      ['instrument', 'bagpipe'], ['instrument', 'oboe'], ['instrument', 'bassoon'], ['instrument', 'piccolo'], ['instrument', 'glockenspiel'],
      ['instrument', 'marimba'], ['instrument', 'vibraphone'], ['instrument', 'timpani'], ['instrument', 'cymbal'], ['instrument', 'tambourine'],
      ['sport', 'lacrosse'], ['sport', 'polo'], ['sport', 'rowing'], ['sport', 'sailing'], ['sport', 'surfing'],
      ['sport', 'diving'], ['sport', 'gymnastics'], ['sport', 'judo'], ['sport', 'karate'], ['sport', 'taekwondo'],
      ['sport', 'curling'], ['sport', 'bobsled'], ['sport', 'luge'], ['sport', 'biathlon'], ['sport', 'triathlon'],
      ['country', 'Argentina'], ['country', 'Chile'], ['country', 'Peru'], ['country', 'Colombia'], ['country', 'Venezuela'],
      ['country', 'Ecuador'], ['country', 'Bolivia'], ['country', 'Uruguay'], ['country', 'Paraguay'], ['country', 'Cuba'],
      ['country', 'Jamaica'], ['country', 'Haiti'], ['country', 'Dominican Republic'], ['country', 'Panama'], ['country', 'Costa Rica'],
      ['country', 'Guatemala'], ['country', 'Honduras'], ['country', 'Nicaragua'], ['country', 'El Salvador'], ['country', 'Belize'],
      ['country', 'South Africa'], ['country', 'Kenya'], ['country', 'Tanzania'], ['country', 'Uganda'], ['country', 'Ethiopia'],
      ['country', 'Morocco'], ['country', 'Algeria'], ['country', 'Tunisia'], ['country', 'Libya'], ['country', 'Sudan'],
      ['country', 'Ghana'], ['country', 'Senegal'], ['country', 'Cameroon'], ['country', 'Zimbabwe'], ['country', 'Mozambique'],
      ['city', 'Barcelona'], ['city', 'Milan'], ['city', 'Vienna'], ['city', 'Prague'], ['city', 'Budapest'],
      ['city', 'Warsaw'], ['city', 'Stockholm'], ['city', 'Copenhagen'], ['city', 'Oslo'], ['city', 'Helsinki'],
      ['city', 'Athens'], ['city', 'Istanbul'], ['city', 'Cairo'], ['city', 'Nairobi'], ['city', 'Lagos'],
      ['city', 'Mumbai'], ['city', 'Shanghai'], ['city', 'Hong Kong'], ['city', 'Seoul'], ['city', 'Bangkok'],
      ['city', 'Manila'], ['city', 'Jakarta'], ['city', 'Melbourne'], ['city', 'Toronto'], ['city', 'Vancouver'],
      ['food', 'pancake'], ['food', 'waffle'], ['food', 'omelette'], ['food', 'quiche'], ['food', 'casserole'],
      ['food', 'lasagna'], ['food', 'ravioli'], ['food', 'gnocchi'], ['food', 'risotto'], ['food', 'paella'],
      ['food', 'jambalaya'], ['food', 'gumbo'], ['food', 'chowder'], ['food', 'bisque'], ['food', 'gazpacho'],
      ['drink', 'sake'], ['drink', 'vodka'], ['drink', 'whiskey'], ['drink', 'rum'], ['drink', 'gin'],
      ['drink', 'tequila'], ['drink', 'champagne'], ['drink', 'cognac'], ['drink', 'brandy'], ['drink', 'liqueur'],
      ['clothing', 'vest'], ['clothing', 'blazer'], ['clothing', 'cardigan'], ['clothing', 'poncho'], ['clothing', 'shawl'],
      ['clothing', 'robe'], ['clothing', 'kimono'], ['clothing', 'sari'], ['clothing', 'kilt'], ['clothing', 'tunic'],
      ['profession', 'architect'], ['profession', 'surgeon'], ['profession', 'pilot'], ['profession', 'accountant'], ['profession', 'pharmacist'],
      ['profession', 'veterinarian'], ['profession', 'dentist'], ['profession', 'electrician'], ['profession', 'plumber'], ['profession', 'carpenter'],
      ['profession', 'mechanic'], ['profession', 'chef'], ['profession', 'baker'], ['profession', 'barber'], ['profession', 'tailor'],
      ['profession', 'librarian'], ['profession', 'journalist'], ['profession', 'photographer'], ['profession', 'designer'], ['profession', 'programmer'],
      // Even more whole-part pairs (150+ more)
      ['beverage', 'coffee'], ['beverage', 'tea'], ['beverage', 'juice'], ['beverage', 'soda'], ['beverage', 'milk'],
      ['beverage', 'wine'], ['beverage', 'beer'], ['beverage', 'cocktail'], ['beverage', 'smoothie'], ['beverage', 'lemonade'],
      ['snack', 'chips'], ['snack', 'crackers'], ['snack', 'popcorn'], ['snack', 'pretzels'], ['snack', 'cookies'],
      ['snack', 'candy'], ['snack', 'nuts'], ['snack', 'granola'], ['snack', 'jerky'], ['snack', 'trail mix'],
      ['fabric', 'cotton'], ['fabric', 'silk'], ['fabric', 'wool'], ['fabric', 'linen'], ['fabric', 'polyester'],
      ['fabric', 'denim'], ['fabric', 'velvet'], ['fabric', 'satin'], ['fabric', 'flannel'], ['fabric', 'leather'],
      ['metal', 'iron'], ['metal', 'copper'], ['metal', 'aluminum'], ['metal', 'bronze'], ['metal', 'steel'],
      ['metal', 'tin'], ['metal', 'zinc'], ['metal', 'nickel'], ['metal', 'titanium'], ['metal', 'platinum'],
      ['gemstone', 'diamond'], ['gemstone', 'emerald'], ['gemstone', 'sapphire'], ['gemstone', 'opal'], ['gemstone', 'topaz'],
      ['gemstone', 'amethyst'], ['gemstone', 'garnet'], ['gemstone', 'jade'], ['gemstone', 'pearl'], ['gemstone', 'turquoise'],
      ['weather', 'rain'], ['weather', 'snow'], ['weather', 'fog'], ['weather', 'hail'], ['weather', 'sleet'],
      ['weather', 'thunder'], ['weather', 'lightning'], ['weather', 'tornado'], ['weather', 'hurricane'], ['weather', 'blizzard'],
      ['landform', 'mountain'], ['landform', 'valley'], ['landform', 'canyon'], ['landform', 'plateau'], ['landform', 'plain'],
      ['landform', 'hill'], ['landform', 'cliff'], ['landform', 'mesa'], ['landform', 'butte'], ['landform', 'dune'],
      ['waterway', 'river'], ['waterway', 'stream'], ['waterway', 'creek'], ['waterway', 'canal'], ['waterway', 'strait'],
      ['waterway', 'channel'], ['waterway', 'inlet'], ['waterway', 'bay'], ['waterway', 'gulf'], ['waterway', 'fjord'],
      ['structure', 'bridge'], ['structure', 'tower'], ['structure', 'dam'], ['structure', 'tunnel'], ['structure', 'wall'],
      ['structure', 'fence'], ['structure', 'gate'], ['structure', 'arch'], ['structure', 'column'], ['structure', 'pillar'],
      ['appliance', 'refrigerator'], ['appliance', 'oven'], ['appliance', 'microwave'], ['appliance', 'dishwasher'], ['appliance', 'washer'],
      ['appliance', 'dryer'], ['appliance', 'toaster'], ['appliance', 'blender'], ['appliance', 'mixer'], ['appliance', 'vacuum'],
      ['technology', 'computer'], ['technology', 'smartphone'], ['technology', 'tablet'], ['technology', 'laptop'], ['technology', 'monitor'],
      ['technology', 'keyboard'], ['technology', 'mouse'], ['technology', 'router'], ['technology', 'modem'], ['technology', 'speaker'],
      ['toy', 'doll'], ['toy', 'ball'], ['toy', 'puzzle'], ['toy', 'lego'], ['toy', 'teddy'],
      ['toy', 'train'], ['toy', 'robot'], ['toy', 'kite'], ['toy', 'yo-yo'], ['toy', 'frisbee'],
      ['container', 'box'], ['container', 'jar'], ['container', 'bottle'], ['container', 'can'], ['container', 'barrel'],
      ['container', 'crate'], ['container', 'basket'], ['container', 'bag'], ['container', 'pouch'], ['container', 'sack'],
      ['celestial', 'moon'], ['celestial', 'sun'], ['celestial', 'star'], ['celestial', 'comet'], ['celestial', 'asteroid'],
      ['celestial', 'meteor'], ['celestial', 'planet'], ['celestial', 'galaxy'], ['celestial', 'nebula'], ['celestial', 'quasar'],
      ['part of speech', 'noun'], ['part of speech', 'verb'], ['part of speech', 'adjective'], ['part of speech', 'adverb'], ['part of speech', 'pronoun'],
      ['part of speech', 'preposition'], ['part of speech', 'conjunction'], ['part of speech', 'interjection'], ['part of speech', 'article'], ['part of speech', 'participle'],
      ['literary genre', 'fiction'], ['literary genre', 'poetry'], ['literary genre', 'drama'], ['literary genre', 'essay'], ['literary genre', 'biography'],
      ['literary genre', 'memoir'], ['literary genre', 'mystery'], ['literary genre', 'romance'], ['literary genre', 'thriller'], ['literary genre', 'fantasy'],
      ['art style', 'realism'], ['art style', 'impressionism'], ['art style', 'cubism'], ['art style', 'surrealism'], ['art style', 'abstract'],
      ['art style', 'baroque'], ['art style', 'renaissance'], ['art style', 'modernism'], ['art style', 'minimalism'], ['art style', 'expressionism'],
      ['shape', 'circle'], ['shape', 'square'], ['shape', 'triangle'], ['shape', 'rectangle'], ['shape', 'pentagon'],
      ['shape', 'hexagon'], ['shape', 'octagon'], ['shape', 'oval'], ['shape', 'diamond'], ['shape', 'star'],
      // Additional categories for more variety
      ['mineral', 'quartz'], ['mineral', 'feldspar'], ['mineral', 'mica'], ['mineral', 'calcite'], ['mineral', 'gypsum'],
      ['mineral', 'talc'], ['mineral', 'fluorite'], ['mineral', 'pyrite'], ['mineral', 'hematite'], ['mineral', 'magnetite'],
      ['chemical', 'acid'], ['chemical', 'base'], ['chemical', 'salt'], ['chemical', 'alcohol'], ['chemical', 'polymer'],
      ['chemical', 'enzyme'], ['chemical', 'protein'], ['chemical', 'lipid'], ['chemical', 'carbohydrate'], ['chemical', 'nucleic acid'],
      ['ecosystem', 'pond'], ['ecosystem', 'meadow'], ['ecosystem', 'swamp'], ['ecosystem', 'reef'], ['ecosystem', 'estuary'],
      ['bird of prey', 'falcon'], ['bird of prey', 'osprey'], ['bird of prey', 'kestrel'], ['bird of prey', 'vulture'], ['bird of prey', 'condor'],
      ['reptile', 'anaconda'], ['reptile', 'boa'], ['reptile', 'mamba'], ['reptile', 'adder'], ['reptile', 'skink'],
      ['amphibian', 'newt'], ['amphibian', 'axolotl'], ['amphibian', 'caecilian'], ['amphibian', 'tadpole'], ['amphibian', 'tree frog'],
      ['marine life', 'jellyfish'], ['marine life', 'octopus'], ['marine life', 'squid'], ['marine life', 'starfish'], ['marine life', 'seahorse'],
      ['marine life', 'crab'], ['marine life', 'lobster'], ['marine life', 'shrimp'], ['marine life', 'oyster'], ['marine life', 'clam'],
      ['crustacean', 'prawn'], ['crustacean', 'crayfish'], ['crustacean', 'barnacle'], ['crustacean', 'krill'], ['crustacean', 'copepod'],
      ['mollusk', 'snail'], ['mollusk', 'slug'], ['mollusk', 'mussel'], ['mollusk', 'scallop'], ['mollusk', 'nautilus'],
      ['arachnid', 'spider'], ['arachnid', 'scorpion'], ['arachnid', 'tick'], ['arachnid', 'mite'], ['arachnid', 'harvestman'],
      ['fungus', 'mushroom'], ['fungus', 'mold'], ['fungus', 'yeast'], ['fungus', 'truffle'], ['fungus', 'lichen'],
      ['bacteria', 'streptococcus'], ['bacteria', 'staphylococcus'], ['bacteria', 'salmonella'], ['bacteria', 'e coli'], ['bacteria', 'lactobacillus'],
      ['virus', 'influenza'], ['virus', 'coronavirus'], ['virus', 'rhinovirus'], ['virus', 'herpesvirus'], ['virus', 'adenovirus'],
      ['organ system', 'circulatory'], ['organ system', 'respiratory'], ['organ system', 'digestive'], ['organ system', 'nervous'], ['organ system', 'skeletal'],
      ['tissue', 'muscle'], ['tissue', 'nerve'], ['tissue', 'connective'], ['tissue', 'epithelial'], ['tissue', 'blood'],
      ['cell type', 'neuron'], ['cell type', 'red blood cell'], ['cell type', 'white blood cell'], ['cell type', 'stem cell'], ['cell type', 'epithelial cell'],
      ['hormone', 'insulin'], ['hormone', 'adrenaline'], ['hormone', 'testosterone'], ['hormone', 'estrogen'], ['hormone', 'cortisol'],
      ['neurotransmitter', 'serotonin'], ['neurotransmitter', 'dopamine'], ['neurotransmitter', 'norepinephrine'], ['neurotransmitter', 'acetylcholine'], ['neurotransmitter', 'gaba'],
      ['nutrient', 'vitamin'], ['nutrient', 'mineral'], ['nutrient', 'protein'], ['nutrient', 'carbohydrate'], ['nutrient', 'fat'],
      ['vitamin', 'vitamin a'], ['vitamin', 'vitamin b'], ['vitamin', 'vitamin c'], ['vitamin', 'vitamin d'], ['vitamin', 'vitamin e'],
      ['geological era', 'paleozoic'], ['geological era', 'mesozoic'], ['geological era', 'cenozoic'], ['geological era', 'precambrian'], ['geological era', 'quaternary'],
      ['rock type', 'igneous'], ['rock type', 'sedimentary'], ['rock type', 'metamorphic'], ['rock type', 'granite'], ['rock type', 'basalt'],
      ['cloud type', 'cumulus'], ['cloud type', 'stratus'], ['cloud type', 'cirrus'], ['cloud type', 'nimbus'], ['cloud type', 'altocumulus'],
      ['wind type', 'gale'], ['wind type', 'breeze'], ['wind type', 'gust'], ['wind type', 'zephyr'], ['wind type', 'monsoon'],
      ['storm type', 'thunderstorm'], ['storm type', 'hailstorm'], ['storm type', 'ice storm'], ['storm type', 'dust storm'], ['storm type', 'sandstorm'],
      ['mathematical operation', 'addition'], ['mathematical operation', 'subtraction'], ['mathematical operation', 'multiplication'], ['mathematical operation', 'division'], ['mathematical operation', 'exponentiation'],
      ['geometric concept', 'angle'], ['geometric concept', 'perimeter'], ['geometric concept', 'area'], ['geometric concept', 'volume'], ['geometric concept', 'circumference'],
      ['unit of measurement', 'meter'], ['unit of measurement', 'kilogram'], ['unit of measurement', 'second'], ['unit of measurement', 'ampere'], ['unit of measurement', 'kelvin'],
      ['time period', 'second'], ['time period', 'minute'], ['time period', 'hour'], ['time period', 'day'], ['time period', 'week'],
      ['calendar', 'gregorian'], ['calendar', 'julian'], ['calendar', 'lunar'], ['calendar', 'solar'], ['calendar', 'hebrew'],
      ['ancient civilization', 'egyptian'], ['ancient civilization', 'greek'], ['ancient civilization', 'roman'], ['ancient civilization', 'mesopotamian'], ['ancient civilization', 'indus'],
      ['empire', 'roman'], ['empire', 'british'], ['empire', 'mongol'], ['empire', 'ottoman'], ['empire', 'persian'],
      ['dynasty', 'ming'], ['dynasty', 'qing'], ['dynasty', 'han'], ['dynasty', 'tang'], ['dynasty', 'song'],
      ['philosophy', 'stoicism'], ['philosophy', 'epicureanism'], ['philosophy', 'existentialism'], ['philosophy', 'pragmatism'], ['philosophy', 'nihilism'],
      ['economic system', 'capitalism'], ['economic system', 'socialism'], ['economic system', 'feudalism'], ['economic system', 'mercantilism'], ['economic system', 'communism'],
      ['political ideology', 'liberalism'], ['political ideology', 'conservatism'], ['political ideology', 'libertarianism'], ['political ideology', 'anarchism'], ['political ideology', 'fascism'],
      ['architectural style', 'gothic'], ['architectural style', 'baroque'], ['architectural style', 'neoclassical'], ['architectural style', 'modernist'], ['architectural style', 'brutalist'],
      ['musical period', 'baroque'], ['musical period', 'classical'], ['musical period', 'romantic'], ['musical period', 'modern'], ['musical period', 'contemporary'],
      ['orchestra section', 'strings'], ['orchestra section', 'woodwinds'], ['orchestra section', 'brass'], ['orchestra section', 'percussion'], ['orchestra section', 'keyboard'],
      ['poem type', 'sonnet'], ['poem type', 'haiku'], ['poem type', 'limerick'], ['poem type', 'epic'], ['poem type', 'ballad'],
      ['punctuation', 'period'], ['punctuation', 'comma'], ['punctuation', 'semicolon'], ['punctuation', 'colon'], ['punctuation', 'apostrophe'],
      ['programming language', 'python'], ['programming language', 'javascript'], ['programming language', 'java'], ['programming language', 'c++'], ['programming language', 'ruby'],
      ['data structure', 'array'], ['data structure', 'list'], ['data structure', 'tree'], ['data structure', 'graph'], ['data structure', 'hash table'],
      ['algorithm', 'sorting'], ['algorithm', 'searching'], ['algorithm', 'encryption'], ['algorithm', 'compression'], ['algorithm', 'hashing'],
      // Additional professions and occupations (100+ pairs)
      ['profession', 'accountant'], ['profession', 'actuary'], ['profession', 'administrator'], ['profession', 'analyst'], ['profession', 'anthropologist'],
      ['profession', 'archaeologist'], ['profession', 'architect'], ['profession', 'archivist'], ['profession', 'astronaut'], ['profession', 'astronomer'],
      ['profession', 'audiologist'], ['profession', 'banker'], ['profession', 'biologist'], ['profession', 'botanist'], ['profession', 'butcher'],
      ['profession', 'carpenter'], ['profession', 'cartographer'], ['profession', 'cashier'], ['profession', 'chemist'], ['profession', 'chiropractor'],
      ['profession', 'choreographer'], ['profession', 'cinematographer'], ['profession', 'clerk'], ['profession', 'consultant'], ['profession', 'counselor'],
      ['profession', 'curator'], ['profession', 'custodian'], ['profession', 'data scientist'], ['profession', 'dentist'], ['profession', 'dermatologist'],
      ['profession', 'detective'], ['profession', 'dietitian'], ['profession', 'diplomat'], ['profession', 'ecologist'], ['profession', 'economist'],
      ['profession', 'editor'], ['profession', 'electrician'], ['profession', 'engineer'], ['profession', 'epidemiologist'], ['profession', 'esthetician'],
      ['profession', 'ethnographer'], ['profession', 'firefighter'], ['profession', 'florist'], ['profession', 'forester'], ['profession', 'geographer'],
      ['profession', 'geologist'], ['profession', 'graphic designer'], ['profession', 'historian'], ['profession', 'horticulturist'], ['profession', 'hydrologist'],
      ['profession', 'illustrator'], ['profession', 'immunologist'], ['profession', 'inspector'], ['profession', 'interpreter'], ['profession', 'jeweler'],
      ['profession', 'judge'], ['profession', 'lawyer'], ['profession', 'librarian'], ['profession', 'linguist'], ['profession', 'locksmith'],
      ['profession', 'mathematician'], ['profession', 'mechanic'], ['profession', 'meteorologist'], ['profession', 'microbiologist'], ['profession', 'midwife'],
      ['profession', 'mineralogist'], ['profession', 'miner'], ['profession', 'nutritionist'], ['profession', 'oceanographer'], ['profession', 'oncologist'],
      ['profession', 'ophthalmologist'], ['profession', 'optician'], ['profession', 'optometrist'], ['profession', 'orthodontist'], ['profession', 'orthopedist'],
      ['profession', 'osteopath'], ['profession', 'painter'], ['profession', 'paleontologist'], ['profession', 'paramedic'], ['profession', 'pathologist'],
      ['profession', 'pediatrician'], ['profession', 'pharmacist'], ['profession', 'photographer'], ['profession', 'physicist'], ['profession', 'physiologist'],
      ['profession', 'physiotherapist'], ['profession', 'pilot'], ['profession', 'plumber'], ['profession', 'poet'], ['profession', 'police officer'],
      ['profession', 'politician'], ['profession', 'programmer'], ['profession', 'psychiatrist'], ['profession', 'psychologist'], ['profession', 'radiologist'],
      ['profession', 'realtor'], ['profession', 'researcher'], ['profession', 'sailor'], ['profession', 'scientist'], ['profession', 'sculptor'],
      ['profession', 'secretary'], ['profession', 'seismologist'], ['profession', 'sociologist'], ['profession', 'statistician'], ['profession', 'surgeon'],
      ['profession', 'surveyor'], ['profession', 'tailor'], ['profession', 'teacher'], ['profession', 'technician'], ['profession', 'therapist'],
      ['profession', 'toxicologist'], ['profession', 'translator'], ['profession', 'undertaker'], ['profession', 'urban planner'], ['profession', 'urologist'],
      ['profession', 'veterinarian'], ['profession', 'virologist'], ['profession', 'welder'], ['profession', 'writer'], ['profession', 'zoologist'],
      // Sciences and academic disciplines (80+ pairs)
      ['science', 'acoustics'], ['science', 'aeronautics'], ['science', 'agriculture'], ['science', 'anatomy'], ['science', 'anthropology'],
      ['science', 'archaeology'], ['science', 'astrobiology'], ['science', 'astrophysics'], ['science', 'bacteriology'], ['science', 'biochemistry'],
      ['science', 'bioengineering'], ['science', 'bioinformatics'], ['science', 'biomechanics'], ['science', 'biophysics'], ['science', 'biotechnology'],
      ['science', 'cardiology'], ['science', 'cartography'], ['science', 'climatology'], ['science', 'cosmology'], ['science', 'criminology'],
      ['science', 'cryptography'], ['science', 'cytology'], ['science', 'demography'], ['science', 'dendrology'], ['science', 'dermatology'],
      ['science', 'ecology'], ['science', 'embryology'], ['science', 'endocrinology'], ['science', 'entomology'], ['science', 'epidemiology'],
      ['science', 'ethnology'], ['science', 'ethology'], ['science', 'gastroenterology'], ['science', 'genetics'], ['science', 'geochemistry'],
      ['science', 'geodesy'], ['science', 'geography'], ['science', 'geomorphology'], ['science', 'geophysics'], ['science', 'hematology'],
      ['science', 'histology'], ['science', 'hydrology'], ['science', 'ichthyology'], ['science', 'immunology'], ['science', 'limnology'],
      ['science', 'linguistics'], ['science', 'marine biology'], ['science', 'mechanics'], ['science', 'metallurgy'], ['science', 'meteorology'],
      ['science', 'microbiology'], ['science', 'mineralogy'], ['science', 'molecular biology'], ['science', 'morphology'], ['science', 'mycology'],
      ['science', 'nephrology'], ['science', 'neurology'], ['science', 'neuroscience'], ['science', 'obstetrics'], ['science', 'oceanography'],
      ['science', 'oncology'], ['science', 'ophthalmology'], ['science', 'optics'], ['science', 'ornithology'], ['science', 'paleontology'],
      ['science', 'parasitology'], ['science', 'pathology'], ['science', 'pediatrics'], ['science', 'petrology'], ['science', 'pharmacology'],
      ['science', 'philology'], ['science', 'phonology'], ['science', 'photonics'], ['science', 'physiology'], ['science', 'planetology'],
      ['science', 'psychiatry'], ['science', 'radiology'], ['science', 'seismology'], ['science', 'semantics'], ['science', 'taxonomy'],
      ['science', 'thermodynamics'], ['science', 'toxicology'], ['science', 'virology'], ['science', 'volcanology'], ['science', 'zoology'],
      // Technology and Computing (60+ pairs)
      ['technology', 'algorithm'], ['technology', 'android'], ['technology', 'app'], ['technology', 'artificial intelligence'], ['technology', 'automation'],
      ['technology', 'bandwidth'], ['technology', 'battery'], ['technology', 'bitcoin'], ['technology', 'blockchain'], ['technology', 'bluetooth'],
      ['technology', 'broadband'], ['technology', 'browser'], ['technology', 'cable'], ['technology', 'camera'], ['technology', 'chip'],
      ['technology', 'cloud'], ['technology', 'codec'], ['technology', 'compiler'], ['technology', 'cpu'], ['technology', 'cryptocurrency'],
      ['technology', 'cybersecurity'], ['technology', 'database'], ['technology', 'debugger'], ['technology', 'decoder'], ['technology', 'desktop'],
      ['technology', 'digital'], ['technology', 'download'], ['technology', 'drone'], ['technology', 'encoder'], ['technology', 'encryption'],
      ['technology', 'ethernet'], ['technology', 'fiber optic'], ['technology', 'firewall'], ['technology', 'firmware'], ['technology', 'flash drive'],
      ['technology', 'floppy'], ['technology', 'font'], ['technology', 'framework'], ['technology', 'gps'], ['technology', 'gpu'],
      ['technology', 'hacker'], ['technology', 'hardware'], ['technology', 'hologram'], ['technology', 'html'], ['technology', 'icon'],
      ['technology', 'interface'], ['technology', 'internet'], ['technology', 'iot'], ['technology', 'javascript'], ['technology', 'keyboard'],
      ['technology', 'laser'], ['technology', 'linux'], ['technology', 'machine learning'], ['technology', 'malware'], ['technology', 'memory'],
      ['technology', 'microchip'], ['technology', 'motherboard'], ['technology', 'nanotechnology'], ['technology', 'network'], ['technology', 'operating system'],
      ['technology', 'pixel'], ['technology', 'processor'], ['technology', 'python'], ['technology', 'quantum'], ['technology', 'ram'],
      ['technology', 'robot'], ['technology', 'router'], ['technology', 'scanner'], ['technology', 'semiconductor'], ['technology', 'sensor'],
      ['technology', 'server'], ['technology', 'silicon'], ['technology', 'smartphone'], ['technology', 'software'], ['technology', 'sql'],
      ['technology', 'storage'], ['technology', 'streaming'], ['technology', 'tablet'], ['technology', 'transistor'], ['technology', 'upload'],
      ['technology', 'usb'], ['technology', 'virtual reality'], ['technology', 'virus'], ['technology', 'vpn'], ['technology', 'wifi'],
      // Foods - Breakfast, Lunch, Dinner, Desserts (60+ pairs)
      ['breakfast', 'bagel'], ['breakfast', 'cereal'], ['breakfast', 'croissant'], ['breakfast', 'donut'], ['breakfast', 'eggs'],
      ['breakfast', 'french toast'], ['breakfast', 'granola'], ['breakfast', 'hash browns'], ['breakfast', 'muffin'], ['breakfast', 'oatmeal'],
      ['breakfast', 'omelet'], ['breakfast', 'pancake'], ['breakfast', 'porridge'], ['breakfast', 'sausage'], ['breakfast', 'scone'],
      ['breakfast', 'smoothie'], ['breakfast', 'toast'], ['breakfast', 'waffle'], ['breakfast', 'yogurt'], ['lunch', 'burrito'],
      ['lunch', 'club sandwich'], ['lunch', 'falafel'], ['lunch', 'gyro'], ['lunch', 'hoagie'], ['lunch', 'panini'],
      ['lunch', 'quesadilla'], ['lunch', 'ramen'], ['lunch', 'salad'], ['lunch', 'sandwich'], ['lunch', 'soup'],
      ['lunch', 'sub'], ['lunch', 'taco'], ['lunch', 'wrap'], ['dinner', 'biryani'], ['dinner', 'casserole'],
      ['dinner', 'curry'], ['dinner', 'enchilada'], ['dinner', 'goulash'], ['dinner', 'kabob'], ['dinner', 'lasagna'],
      ['dinner', 'meatloaf'], ['dinner', 'paella'], ['dinner', 'pasta'], ['dinner', 'pot roast'], ['dinner', 'risotto'],
      ['dinner', 'schnitzel'], ['dinner', 'stew'], ['dinner', 'stir fry'], ['dinner', 'stroganoff'], ['dinner', 'tagine'],
      ['dessert', 'baklava'], ['dessert', 'brownie'], ['dessert', 'cake'], ['dessert', 'cheesecake'], ['dessert', 'cookie'],
      ['dessert', 'cream puff'], ['dessert', 'crumble'], ['dessert', 'cupcake'], ['dessert', 'eclair'], ['dessert', 'flan'],
      ['dessert', 'gelato'], ['dessert', 'ice cream'], ['dessert', 'macaron'], ['dessert', 'meringue'], ['dessert', 'mousse'],
      ['dessert', 'parfait'], ['dessert', 'pie'], ['dessert', 'pudding'], ['dessert', 'sorbet'], ['dessert', 'souffle'],
      ['dessert', 'sundae'], ['dessert', 'tart'], ['dessert', 'tiramisu'], ['dessert', 'torte'], ['dessert', 'truffle'],
      // Cuisines and dishes (40+ pairs)
      ['cuisine', 'american'], ['cuisine', 'chinese'], ['cuisine', 'french'], ['cuisine', 'greek'], ['cuisine', 'indian'],
      ['cuisine', 'italian'], ['cuisine', 'japanese'], ['cuisine', 'korean'], ['cuisine', 'mediterranean'], ['cuisine', 'mexican'],
      ['cuisine', 'middle eastern'], ['cuisine', 'thai'], ['cuisine', 'vietnamese'], ['dish', 'carbonara'], ['dish', 'chowder'],
      ['dish', 'couscous'], ['dish', 'fajita'], ['dish', 'fondue'], ['dish', 'gazpacho'], ['dish', 'guacamole'],
      ['dish', 'hummus'], ['dish', 'kebab'], ['dish', 'minestrone'], ['dish', 'moussaka'], ['dish', 'nachos'],
      ['dish', 'pad thai'], ['dish', 'pesto'], ['dish', 'pho'], ['dish', 'ratatouille'], ['dish', 'salsa'],
      ['dish', 'samosa'], ['dish', 'satay'], ['dish', 'souvlaki'], ['dish', 'spring roll'], ['dish', 'sushi'],
      ['dish', 'tempura'], ['dish', 'teriyaki'], ['dish', 'tikka masala'], ['dish', 'tzatziki'], ['dish', 'vindaloo'],
      // Beverages (30+ pairs)
      ['beverage', 'americano'], ['beverage', 'chai'], ['beverage', 'cola'], ['beverage', 'eggnog'], ['beverage', 'espresso'],
      ['beverage', 'frappe'], ['beverage', 'hot chocolate'], ['beverage', 'kombucha'], ['beverage', 'latte'], ['beverage', 'lemonade'],
      ['beverage', 'liqueur'], ['beverage', 'matcha'], ['beverage', 'mimosa'], ['beverage', 'mojito'], ['beverage', 'punch'],
      ['beverage', 'sangria'], ['beverage', 'shake'], ['beverage', 'smoothie'], ['beverage', 'soda'], ['beverage', 'spritzer'],
      ['beverage', 'tonic'], ['alcohol', 'absinthe'], ['alcohol', 'bourbon'], ['alcohol', 'calvados'], ['alcohol', 'cider'],
      ['alcohol', 'gin'], ['alcohol', 'grappa'], ['alcohol', 'mead'], ['alcohol', 'mezcal'], ['alcohol', 'moonshine'],
      ['alcohol', 'ouzo'], ['alcohol', 'port'], ['alcohol', 'rum'], ['alcohol', 'sake'], ['alcohol', 'schnapps'],
      ['alcohol', 'sherry'], ['alcohol', 'tequila'], ['alcohol', 'vermouth'], ['alcohol', 'vodka'], ['alcohol', 'whiskey'],
      // Medical specialties and terms (50+ pairs)
      ['medical field', 'allergy'], ['medical field', 'anesthesiology'], ['medical field', 'audiology'], ['medical field', 'bariatrics'],
      ['medical field', 'cardiology'], ['medical field', 'chiropractic'], ['medical field', 'dentistry'], ['medical field', 'dermatology'],
      ['medical field', 'emergency medicine'], ['medical field', 'endocrinology'], ['medical field', 'family medicine'], ['medical field', 'gastroenterology'],
      ['medical field', 'geriatrics'], ['medical field', 'gynecology'], ['medical field', 'hematology'], ['medical field', 'infectious disease'],
      ['medical field', 'internal medicine'], ['medical field', 'neonatology'], ['medical field', 'nephrology'], ['medical field', 'neurology'],
      ['medical field', 'neurosurgery'], ['medical field', 'obstetrics'], ['medical field', 'oncology'], ['medical field', 'ophthalmology'],
      ['medical field', 'optometry'], ['medical field', 'orthopedics'], ['medical field', 'otolaryngology'], ['medical field', 'pathology'],
      ['medical field', 'pediatrics'], ['medical field', 'physical therapy'], ['medical field', 'plastic surgery'], ['medical field', 'podiatry'],
      ['medical field', 'psychiatry'], ['medical field', 'pulmonology'], ['medical field', 'radiology'], ['medical field', 'rheumatology'],
      ['medical field', 'sports medicine'], ['medical field', 'surgery'], ['medical field', 'urology'], ['medical field', 'vascular surgery'],
      ['medical condition', 'arthritis'], ['medical condition', 'bronchitis'], ['medical condition', 'cataract'], ['medical condition', 'concussion'],
      ['medical condition', 'dermatitis'], ['medical condition', 'eczema'], ['medical condition', 'epilepsy'], ['medical condition', 'fibromyalgia'],
      ['medical condition', 'gastritis'], ['medical condition', 'glaucoma'], ['medical condition', 'hypertension'], ['medical condition', 'hypothyroidism'],
      ['medical condition', 'infection'], ['medical condition', 'insomnia'], ['medical condition', 'jaundice'], ['medical condition', 'leukemia'],
      ['medical condition', 'lymphoma'], ['medical condition', 'meningitis'], ['medical condition', 'migraine'], ['medical condition', 'neuropathy'],
      ['medical condition', 'osteoporosis'], ['medical condition', 'pancreatitis'], ['medical condition', 'parkinson'], ['medical condition', 'psoriasis'],
      ['medical condition', 'sclerosis'], ['medical condition', 'sinusitis'], ['medical condition', 'stroke'], ['medical condition', 'thrombosis'],
      ['medical condition', 'tinnitus'], ['medical condition', 'ulcer'], ['medical condition', 'vertigo']
    ],
    'antonym': [
      ['hot', 'cold'], ['big', 'small'], ['fast', 'slow'], ['up', 'down'], ['left', 'right'],
      ['light', 'dark'], ['good', 'bad'], ['happy', 'sad'], ['love', 'hate'], ['peace', 'war'],
      ['young', 'old'], ['new', 'ancient'], ['start', 'end'], ['open', 'close'], ['push', 'pull'],
      ['give', 'take'], ['buy', 'sell'], ['win', 'lose'], ['find', 'lose'], ['gain', 'loss'],
      ['increase', 'decrease'], ['rise', 'fall'], ['grow', 'shrink'], ['expand', 'contract'], ['inflate', 'deflate'],
      ['arrive', 'depart'], ['enter', 'exit'], ['inside', 'outside'], ['above', 'below'], ['front', 'back'],
      ['first', 'last'], ['early', 'late'], ['before', 'after'], ['past', 'future'], ['ancient', 'modern'],
      ['soft', 'hard'], ['smooth', 'rough'], ['wet', 'dry'], ['clean', 'dirty'], ['fresh', 'stale'],
      ['full', 'empty'], ['thick', 'thin'], ['wide', 'narrow'], ['tall', 'short'], ['deep', 'shallow'],
      ['strong', 'weak'], ['loud', 'quiet'], ['bright', 'dim'], ['sharp', 'dull'], ['clear', 'cloudy'],
      ['visible', 'invisible'], ['present', 'absent'], ['real', 'fake'], ['true', 'false'], ['correct', 'wrong'],
      ['success', 'failure'], ['victory', 'defeat'], ['hero', 'villain'], ['friend', 'enemy'], ['trust', 'distrust'],
      ['honest', 'dishonest'], ['sincere', 'fake'], ['genuine', 'phony'], ['original', 'copy'], ['natural', 'artificial'],
      ['wild', 'tame'], ['raw', 'cooked'], ['alive', 'dead'], ['birth', 'death'], ['create', 'destroy'],
      ['accept', 'reject'], ['advance', 'retreat'], ['agree', 'disagree'], ['allow', 'forbid'], ['attack', 'defend'],
      ['attract', 'repel'], ['brave', 'coward'], ['build', 'demolish'], ['calm', 'agitated'], ['cheap', 'expensive'],
      ['clockwise', 'counterclockwise'], ['comedy', 'tragedy'], ['complex', 'simple'], ['compress', 'expand'], ['conceal', 'reveal'],
      ['connect', 'disconnect'], ['construct', 'destruct'], ['continue', 'stop'], ['convex', 'concave'], ['cool', 'warm'],
      ['courage', 'fear'], ['courteous', 'rude'], ['crazy', 'sane'], ['credit', 'debit'], ['cruel', 'kind'],
      ['dangerous', 'safe'], ['darkness', 'light'], ['dawn', 'dusk'], ['day', 'night'], ['defect', 'merit'],
      ['defend', 'attack'], ['definite', 'indefinite'], ['delight', 'dismay'], ['demand', 'supply'], ['dense', 'sparse'],
      ['descend', 'ascend'], ['despair', 'hope'], ['destroy', 'build'], ['different', 'same'], ['difficult', 'easy'],
      ['diminish', 'increase'], ['direct', 'indirect'], ['disappear', 'appear'], ['discount', 'premium'], ['disgrace', 'honor'],
      ['dislike', 'like'], ['divide', 'unite'], ['domestic', 'foreign'], ['doubt', 'certainty'], ['down', 'up'],
      ['dull', 'sharp'], ['dumb', 'smart'], ['dusk', 'dawn'], ['eager', 'reluctant'], ['earn', 'spend'],
      ['east', 'west'], ['easy', 'difficult'], ['elderly', 'young'], ['empty', 'full'], ['enemy', 'ally'],
      ['energetic', 'lethargic'], ['entrance', 'exit'], ['equal', 'unequal'], ['even', 'odd'], ['everything', 'nothing'],
      ['evil', 'good'], ['exact', 'approximate'], ['expand', 'shrink'], ['expensive', 'cheap'], ['export', 'import'],
      ['exterior', 'interior'], ['external', 'internal'], ['extrovert', 'introvert'], ['fact', 'fiction'], ['fail', 'succeed'],
      ['fair', 'unfair'], ['faithful', 'disloyal'], ['fall', 'rise'], ['false', 'true'], ['fame', 'obscurity'],
      ['fancy', 'plain'], ['far', 'near'], ['fat', 'thin'], ['father', 'mother'], ['favor', 'oppose'],
      ['fear', 'courage'], ['female', 'male'], ['few', 'many'], ['fiction', 'fact'], ['fierce', 'gentle'],
      ['final', 'initial'], ['find', 'lose'], ['finite', 'infinite'], ['fire', 'water'], ['firm', 'soft'],
      ['fix', 'break'], ['flexible', 'rigid'], ['float', 'sink'], ['floor', 'ceiling'], ['follow', 'lead'],
      ['foolish', 'wise'], ['forbid', 'allow'], ['foreign', 'domestic'], ['forget', 'remember'], ['forgive', 'blame'],
      ['formal', 'informal'], ['former', 'latter'], ['forward', 'backward'], ['foul', 'fair'], ['fragile', 'sturdy'],
      ['free', 'captive'], ['freedom', 'slavery'], ['freeze', 'melt'], ['frequent', 'rare'], ['friend', 'foe'],
      ['front', 'rear'], ['frozen', 'melted'], ['frugal', 'wasteful'], ['funny', 'serious'], ['future', 'past'],
      ['generous', 'stingy'], ['gentle', 'rough'], ['giant', 'dwarf'], ['give', 'receive'], ['glad', 'sorry'],
      ['glamorous', 'plain'], ['global', 'local'], ['glorious', 'shameful'], ['go', 'stop'], ['graceful', 'clumsy'],
      ['gradual', 'sudden'], ['grant', 'deny'], ['great', 'terrible'], ['greed', 'generosity'], ['guilty', 'innocent'],
      ['habitat', 'wilderness'], ['happiness', 'sorrow'], ['hard', 'soft'], ['harmful', 'harmless'], ['harsh', 'mild'],
      ['hasty', 'deliberate'], ['hate', 'love'], ['healthy', 'sick'], ['heaven', 'hell'], ['heavy', 'light'],
      ['height', 'depth'], ['help', 'hinder'], ['helpful', 'harmful'], ['here', 'there'], ['hide', 'show'],
      ['high', 'low'], ['hill', 'valley'], ['hinder', 'help'], ['horizontal', 'vertical'], ['host', 'guest'],
      ['hostile', 'friendly'], ['huge', 'tiny'], ['humble', 'proud'], ['hunger', 'satiety'], ['hurry', 'delay'],
      ['idle', 'busy'], ['ignorance', 'knowledge'], ['ignore', 'notice'], ['ill', 'well'], ['illegal', 'legal'],
      ['imaginary', 'real'], ['import', 'export'], ['improve', 'worsen'], ['include', 'exclude'], ['individual', 'collective'],
      ['inferior', 'superior'], ['infinite', 'finite'], ['innocent', 'guilty'], ['input', 'output'], ['inside', 'outside'],
      ['intelligent', 'stupid'], ['intentional', 'accidental'], ['interior', 'exterior'], ['internal', 'external'], ['interesting', 'boring'],
      ['junior', 'senior'], ['just', 'unjust'], ['justice', 'injustice'], ['kind', 'cruel'], ['king', 'queen'],
      ['knowledge', 'ignorance'], ['known', 'unknown'], ['large', 'small'], ['last', 'first'], ['late', 'early'],
      ['laugh', 'cry'], ['lead', 'follow'], ['leader', 'follower'], ['lean', 'fat'], ['learn', 'forget'],
      ['least', 'most'], ['left', 'right'], ['legal', 'illegal'], ['lend', 'borrow'], ['less', 'more'],
      ['liberal', 'conservative'], ['life', 'death'], ['lift', 'drop'], ['light', 'heavy'], ['like', 'dislike'],
      ['liquid', 'solid'], ['little', 'big'], ['live', 'die'], ['living', 'dead'], ['long', 'short'],
      ['lose', 'win'], ['loss', 'gain'], ['loud', 'soft'], ['low', 'high'], ['loyal', 'disloyal'],
      ['lucky', 'unlucky'], ['luxury', 'poverty'], ['mad', 'sane'], ['major', 'minor'], ['majority', 'minority'],
      ['male', 'female'], ['many', 'few'], ['master', 'servant'], ['maximum', 'minimum'], ['meaningful', 'meaningless'],
      ['mature', 'immature'], ['mechanical', 'manual'], ['melt', 'freeze'], ['merge', 'split'], ['merry', 'sad'],
      ['messy', 'neat'], ['microscopic', 'gigantic'], ['mild', 'harsh'], ['minimum', 'maximum'], ['minor', 'major'],
      ['minority', 'majority'], ['misery', 'happiness'], ['modest', 'arrogant'], ['moist', 'dry'], ['monotonous', 'varied'],
      ['moral', 'immoral'], ['more', 'less'], ['mortal', 'immortal'], ['multiply', 'divide'], ['mute', 'loud'],
      ['narrow', 'wide'], ['nasty', 'nice'], ['native', 'foreign'], ['natural', 'synthetic'], ['near', 'far'],
      ['neat', 'messy'], ['necessary', 'unnecessary'], ['negative', 'positive'], ['neglect', 'care'], ['nervous', 'calm'],
      ['never', 'always'], ['new', 'old'], ['night', 'day'], ['noble', 'ignoble'], ['noisy', 'quiet'],
      ['none', 'all'], ['normal', 'abnormal'], ['north', 'south'], ['notice', 'ignore'], ['now', 'then'],
      ['obedient', 'disobedient'], ['obese', 'thin'], ['objective', 'subjective'], ['obscure', 'clear'], ['observed', 'unobserved'],
      ['obtain', 'lose'], ['obvious', 'subtle'], ['occupied', 'vacant'], ['odd', 'even'], ['offend', 'please'],
      ['offensive', 'defensive'], ['offer', 'withdraw'], ['old', 'new'], ['on', 'off'], ['opaque', 'transparent'],
      ['open', 'closed'], ['opponent', 'ally'], ['oppose', 'support'], ['optimist', 'pessimist'], ['optional', 'mandatory'],
      ['order', 'chaos'], ['ordinary', 'extraordinary'], ['organized', 'disorganized'], ['orthodox', 'unorthodox'], ['outer', 'inner'],
      ['outgoing', 'shy'], ['outside', 'inside'], ['over', 'under'], ['painful', 'painless'], ['pale', 'dark'],
      ['parallel', 'perpendicular'], ['pardon', 'punish'], ['parent', 'child'], ['part', 'whole'], ['partial', 'complete'],
      ['particular', 'general'], ['passive', 'active'], ['past', 'present'], ['patient', 'impatient'], ['patriot', 'traitor'],
      ['peace', 'conflict'], ['peaceful', 'violent'], ['peak', 'valley'], ['peculiar', 'normal'], ['penalty', 'reward'],
      ['perfect', 'imperfect'], ['permanent', 'temporary'], ['permit', 'prohibit'], ['perpendicular', 'parallel'], ['personal', 'impersonal'],
      ['persuade', 'dissuade'], ['pessimist', 'optimist'], ['physical', 'mental'], ['plain', 'fancy'], ['plant', 'harvest'],
      ['plastic', 'rigid'], ['pleasant', 'unpleasant'], ['pleased', 'displeased'], ['plenty', 'scarcity'], ['plural', 'singular'],
      ['plus', 'minus'], ['polite', 'impolite'], ['polluted', 'clean'], ['poor', 'rich'], ['popular', 'unpopular'],
      ['positive', 'negative'], ['possible', 'impossible'], ['poverty', 'wealth'], ['powerful', 'powerless'], ['practical', 'impractical'],
      ['praise', 'criticize'], ['precious', 'worthless'], ['precise', 'imprecise'], ['predict', 'recall'], ['prefer', 'reject'],
      ['pregnant', 'barren'], ['prejudice', 'tolerance'], ['premature', 'overdue'], ['prepare', 'neglect'], ['present', 'past'],
      ['preserve', 'destroy'], ['pretty', 'ugly'], ['prevent', 'allow'], ['pride', 'shame'], ['primary', 'secondary'],
      ['primitive', 'advanced'], ['prince', 'pauper'], ['principal', 'subordinate'], ['prior', 'subsequent'], ['prison', 'freedom'],
      ['private', 'public'], ['probable', 'improbable'], ['problem', 'solution'], ['produce', 'consume'], ['professional', 'amateur'],
      ['profit', 'loss'], ['profound', 'shallow'], ['progress', 'regress'], ['prohibit', 'permit'], ['prominent', 'obscure'],
      ['promise', 'break'], ['prompt', 'late'], ['prone', 'upright'], ['proper', 'improper'], ['prosper', 'fail'],
      ['protect', 'endanger'], ['proud', 'ashamed'], ['prove', 'disprove'], ['provide', 'withhold'], ['prudent', 'reckless'],
      ['public', 'private'], ['pull', 'push'], ['punish', 'reward'], ['pure', 'impure'], ['purpose', 'accident'],
      ['pursue', 'flee'], ['push', 'pull'], ['qualified', 'unqualified'], ['quality', 'quantity'], ['question', 'answer'],
      ['quick', 'slow'], ['quiet', 'noisy'], ['quit', 'continue'], ['raise', 'lower'], ['random', 'planned'],
      ['rapid', 'gradual'], ['rare', 'common'], ['rarely', 'often'], ['rational', 'irrational'], ['raw', 'cooked'],
      ['reach', 'miss'], ['read', 'write'], ['ready', 'unready'], ['real', 'imaginary'], ['realistic', 'unrealistic'],
      ['reality', 'fantasy'], ['rear', 'front'], ['reason', 'emotion'], ['reasonable', 'unreasonable'], ['rebel', 'obey'],
      ['receive', 'give'], ['recent', 'ancient'], ['recognize', 'ignore'], ['rectangular', 'circular'], ['reduce', 'increase'],
      ['reflect', 'absorb'], ['reform', 'corrupt'], ['refund', 'charge'], ['refuse', 'accept'], ['regard', 'disregard'],
      ['regret', 'satisfaction'], ['regular', 'irregular'], ['reject', 'accept'], ['related', 'unrelated'], ['relax', 'tense'],
      ['release', 'capture'], ['reliable', 'unreliable'], ['relief', 'burden'], ['religious', 'secular'], ['reluctant', 'willing'],
      ['remain', 'depart'], ['remarkable', 'ordinary'], ['remember', 'forget'], ['remote', 'near'], ['remove', 'add'],
      ['repair', 'damage'], ['repeat', 'vary'], ['repel', 'attract'], ['replace', 'keep'], ['reply', 'question'],
      ['representative', 'unique'], ['repress', 'express'], ['reproduce', 'destroy'], ['request', 'command'], ['require', 'dispense'],
      ['rescue', 'abandon'], ['resemble', 'differ'], ['reserved', 'outgoing'], ['resist', 'yield'], ['resolution', 'problem'],
      ['resolve', 'create'], ['respect', 'disrespect'], ['responsible', 'irresponsible'], ['rest', 'work'], ['restless', 'calm'],
      ['restore', 'ruin'], ['restrain', 'release'], ['restrict', 'liberate'], ['result', 'cause'], ['retail', 'wholesale'],
      ['retain', 'release'], ['retire', 'join'], ['retreat', 'advance'], ['return', 'depart'], ['reveal', 'conceal'],
      ['revenge', 'forgiveness'], ['reverse', 'forward'], ['revive', 'kill'], ['reward', 'punishment'], ['rich', 'poor'],
      ['right', 'wrong'], ['rigid', 'flexible'], ['ripen', 'wither'], ['rise', 'set'], ['risk', 'safety'],
      ['rival', 'partner'], ['robust', 'frail'], ['rough', 'smooth'], ['round', 'square'], ['rude', 'polite'],
      ['ruin', 'build'], ['rule', 'exception'], ['rural', 'urban'], ['rush', 'delay'], ['sad', 'happy'],
      ['safe', 'dangerous'], ['same', 'different'], ['sane', 'insane'], ['satisfactory', 'unsatisfactory'], ['satisfied', 'dissatisfied'],
      ['save', 'spend'], ['scatter', 'gather'], ['scarcity', 'abundance'], ['scholar', 'ignoramus'], ['science', 'art'],
      ['scold', 'praise'], ['second', 'first'], ['secret', 'public'], ['secure', 'insecure'], ['see', 'blind'],
      ['seek', 'avoid'], ['seldom', 'often'], ['select', 'reject'], ['self', 'other'], ['selfish', 'selfless'],
      ['sell', 'buy'], ['send', 'receive'], ['senior', 'junior'], ['sense', 'nonsense'], ['sensible', 'foolish'],
      ['sensitive', 'insensitive'], ['separate', 'together'], ['serious', 'humorous'], ['servant', 'master'], ['serve', 'command'],
      ['set', 'rise'], ['settle', 'migrate'], ['severe', 'mild'], ['shallow', 'deep'], ['shame', 'pride'],
      ['shameful', 'honorable'], ['share', 'hoard'], ['sharp', 'blunt'], ['shiny', 'dull'], ['short', 'long'],
      ['shortage', 'surplus'], ['shout', 'whisper'], ['show', 'hide'], ['shrink', 'expand'], ['shut', 'open'],
      ['shy', 'bold'], ['sick', 'healthy'], ['significant', 'insignificant'], ['silent', 'noisy'], ['silly', 'serious'],
      ['similar', 'different'], ['simple', 'complicated'], ['simultaneous', 'sequential'], ['sin', 'virtue'], ['sincere', 'insincere'],
      ['single', 'married'], ['singular', 'plural'], ['sink', 'float'], ['sister', 'brother'], ['sit', 'stand'],
      ['skeptical', 'trusting'], ['skilled', 'unskilled'], ['slack', 'tight'], ['slave', 'master'], ['sleep', 'wake'],
      ['slender', 'fat'], ['slight', 'major'], ['slim', 'fat'], ['slow', 'fast'], ['small', 'large'],
      ['smart', 'stupid'], ['smile', 'frown'], ['smooth', 'rough'], ['sober', 'drunk'], ['sociable', 'unsociable'],
      ['social', 'antisocial'], ['soft', 'hard'], ['solid', 'liquid'], ['solitary', 'social'], ['solve', 'create'],
      ['some', 'none'], ['son', 'daughter'], ['sorrow', 'joy'], ['sorry', 'glad'], ['sound', 'silence'],
      ['sour', 'sweet'], ['south', 'north'], ['spacious', 'cramped'], ['spare', 'use'], ['speak', 'listen'],
      ['special', 'ordinary'], ['specific', 'general'], ['speed', 'slowness'], ['spend', 'save'], ['spicy', 'bland'],
      ['split', 'join'], ['spoil', 'preserve'], ['spread', 'concentrate'], ['square', 'round'], ['stable', 'unstable'],
      ['stale', 'fresh'], ['stand', 'sit'], ['standard', 'nonstandard'], ['start', 'finish'], ['starve', 'feed'],
      ['static', 'dynamic'], ['stay', 'leave'], ['steady', 'unsteady'], ['steal', 'return'], ['steep', 'gradual'],
      ['sterile', 'fertile'], ['stiff', 'flexible'], ['still', 'moving'], ['stimulate', 'depress'], ['stingy', 'generous'],
      ['stop', 'go'], ['straight', 'crooked'], ['stranger', 'friend'], ['strength', 'weakness'], ['stretch', 'shrink'],
      ['strict', 'lenient'], ['strike', 'miss'], ['strong', 'feeble'], ['structure', 'chaos'], ['struggle', 'ease'],
      ['stubborn', 'flexible'], ['student', 'teacher'], ['stupid', 'intelligent'], ['sturdy', 'fragile'], ['subject', 'ruler'],
      ['subjective', 'objective'], ['submit', 'resist'], ['subordinate', 'superior'], ['subsequent', 'previous'], ['subside', 'increase'],
      ['substance', 'shadow'], ['substantial', 'trivial'], ['subtract', 'add'], ['succeed', 'fail'], ['success', 'failure'],
      ['successive', 'intermittent'], ['sudden', 'gradual'], ['suffer', 'enjoy'], ['sufficient', 'insufficient'], ['suggest', 'order'],
      ['suit', 'clash'], ['suitable', 'unsuitable'], ['summary', 'detail'], ['summer', 'winter'], ['summit', 'base'],
      ['sunny', 'cloudy'], ['superficial', 'deep'], ['superior', 'inferior'], ['supernatural', 'natural'], ['support', 'oppose'],
      ['suppose', 'know'], ['supreme', 'lowest'], ['sure', 'unsure'], ['surface', 'depth'], ['surplus', 'deficit'],
      ['surprise', 'expectation'], ['surrender', 'resist'], ['surround', 'free'], ['survive', 'perish'], ['suspect', 'trust'],
      ['suspend', 'continue'], ['suspicious', 'trusting'], ['sustain', 'destroy'], ['swallow', 'spit'], ['sweet', 'sour'],
      ['swift', 'slow'], ['sympathetic', 'unsympathetic'], ['sympathy', 'antipathy'], ['synthetic', 'natural'], ['systematic', 'random'],
      // Additional antonyms
      ['abundance', 'scarcity'], ['accelerate', 'decelerate'], ['accurate', 'inaccurate'], ['acoustic', 'electric'], ['active', 'passive'],
      ['actual', 'theoretical'], ['acute', 'chronic'], ['adhesive', 'slippery'], ['adjacent', 'distant'], ['admire', 'despise'],
      ['advantage', 'disadvantage'], ['affirmative', 'negative'], ['aggressive', 'passive'], ['agile', 'clumsy'], ['amateur', 'professional'],
      ['ambiguous', 'clear'], ['amplify', 'reduce'], ['analog', 'digital'], ['analyze', 'synthesize'], ['ancestor', 'descendant'],
      ['angle', 'straight'], ['animate', 'inanimate'], ['anonymous', 'identified'], ['anterior', 'posterior'], ['appetite', 'aversion'],
      ['applaud', 'boo'], ['appreciate', 'depreciate'], ['approve', 'disapprove'], ['arbitrary', 'reasoned'], ['arrogant', 'modest'],
      ['articulate', 'inarticulate'], ['artificial', 'genuine'], ['ascetic', 'hedonistic'], ['assemble', 'dismantle'], ['assertive', 'meek'],
      ['asset', 'liability'], ['astonish', 'bore'], ['attached', 'detached'], ['attentive', 'inattentive'], ['attractive', 'repulsive'],
      ['authentic', 'counterfeit'], ['authoritarian', 'permissive'], ['automatic', 'manual'], ['available', 'unavailable'], ['awake', 'asleep'],
      ['aware', 'unaware'], ['awkward', 'graceful'], ['balance', 'imbalance'], ['barren', 'fertile'], ['beautiful', 'ugly'],
      ['beginning', 'ending'], ['belief', 'disbelief'], ['beneficial', 'harmful'], ['benign', 'malignant'], ['bias', 'impartiality'],
      ['bitter', 'sweet'], ['bland', 'spicy'], ['bless', 'curse'], ['bliss', 'misery'], ['blunt', 'pointed'],
      ['boast', 'humble'], ['bold', 'timid'], ['boring', 'exciting'], ['borrow', 'lend'], ['bound', 'free'],
      ['boundless', 'limited'], ['boycott', 'support'], ['brief', 'lengthy'], ['brilliant', 'dull'], ['brittle', 'flexible'],
      ['broad', 'narrow'], ['brutal', 'gentle'], ['bulky', 'compact'], ['burden', 'blessing'], ['busy', 'idle'],
      // Additional antonyms (100+ more)
      ['ancient', 'contemporary'], ['anxious', 'carefree'], ['apathy', 'enthusiasm'], ['approve', 'veto'], ['ascend', 'descend'],
      ['ashamed', 'proud'], ['asleep', 'awake'], ['attract', 'repel'], ['available', 'unavailable'], ['awake', 'asleep'],
      ['aware', 'oblivious'], ['backward', 'progressive'], ['barren', 'fertile'], ['beg', 'offer'], ['begin', 'cease'],
      ['below', 'above'], ['beneficial', 'detrimental'], ['benevolent', 'malevolent'], ['best', 'worst'], ['betray', 'support'],
      ['bitter', 'mild'], ['blame', 'exonerate'], ['bless', 'condemn'], ['bloom', 'wilt'], ['blur', 'clarify'],
      ['bold', 'meek'], ['boost', 'reduce'], ['boundary', 'center'], ['bravery', 'cowardice'], ['breakable', 'unbreakable'],
      ['brighten', 'darken'], ['broad', 'specific'], ['build', 'raze'], ['capable', 'incapable'], ['captivity', 'liberty'],
      ['careless', 'meticulous'], ['casual', 'ceremonial'], ['catch', 'release'], ['cause', 'effect'], ['celebrate', 'lament'],
      ['center', 'periphery'], ['certain', 'uncertain'], ['chaos', 'structure'], ['charge', 'discharge'], ['charitable', 'selfish'],
      ['chase', 'flee'], ['cheap', 'priceless'], ['cheerful', 'melancholy'], ['chief', 'minor'], ['civilized', 'primitive'],
      ['clarity', 'obscurity'], ['clean', 'contaminated'], ['clear', 'opaque'], ['clever', 'foolish'], ['climb', 'fall'],
      ['close', 'remote'], ['coarse', 'delicate'], ['colossal', 'minute'], ['combine', 'separate'], ['comfort', 'distress'],
      ['command', 'obey'], ['common', 'exclusive'], ['compel', 'deter'], ['competent', 'inept'], ['complex', 'elementary'],
      ['compliment', 'criticize'], ['compress', 'decompress'], ['conceal', 'expose'], ['concord', 'discord'], ['condemn', 'absolve'],
      ['confess', 'deny'], ['confidence', 'diffidence'], ['confine', 'liberate'], ['confirm', 'refute'], ['conflict', 'accord'],
      ['conform', 'rebel'], ['confuse', 'enlighten'], ['connect', 'sever'], ['conquer', 'capitulate'], ['conscious', 'comatose'],
      ['consent', 'object'], ['conserve', 'waste'], ['consistent', 'erratic'], ['construct', 'dismantle'], ['consume', 'produce'],
      ['contemporary', 'ancient'], ['content', 'discontent'], ['continue', 'halt'], ['contract', 'expand'], ['contradict', 'confirm'],
      ['contrary', 'similar'], ['convex', 'concave'], ['cool', 'heat'], ['cooperate', 'conflict'], ['cordial', 'antagonistic'],
      ['corporate', 'individual'], ['correct', 'erroneous'], ['corrupt', 'pure'], ['costly', 'inexpensive'], ['courageous', 'craven'],
      ['courteous', 'discourteous'], ['cover', 'uncover'], ['cowardly', 'valiant'], ['create', 'obliterate'], ['credible', 'implausible'],
      ['critical', 'uncritical'], ['crowded', 'deserted'], ['crude', 'sophisticated'], ['cruel', 'compassionate'], ['current', 'outdated'],
      ['cursed', 'blessed'], ['custom', 'novelty'], ['damage', 'restore'], ['damp', 'arid'], ['danger', 'safety'],
      ['dark', 'illuminated'], ['day', 'night'], ['dead', 'alive'], ['deaf', 'hearing'], ['debatable', 'certain'],
      ['decay', 'growth'], ['deceitful', 'truthful'], ['decent', 'improper'], ['decline', 'incline'], ['decrease', 'multiply'],
      ['deep', 'superficial'], ['defect', 'excellence'], ['defend', 'accuse'], ['deficient', 'sufficient'], ['definite', 'ambiguous'],
      // Additional antonyms (100+ more)
      ['delicate', 'robust'], ['deliberate', 'accidental'], ['delighted', 'dismayed'], ['deliver', 'withhold'], ['demand', 'supply'],
      ['democratic', 'autocratic'], ['demolish', 'construct'], ['dense', 'sparse'], ['dependent', 'autonomous'], ['deplete', 'replenish'],
      ['depression', 'elevation'], ['deprive', 'provide'], ['descend', 'ascend'], ['desert', 'oasis'], ['deserve', 'forfeit'],
      ['desire', 'aversion'], ['despair', 'optimism'], ['despise', 'admire'], ['destination', 'origin'], ['destroy', 'create'],
      ['detach', 'fasten'], ['detail', 'overview'], ['deteriorate', 'improve'], ['determined', 'indecisive'], ['detest', 'adore'],
      ['develop', 'regress'], ['deviate', 'conform'], ['devote', 'neglect'], ['devour', 'nibble'], ['dexterous', 'clumsy'],
      ['diagonal', 'straight'], ['dictator', 'democrat'], ['differ', 'agree'], ['difficult', 'effortless'], ['digest', 'expel'],
      ['dignify', 'degrade'], ['diligent', 'lazy'], ['dim', 'brilliant'], ['diminish', 'amplify'], ['dip', 'rise'],
      ['direct', 'indirect'], ['dirty', 'sterile'], ['disadvantage', 'merit'], ['disagree', 'concur'], ['disappear', 'materialize'],
      ['disappoint', 'satisfy'], ['disapprove', 'endorse'], ['disarm', 'fortify'], ['disaster', 'triumph'], ['disbelief', 'faith'],
      ['discard', 'retain'], ['discharge', 'absorb'], ['discipline', 'chaos'], ['disclose', 'conceal'], ['discomfort', 'ease'],
      ['disconnect', 'link'], ['discontent', 'satisfaction'], ['discontinue', 'proceed'], ['discord', 'harmony'], ['discourage', 'inspire'],
      ['discover', 'overlook'], ['discreet', 'obvious'], ['discrete', 'continuous'], ['discriminate', 'tolerate'], ['disdain', 'respect'],
      ['disease', 'health'], ['disgrace', 'honor'], ['disguise', 'reveal'], ['disgust', 'delight'], ['dishonest', 'truthful'],
      ['disintegrate', 'coalesce'], ['disinterested', 'biased'], ['dislike', 'favor'], ['disloyal', 'faithful'], ['dismal', 'cheerful'],
      ['dismiss', 'hire'], ['disobey', 'comply'], ['disorder', 'system'], ['disorganize', 'arrange'], ['disparage', 'praise'],
      ['disperse', 'gather'], ['displace', 'settle'], ['display', 'hide'], ['displease', 'gratify'], ['disproportionate', 'balanced'],
      ['disprove', 'verify'], ['dispute', 'agreement'], ['disqualify', 'certify'], ['disregard', 'heed'], ['disrepair', 'maintenance'],
      ['disrespect', 'reverence'], ['disrupt', 'stabilize'], ['dissatisfaction', 'contentment'], ['dissent', 'assent'], ['dissolve', 'solidify'],
      ['dissuade', 'encourage'], ['distance', 'proximity'], ['distant', 'adjacent'], ['distaste', 'fondness'], ['distort', 'clarify'],
      ['distract', 'focus'], ['distribute', 'collect'], ['distrust', 'confidence'], ['disturb', 'calm'], ['diverse', 'uniform'],
      ['divert', 'redirect'], ['divide', 'unite'], ['divine', 'mortal'], ['division', 'multiplication'], ['divorce', 'marriage'],
      ['docile', 'rebellious'], ['doctor', 'patient'], ['domestic', 'foreign'], ['dominant', 'submissive'], ['donate', 'receive'],
      ['doom', 'salvation'], ['dormant', 'active'], ['doubt', 'certainty'], ['downward', 'upward'], ['drab', 'vivid'],
      ['draft', 'finalize'], ['drag', 'propel'], ['drain', 'fill'], ['dramatic', 'subtle'], ['drastic', 'moderate'],
      ['draw', 'repel'], ['dread', 'anticipation'], ['dreary', 'lively'], ['drench', 'dry'], ['drift', 'anchor'],
      ['drip', 'gush'], ['drop', 'lift'], ['drown', 'rescue'], ['drowsy', 'alert'], ['dry', 'humid'],
      ['dull', 'sharp'], ['dumb', 'articulate'], ['durable', 'fragile'], ['dusk', 'dawn'], ['dust', 'polish'],
      ['dwarf', 'giant'], ['dwell', 'depart'], ['dwindle', 'flourish'], ['dynamic', 'static'], ['eager', 'reluctant'],
      // Additional 1000+ antonyms for more variety
      ['earn', 'forfeit'], ['earnest', 'flippant'], ['earth', 'heaven'], ['ease', 'hardship'], ['eastern', 'western'],
      ['easy', 'arduous'], ['ebb', 'flow'], ['eccentric', 'conventional'], ['echo', 'silence'], ['eclipse', 'illuminate'],
      ['economic', 'wasteful'], ['ecstasy', 'agony'], ['edible', 'inedible'], ['educate', 'misinform'], ['effective', 'ineffective'],
      ['efficient', 'inefficient'], ['effort', 'ease'], ['effortless', 'strenuous'], ['egalitarian', 'hierarchical'], ['elaborate', 'simplify'],
      ['elastic', 'rigid'], ['elated', 'depressed'], ['elder', 'younger'], ['elect', 'depose'], ['elegant', 'crude'],
      ['elevate', 'lower'], ['eligible', 'ineligible'], ['eliminate', 'include'], ['elite', 'common'], ['eloquent', 'inarticulate'],
      ['elude', 'confront'], ['emancipate', 'enslave'], ['embark', 'disembark'], ['embarrass', 'assure'], ['embellish', 'simplify'],
      ['embrace', 'reject'], ['emerge', 'submerge'], ['emigrate', 'immigrate'], ['eminent', 'obscure'], ['emit', 'absorb'],
      ['emotional', 'rational'], ['empathy', 'apathy'], ['emphasize', 'deemphasize'], ['employ', 'dismiss'], ['empower', 'disempower'],
      ['empress', 'emperor'], ['empty', 'replete'], ['enable', 'prevent'], ['enact', 'repeal'], ['enchant', 'repel'],
      ['enclose', 'open'], ['encode', 'decode'], ['encounter', 'avoid'], ['encourage', 'discourage'], ['encumber', 'free'],
      ['endanger', 'protect'], ['endeavor', 'abandon'], ['endless', 'finite'], ['endorse', 'oppose'], ['endow', 'deprive'],
      ['endurance', 'weakness'], ['endure', 'succumb'], ['enemy', 'friend'], ['energize', 'deplete'], ['enforce', 'waive'],
      ['engage', 'disengage'], ['engross', 'bore'], ['enhance', 'diminish'], ['enigma', 'clarity'], ['enjoy', 'suffer'],
      ['enlarge', 'reduce'], ['enlighten', 'confuse'], ['enlist', 'discharge'], ['enliven', 'deaden'], ['enmity', 'friendship'],
      ['enormous', 'tiny'], ['enrage', 'pacify'], ['enrich', 'impoverish'], ['enroll', 'withdraw'], ['enslave', 'liberate'],
      ['ensue', 'precede'], ['ensure', 'jeopardize'], ['entangle', 'unravel'], ['enterprise', 'idleness'], ['entertain', 'bore'],
      ['enthusiasm', 'indifference'], ['entice', 'discourage'], ['entire', 'partial'], ['entitle', 'disentitle'], ['entity', 'nothing'],
      ['entrance', 'departure'], ['entrap', 'release'], ['entreat', 'command'], ['entrench', 'uproot'], ['entrust', 'withhold'],
      ['entry', 'exit'], ['enumerate', 'omit'], ['enunciate', 'mumble'], ['envelop', 'expose'], ['enviable', 'pitiable'],
      ['envious', 'content'], ['environment', 'organism'], ['envision', 'overlook'], ['ephemeral', 'eternal'], ['epic', 'trivial'],
      ['epidemic', 'isolated'], ['epilogue', 'prologue'], ['episode', 'continuation'], ['epitome', 'antithesis'], ['epoch', 'moment'],
      ['equable', 'variable'], ['equal', 'unequal'], ['equalize', 'differentiate'], ['equanimity', 'agitation'], ['equate', 'differentiate'],
      ['equator', 'pole'], ['equilibrium', 'imbalance'], ['equip', 'strip'], ['equitable', 'unfair'], ['equity', 'debt'],
      ['equivalent', 'different'], ['equivocal', 'clear'], ['eradicate', 'establish'], ['erase', 'write'], ['erect', 'demolish'],
      ['erode', 'build'], ['err', 'correct'], ['errand', 'mission'], ['erratic', 'consistent'], ['erroneous', 'accurate'],
      ['error', 'accuracy'], ['erudite', 'ignorant'], ['erupt', 'subside'], ['escalate', 'deescalate'], ['escape', 'capture'],
      ['eschew', 'embrace'], ['escort', 'abandon'], ['esoteric', 'exoteric'], ['especial', 'general'], ['espouse', 'reject'],
      ['essence', 'accident'], ['essential', 'superfluous'], ['establish', 'abolish'], ['esteem', 'disdain'], ['estimate', 'measure'],
      ['estrange', 'reconcile'], ['eternal', 'temporal'], ['ethereal', 'corporeal'], ['ethical', 'unethical'], ['ethnic', 'universal'],
      ['eulogize', 'criticize'], ['euphemism', 'dysphemism'], ['euphoria', 'dysphoria'], ['evacuate', 'occupy'], ['evade', 'confront'],
      ['evaluate', 'ignore'], ['evanescent', 'permanent'], ['evangelical', 'secular'], ['evaporate', 'condense'], ['evasion', 'frankness'],
      ['evasive', 'direct'], ['even', 'uneven'], ['eventual', 'immediate'], ['everlasting', 'transient'], ['everyday', 'special'],
      ['evict', 'admit'], ['evidence', 'conjecture'], ['evident', 'obscure'], ['evil', 'virtuous'], ['evoke', 'suppress'],
      ['evolve', 'devolve'], ['exact', 'imprecise'], ['exacting', 'lenient'], ['exaggerate', 'minimize'], ['exalt', 'abase'],
      ['examine', 'overlook'], ['example', 'exception'], ['exasperate', 'soothe'], ['excavate', 'fill'], ['exceed', 'fall short'],
      ['excel', 'fail'], ['excellent', 'poor'], ['except', 'include'], ['exceptional', 'ordinary'], ['excess', 'shortage'],
      ['excessive', 'moderate'], ['exchange', 'keep'], ['excite', 'bore'], ['exciting', 'dull'], ['exclaim', 'whisper'],
      ['exclude', 'include'], ['exclusive', 'inclusive'], ['excommunicate', 'accept'], ['exculpate', 'incriminate'], ['excuse', 'accuse'],
      ['execute', 'spare'], ['exemplary', 'deplorable'], ['exempt', 'liable'], ['exercise', 'rest'], ['exert', 'relax'],
      ['exhale', 'inhale'], ['exhaust', 'energize'], ['exhausted', 'refreshed'], ['exhaustive', 'cursory'], ['exhibit', 'conceal'],
      ['exhilarate', 'depress'], ['exhort', 'dissuade'], ['exhume', 'bury'], ['exile', 'repatriate'], ['exist', 'perish'],
      ['existence', 'nonexistence'], ['exit', 'entry'], ['exonerate', 'convict'], ['exorbitant', 'reasonable'], ['exotic', 'native'],
      ['expand', 'contract'], ['expanse', 'confine'], ['expansive', 'narrow'], ['expatriate', 'repatriate'], ['expect', 'doubt'],
      ['expectation', 'surprise'], ['expedient', 'inexpedient'], ['expedite', 'delay'], ['expedition', 'retreat'], ['expel', 'admit'],
      ['expend', 'conserve'], ['expenditure', 'income'], ['expense', 'profit'], ['experience', 'inexperience'], ['experienced', 'novice'],
      ['experiment', 'theory'], ['expert', 'amateur'], ['expertise', 'ignorance'], ['expiate', 'sin'], ['expiration', 'inception'],
      ['expire', 'begin'], ['explain', 'confuse'], ['explicit', 'implicit'], ['explode', 'implode'], ['exploit', 'protect'],
      ['exploration', 'settlement'], ['explore', 'avoid'], ['explosion', 'implosion'], ['explosive', 'stable'], ['exponent', 'base'],
      ['export', 'import'], ['expose', 'cover'], ['exposition', 'conclusion'], ['exposure', 'shelter'], ['expound', 'conceal'],
      ['express', 'suppress'], ['expression', 'suppression'], ['expressive', 'impassive'], ['expropriate', 'return'], ['expulsion', 'admission'],
      ['expunge', 'record'], ['exquisite', 'crude'], ['extant', 'extinct'], ['extemporaneous', 'prepared'], ['extend', 'retract'],
      ['extension', 'retraction'], ['extensive', 'limited'], ['extent', 'limitation'], ['extenuate', 'aggravate'], ['exterior', 'core'],
      ['exterminate', 'preserve'], ['external', 'internal'], ['extinct', 'extant'], ['extinction', 'survival'], ['extinguish', 'ignite'],
      ['extol', 'condemn'], ['extort', 'give'], ['extra', 'missing'], ['extract', 'insert'], ['extraction', 'insertion'],
      ['extradite', 'harbor'], ['extraneous', 'essential'], ['extraordinary', 'commonplace'], ['extravagance', 'frugality'], ['extravagant', 'economical'],
      ['extreme', 'moderate'], ['extremist', 'moderate'], ['extremity', 'center'], ['extricate', 'entangle'], ['extrinsic', 'intrinsic'],
      ['exuberant', 'subdued'], ['exude', 'absorb'], ['exult', 'lament'], ['exultant', 'dejected'], ['fable', 'fact'],
      ['fabricate', 'destroy'], ['fabulous', 'ordinary'], ['facade', 'interior'], ['face', 'back'], ['facet', 'whole'],
      ['facetious', 'serious'], ['facile', 'difficult'], ['facilitate', 'hinder'], ['facility', 'difficulty'], ['facsimile', 'original'],
      ['faction', 'unity'], ['factious', 'united'], ['factor', 'product'], ['factual', 'fictional'], ['faculty', 'inability'],
      ['fade', 'intensify'], ['fading', 'growing'], ['fahrenheit', 'celsius'], ['failing', 'success'], ['faint', 'strong'],
      ['fair', 'foul'], ['fairness', 'injustice'], ['fairy', 'demon'], ['faith', 'doubt'], ['fake', 'authentic'],
      ['fakir', 'materialist'], ['fallacious', 'valid'], ['fallacy', 'truth'], ['fallible', 'infallible'], ['fallow', 'cultivated'],
      ['false', 'genuine'], ['falsehood', 'truth'], ['falsify', 'verify'], ['falter', 'persevere'], ['familiar', 'strange'],
      ['familiarity', 'ignorance'], ['famine', 'abundance'], ['famished', 'satiated'], ['famous', 'unknown'], ['fanatic', 'moderate'],
      ['fanatical', 'tolerant'], ['fanaticism', 'moderation'], ['fanciful', 'realistic'], ['fancy', 'plain'], ['fanfare', 'silence'],
      ['fantastic', 'realistic'], ['fantasy', 'reality'], ['far', 'close'], ['faraway', 'nearby'], ['farce', 'tragedy'],
      ['farcical', 'serious'], ['fare', 'fast'], ['farewell', 'greeting'], ['farm', 'city'], ['farmer', 'urbanite'],
      ['fascinate', 'repel'], ['fascinating', 'boring'], ['fascination', 'repulsion'], ['fascism', 'democracy'], ['fashion', 'obsolescence'],
      ['fashionable', 'unfashionable'], ['fast', 'sluggish'], ['fasten', 'unfasten'], ['fastidious', 'careless'], ['fat', 'skinny'],
      ['fatal', 'harmless'], ['fate', 'freewill'], ['fateful', 'insignificant'], ['fathom', 'misunderstand'], ['fatigue', 'vigor'],
      ['fatten', 'slim'], ['fatty', 'lean'], ['fatuous', 'sensible'], ['fault', 'virtue'], ['faultless', 'flawed'],
      ['faulty', 'perfect'], ['fauna', 'flora'], ['favorable', 'adverse'], ['favorite', 'least liked'], ['fawn', 'defy'],
      ['faze', 'encourage'], ['fear', 'bravery'], ['fearful', 'brave'], ['fearless', 'afraid'], ['fearsome', 'harmless'],
      ['feasible', 'impossible'], ['feast', 'famine'], ['feat', 'failure'], ['feather', 'lead'], ['feature', 'bug'],
      ['fecund', 'barren'], ['federal', 'local'], ['feeble', 'mighty'], ['feed', 'starve'], ['feedback', 'silence'],
      ['feel', 'numb'], ['feeling', 'numbness'], ['feign', 'reveal'], ['feint', 'genuine'], ['felicity', 'misery'],
      ['feline', 'canine'], ['fell', 'gentle'], ['fellow', 'stranger'], ['fellowship', 'isolation'], ['felon', 'citizen'],
      ['felony', 'misdemeanor'], ['female', 'male'], ['feminine', 'masculine'], ['feminism', 'chauvinism'], ['fence', 'opening'],
      ['fend', 'attack'], ['feral', 'domesticated'], ['ferment', 'calm'], ['ferocious', 'gentle'], ['ferocity', 'mildness'],
      ['ferry', 'bridge'], ['fertile', 'infertile'], ['fertility', 'sterility'], ['fervent', 'apathetic'], ['fervid', 'cool'],
      ['fervor', 'indifference'], ['fester', 'heal'], ['festival', 'mourning'], ['festive', 'somber'], ['festivity', 'gloom'],
      ['fetch', 'discard'], ['fetid', 'fragrant'], ['fetter', 'liberate'], ['feud', 'alliance'], ['feudal', 'modern'],
      ['fever', 'chill'], ['feverish', 'calm'], ['few', 'numerous'], ['fey', 'earthly'], ['fiat', 'negotiation'],
      ['fib', 'truth'], ['fickle', 'steadfast'], ['fiction', 'nonfiction'], ['fictional', 'factual'], ['fiddle', 'work'],
      ['fidelity', 'infidelity'], ['fidget', 'stillness'], ['fiduciary', 'beneficiary'], ['field', 'laboratory'], ['fiend', 'angel'],
      ['fiendish', 'angelic'], ['fierce', 'mild'], ['fiery', 'cool'], ['fight', 'peace'], ['fighter', 'pacifist'],
      ['figment', 'reality'], ['figurative', 'literal'], ['figure', 'ground'], ['filch', 'return'], ['file', 'discard'],
      ['filial', 'parental'], ['fill', 'empty'], ['fillet', 'whole'], ['film', 'reality'], ['filter', 'pass'],
      ['filth', 'cleanliness'], ['filthy', 'spotless'], ['final', 'preliminary'], ['finale', 'prelude'], ['finality', 'possibility'],
      ['finalize', 'begin'], ['finally', 'initially'], ['finance', 'bankrupt'], ['financial', 'nonfinancial'], ['find', 'misplace'],
      ['fine', 'coarse'], ['finesse', 'clumsiness'], ['finger', 'palm'], ['finicky', 'easygoing'], ['finish', 'start'],
      ['finished', 'unfinished'], ['finite', 'limitless'], ['fir', 'palm'], ['fire', 'ice'], ['firearm', 'peace'],
      ['fireproof', 'flammable'], ['firm', 'shaky'], ['firmament', 'earth'], ['firmness', 'weakness'], ['first', 'ultimate'],
      ['fiscal', 'nonfiscal'], ['fish', 'fowl'], ['fisherman', 'hunter'], ['fishing', 'hunting'], ['fission', 'fusion'],
      ['fist', 'palm'], ['fit', 'unfit'], ['fitness', 'unfitness'], ['fitting', 'inappropriate'], ['five', 'ten'],
      ['fixate', 'ignore'], ['fixed', 'mobile'], ['fixture', 'temporary'], ['fizz', 'flatness'], ['fizzle', 'succeed'],
      ['flabby', 'toned'], ['flaccid', 'firm'], ['flag', 'wave'], ['flagrant', 'subtle'], ['flair', 'ineptitude'],
      ['flak', 'praise'], ['flamboyant', 'modest'], ['flame', 'extinguish'], ['flaming', 'extinguished'], ['flammable', 'fireproof'],
      ['flank', 'center'], ['flap', 'stillness'], ['flare', 'fade'], ['flash', 'darkness'], ['flashy', 'plain'],
      ['flat', 'bumpy'], ['flatten', 'raise'], ['flatter', 'insult'], ['flattering', 'unflattering'], ['flattery', 'criticism'],
      ['flaunt', 'hide'], ['flavor', 'blandness'], ['flavorful', 'tasteless'], ['flaw', 'perfection'], ['flawed', 'flawless'],
      ['flawless', 'defective'], ['flay', 'cover'], ['fledgling', 'veteran'], ['flee', 'pursue'], ['fleece', 'give'],
      ['fleet', 'slow'], ['fleeting', 'lasting'], ['flesh', 'spirit'], ['fleshy', 'skeletal'], ['flex', 'stiffen'],
      ['flexibility', 'rigidity'], ['flexible', 'inflexible'], ['flicker', 'blaze'], ['flier', 'pedestrian'], ['flight', 'landing'],
      ['flighty', 'stable'], ['flimsy', 'solid'], ['flinch', 'advance'], ['fling', 'hold'], ['flip', 'maintain'],
      ['flippant', 'serious'], ['flirt', 'ignore'], ['flit', 'stay'], ['float', 'submerge'], ['flock', 'individual'],
      ['flog', 'reward'], ['flood', 'drought'], ['floor', 'roof'], ['flop', 'succeed'], ['flora', 'fauna'],
      ['floral', 'faunal'], ['florid', 'pale'], ['florist', 'undertaker'], ['flotsam', 'treasure'], ['flounce', 'stay'],
      ['flounder', 'succeed'], ['flourish', 'decline'], ['flout', 'obey'], ['flow', 'stagnate'], ['flower', 'wither'],
      ['flowery', 'plain'], ['flowing', 'static'], ['fluctuate', 'stabilize'], ['fluctuation', 'stability'], ['fluency', 'hesitation'],
      ['fluent', 'halting'], ['fluid', 'rigid'], ['fluidity', 'solidity'], ['fluke', 'certainty'], ['flunk', 'pass'],
      ['fluorescent', 'dim'], ['flurry', 'calm'], ['flush', 'pale'], ['flushed', 'pallid'], ['fluster', 'calm'],
      ['flustered', 'composed'], ['flute', 'drum'], ['flutter', 'steady'], ['flux', 'stability'], ['fly', 'crawl'],
      ['flying', 'grounded'], ['foam', 'solid'], ['focal', 'peripheral'], ['focus', 'distract'], ['focused', 'scattered'],
      ['fodder', 'feast'], ['foe', 'ally'], ['fog', 'clarity'], ['foggy', 'clear'], ['foible', 'strength'],
      ['foil', 'assist'], ['foist', 'refuse'], ['fold', 'unfold'], ['folded', 'flat'], ['foliage', 'branches'],
      ['folk', 'elite'], ['folklore', 'science'], ['follow', 'precede'], ['follower', 'leader'], ['following', 'preceding'],
      ['folly', 'wisdom'], ['foment', 'suppress'], ['fond', 'averse'], ['fondle', 'push'], ['fondness', 'dislike'],
      ['food', 'poison'], ['fool', 'sage'], ['foolhardy', 'cautious'], ['foolish', 'prudent'], ['foolishness', 'wisdom'],
      ['foot', 'head'], ['footage', 'summary'], ['foothold', 'fall'], ['footnote', 'text'], ['footpath', 'highway'],
      ['footprint', 'erasure'], ['fop', 'slob'], ['foppish', 'slovenly'], ['forage', 'hunt'], ['foray', 'retreat'],
      ['forbear', 'act'], ['forbearance', 'intolerance'], ['forbearing', 'impatient'], ['forbid', 'permit'], ['forbidden', 'allowed'],
      ['forbidding', 'inviting'], ['force', 'weakness'], ['forced', 'voluntary'], ['forceful', 'feeble'], ['forcible', 'gentle'],
      ['ford', 'bridge'], ['fore', 'aft'], ['foreboding', 'optimism'], ['forecast', 'hindsight'], ['forefather', 'descendant'],
      ['forego', 'indulge'], ['foregoing', 'following'], ['foregone', 'uncertain'], ['foreground', 'background'], ['forehand', 'backhand'],
      ['forehead', 'chin'], ['foreign', 'native'], ['foreigner', 'native'], ['foreknowledge', 'ignorance'], ['foreman', 'worker'],
      ['foremost', 'last'], ['forensic', 'domestic'], ['forerunner', 'follower'], ['foresee', 'overlook'], ['foreshadow', 'obscure'],
      ['foresight', 'hindsight'], ['forest', 'plain'], ['forestall', 'allow'], ['forester', 'urbanite'], ['foretell', 'report'],
      ['forethought', 'impulsiveness'], ['forever', 'temporarily'], ['forewarn', 'surprise'], ['foreword', 'epilogue'], ['forfeit', 'win'],
      ['forfeiture', 'acquisition'], ['forge', 'destroy'], ['forged', 'authentic'], ['forger', 'artist'], ['forgery', 'original'],
      ['forget', 'recall'], ['forgetful', 'mindful'], ['forgetfulness', 'memory'], ['forgettable', 'memorable'], ['forgivable', 'unforgivable'],
      ['forgive', 'resent'], ['forgiveness', 'vengeance'], ['forgiving', 'unforgiving'], ['forgo', 'take'], ['forgotten', 'remembered'],
      ['fork', 'merge'], ['forked', 'straight'], ['forlorn', 'cheerful'], ['form', 'destroy'], ['formal', 'casual'],
      ['formality', 'informality'], ['formalize', 'improvise'], ['format', 'chaos'], ['formation', 'dissolution'], ['formative', 'destructive'],
      ['formed', 'formless'], ['former', 'current'], ['formerly', 'currently'], ['formidable', 'weak'], ['formless', 'formed'],
      ['formula', 'randomness'], ['formulaic', 'original'], ['formulate', 'improvise'], ['formulation', 'improvisation'], ['fornicate', 'abstain'],
      ['forsake', 'embrace'], ['forsaken', 'loved'], ['forswear', 'vow'], ['fort', 'field'], ['forte', 'weakness'],
      ['forth', 'back'], ['forthcoming', 'reticent'], ['forthright', 'evasive'], ['forthrightness', 'deception'], ['forthwith', 'eventually'],
      ['fortification', 'vulnerability'], ['fortified', 'exposed'], ['fortify', 'weaken'], ['fortitude', 'weakness'], ['fortress', 'camp'],
      ['fortuitous', 'planned'], ['fortunate', 'unfortunate'], ['fortune', 'misfortune'], ['forward', 'reverse'], ['forwardness', 'shyness'],
      ['fossil', 'living'], ['fossilize', 'evolve'], ['foster', 'discourage'], ['foul', 'clean'], ['found', 'lost'],
      ['foundation', 'roof'], ['founder', 'succeed'], ['founding', 'dissolution'], ['fount', 'outlet'], ['fountain', 'drain'],
      ['four', 'one'], ['fowl', 'fish'], ['fox', 'hound'], ['foxy', 'naive'], ['foyer', 'backroom'],
      ['fraction', 'whole'], ['fractional', 'complete'], ['fractious', 'cooperative'], ['fracture', 'mend'], ['fractured', 'intact'],
      ['fragile', 'durable'], ['fragility', 'strength'], ['fragment', 'whole'], ['fragmentary', 'complete'], ['fragmentation', 'unification'],
      ['fragmented', 'unified'], ['fragrance', 'stench'], ['fragrant', 'malodorous'], ['frail', 'strong'], ['frailty', 'vigor'],
      ['frame', 'destroy'], ['framework', 'chaos'], ['franchise', 'disenfranchise'], ['frank', 'secretive'], ['frankness', 'deception'],
      ['frantic', 'composed'], ['fraternal', 'hostile'], ['fraternity', 'sorority'], ['fraternize', 'shun'], ['fraud', 'honesty'],
      ['fraudulent', 'honest'], ['fraught', 'empty'], ['fray', 'mend'], ['frayed', 'intact'], ['freak', 'normal'],
      // Additional 300+ antonyms for more variety and depth
      ['galvanize', 'discourage'], ['gather', 'disperse'], ['gauge', 'guess'], ['gaze', 'glance'], ['general', 'specific'],
      ['generate', 'consume'], ['genesis', 'end'], ['genial', 'unfriendly'], ['genius', 'idiot'], ['genuine', 'fake'],
      ['germane', 'irrelevant'], ['germinate', 'wither'], ['gesture', 'stillness'], ['ghastly', 'beautiful'], ['giant', 'miniature'],
      ['giddy', 'serious'], ['gift', 'burden'], ['gigantic', 'microscopic'], ['gild', 'tarnish'], ['gingerly', 'recklessly'],
      ['gist', 'detail'], ['gladden', 'sadden'], ['glamor', 'drabness'], ['glance', 'stare'], ['glare', 'shade'],
      ['glaring', 'subtle'], ['gleam', 'dullness'], ['glee', 'sorrow'], ['glib', 'sincere'], ['glide', 'stumble'],
      ['glimmer', 'darkness'], ['glimpse', 'survey'], ['glisten', 'dull'], ['glitter', 'fade'], ['gloat', 'commiserate'],
      ['global', 'local'], ['gloom', 'brightness'], ['glorify', 'shame'], ['glory', 'disgrace'], ['gloss', 'explain'],
      ['glossy', 'matte'], ['glow', 'fade'], ['glower', 'smile'], ['glum', 'cheerful'], ['glut', 'shortage'],
      ['glutton', 'ascetic'], ['gnarled', 'smooth'], ['gnaw', 'soothe'], ['goal', 'origin'], ['godly', 'sinful'],
      ['golden', 'leaden'], ['gorgeous', 'ugly'], ['gory', 'bloodless'], ['gossamer', 'heavy'], ['govern', 'obey'],
      ['grace', 'clumsiness'], ['gracious', 'rude'], ['grade', 'unrank'], ['gradual', 'abrupt'], ['graduate', 'dropout'],
      ['graft', 'remove'], ['grain', 'powder'], ['grand', 'humble'], ['granite', 'sand'], ['grant', 'refuse'],
      ['granular', 'smooth'], ['graphic', 'vague'], ['grasp', 'release'], ['grasping', 'generous'], ['grateful', 'ungrateful'],
      ['gratification', 'frustration'], ['gratify', 'disappoint'], ['gratis', 'paid'], ['gratitude', 'ingratitude'], ['gratuity', 'payment'],
      ['grave', 'trivial'], ['gravitate', 'repel'], ['gravity', 'levity'], ['graze', 'miss'], ['grease', 'degrease'],
      ['greasy', 'dry'], ['great', 'small'], ['greater', 'lesser'], ['greatest', 'least'], ['greed', 'charity'],
      ['greedy', 'satisfied'], ['green', 'ripe'], ['greenhorn', 'veteran'], ['greet', 'ignore'], ['greeting', 'farewell'],
      ['gregarious', 'solitary'], ['grey', 'colorful'], ['grid', 'chaos'], ['grief', 'joy'], ['grievance', 'contentment'],
      ['grieve', 'rejoice'], ['grievous', 'minor'], ['grill', 'freeze'], ['grime', 'cleanliness'], ['grimy', 'clean'],
      ['grin', 'scowl'], ['grind', 'polish'], ['grip', 'slip'], ['grisly', 'pleasant'], ['grit', 'smoothness'],
      ['groan', 'laugh'], ['groggy', 'alert'], ['groom', 'neglect'], ['groove', 'ridge'], ['grope', 'find'],
      ['gross', 'net'], ['grotesque', 'beautiful'], ['grouch', 'optimist'], ['grouchy', 'cheerful'], ['ground', 'sky'],
      ['grounded', 'airborne'], ['groundless', 'founded'], ['group', 'individual'], ['grovel', 'dominate'], ['growl', 'purr'],
      ['grown', 'immature'], ['growth', 'decline'], ['grudge', 'forgiveness'], ['grudging', 'eager'], ['gruesome', 'pleasant'],
      ['gruff', 'gentle'], ['grumble', 'praise'], ['grumpy', 'pleasant'], ['grunt', 'articulate'], ['guarantee', 'risk'],
      ['guaranteed', 'uncertain'], ['guard', 'expose'], ['guarded', 'open'], ['guardian', 'ward'], ['guess', 'know'],
      ['guesswork', 'certainty'], ['guest', 'host'], ['guidance', 'confusion'], ['guide', 'mislead'], ['guild', 'individual'],
      ['guileless', 'cunning'], ['guilt', 'innocence'], ['guiltless', 'guilty'], ['guilty', 'innocent'], ['guise', 'reality'],
      ['gulch', 'peak'], ['gulf', 'isthmus'], ['gullible', 'skeptical'], ['gulp', 'sip'], ['gush', 'trickle'],
      ['gushy', 'reserved'], ['gust', 'calm'], ['gusto', 'reluctance'], ['gusty', 'calm'], ['gut', 'exterior'],
      ['gutter', 'peak'], ['guttural', 'melodious'], ['habit', 'innovation'], ['habitable', 'uninhabitable'], ['habitation', 'wilderness'],
      ['hack', 'create'], ['hackle', 'smooth'], ['haft', 'blade'], ['hag', 'beauty'], ['haggard', 'fresh'],
      ['haggle', 'agree'], ['hail', 'condemn'], ['hale', 'sickly'], ['half', 'whole'], ['halfhearted', 'enthusiastic'],
      ['hallmark', 'flaw'], ['hallow', 'desecrate'], ['hallowed', 'profane'], ['hallucinate', 'perceive'], ['hallucination', 'reality'],
      ['halt', 'continue'], ['halting', 'fluent'], ['halve', 'double'], ['ham', 'professional'], ['hamburger', 'steak'],
      ['hamlet', 'metropolis'], ['hamper', 'facilitate'], ['hamstring', 'empower'], ['hand', 'foot'], ['handful', 'abundance'],
      ['handicap', 'advantage'], ['handle', 'mishandle'], ['handmade', 'manufactured'], ['handsome', 'ugly'], ['handy', 'awkward'],
      ['hang', 'stand'], ['hanger-on', 'leader'], ['hanging', 'standing'], ['hangover', 'sobriety'], ['hanker', 'spurn'],
      ['hap', 'misfortune'], ['haphazard', 'systematic'], ['hapless', 'fortunate'], ['happen', 'prevent'], ['happening', 'static'],
      ['happiness', 'misery'], ['happy', 'unhappy'], ['happy-go-lucky', 'anxious'], ['harangue', 'praise'], ['harass', 'soothe'],
      ['harbinger', 'follower'], ['harbor', 'expel'], ['hard', 'easy'], ['hard-boiled', 'soft'], ['hard-core', 'moderate'],
      ['hard-hearted', 'compassionate'], ['harden', 'soften'], ['hardened', 'tender'], ['hardheaded', 'emotional'], ['hardhearted', 'kind'],
      ['hardiness', 'frailty'], ['hardly', 'frequently'], ['hardness', 'softness'], ['hardship', 'comfort'], ['hardware', 'software'],
      ['hardy', 'delicate'], ['harebrained', 'sensible'], ['hark', 'ignore'], ['harm', 'benefit'], ['harmless', 'dangerous'],
      ['harmonic', 'discordant'], ['harmonious', 'discordant'], ['harmonize', 'clash'], ['harmony', 'discord'], ['harness', 'free'],
      ['harp', 'praise'], ['harridan', 'angel'], ['harried', 'relaxed'], ['harrow', 'soothe'], ['harrowing', 'comforting'],
      ['harsh', 'gentle'], ['harshness', 'kindness'], ['harvest', 'plant'], ['haste', 'delay'], ['hasten', 'dawdle'],
      ['hasty', 'careful'], ['hatch', 'close'], ['hate', 'adore'], ['hateful', 'lovable'], ['hater', 'lover'],
      ['hatred', 'affection'], ['haughtiness', 'humility'], ['haughty', 'humble'], ['haul', 'push'], ['haunt', 'avoid'],
      ['have', 'lack'], ['haven', 'danger'], ['havoc', 'order'], ['hawk', 'dove'], ['hawkish', 'dovish'],
      ['haystack', 'needle'], ['hazard', 'safety'], ['hazardous', 'safe'], ['haze', 'clarity'], ['hazy', 'clear'],
      ['head', 'tail'], ['headfirst', 'feetfirst'], ['heading', 'following'], ['headland', 'bay'], ['headline', 'detail'],
      ['headlong', 'cautious'], ['headstrong', 'compliant'], ['headway', 'setback'], ['heady', 'sobering'], ['heal', 'injure'],
      ['healer', 'destroyer'], ['healing', 'harmful'], ['health', 'illness'], ['healthful', 'unhealthy'], ['healthy', 'sick'],
      ['heap', 'scatter'], ['hear', 'ignore'], ['hearer', 'speaker'], ['hearing', 'deaf'], ['hearken', 'ignore'],
      ['hearsay', 'evidence'], ['heart', 'mind'], ['heartache', 'joy'], ['heartbreak', 'happiness'], ['heartbroken', 'elated'],
      ['hearten', 'discourage'], ['heartfelt', 'insincere'], ['heartless', 'compassionate'], ['heartrending', 'uplifting'], ['heartsick', 'joyful'],
      ['heartwarming', 'heartbreaking'], ['hearty', 'weak'], ['heat', 'cold'], ['heated', 'cool'], ['heathen', 'believer'],
      ['heave', 'settle'], ['heaven', 'earth'], ['heavenly', 'hellish'], ['heaviness', 'lightness'], ['heavy', 'light'],
      ['heavy-handed', 'delicate'], ['heavy-hearted', 'lighthearted'], ['heckle', 'applaud'], ['hectic', 'calm'], ['hedge', 'commit'],
      ['heed', 'disregard'], ['heedful', 'heedless'], ['heedless', 'careful'], ['hefty', 'slight'], ['hegemony', 'subjugation']
    ],
    'same-color': {
      // Color groups: any two items from the same group share the same color
      red: ['blood', 'rose', 'cherry', 'tomato', 'ruby', 'wine', 'strawberry', 'fire', 'crimson', 'scarlet',
            'cardinal', 'poppy', 'ember', 'lava', 'lipstick', 'fire truck', 'cayenne', 'chili', 'vermillion',
            'cardinal bird', 'red apple', 'red pepper', 'cranberry', 'raspberry', 'beet', 'pomegranate', 'watermelon',
            'brick', 'ketchup', 'hot sauce', 'fire engine', 'ladybug', 'valentine', 'stop sign', 'barn', 'radish',
            'red wine', 'burgundy', 'cherry blossom', 'red tulip', 'lobster', 'crab', 'salmon flesh', 'red snapper'],
      blue: ['sky', 'ocean', 'blueberry', 'sapphire', 'dolphin', 'cobalt', 'azure', 'navy', 'midnight', 'indigo',
             'lake', 'river', 'bluebell', 'iris', 'denim', 'bluebonnet', 'lapis', 'cobalt blue', 'navy blue',
             'indigo ink', 'ink', 'midnight blue', 'ultramarine', 'cerulean', 'turquoise', 'sea', 'peacock feather',
             'cornflower', 'periwinkle', 'blue jay', 'bluebird', 'blue whale', 'morning glory', 'forget-me-not',
             'blue moon', 'blue spruce', 'blue morpho', 'police car', 'mailbox', 'blue jeans', 'blue eyes'],
      green: ['grass', 'leaf', 'lime', 'mint', 'emerald', 'fern', 'jade', 'forest', 'pine', 'lettuce', 'pea',
              'kiwi', 'avocado', 'moss', 'seaweed', 'algae', 'lichen', 'bamboo', 'ivy', 'cactus', 'clover', 'thyme',
              'asparagus', 'cucumber', 'kale', 'parsley', 'pear', 'pistachio', 'basil', 'rosemary', 'sage', 'fir',
              'evergreen', 'kelp', 'honey dew', 'moss green', 'olive', 'olive oil', 'khaki', 'khaki pants',
              'green apple', 'green bean', 'broccoli', 'spinach', 'celery', 'green pepper', 'pickle', 'zucchini',
              'artichoke', 'matcha', 'green tea', 'wasabi', 'tree frog', 'iguana', 'grasshopper', 'praying mantis',
              'green snake', 'turtle', 'alligator', 'green lizard', 'green parrot', 'parakeet', 'shamrock', 'four leaf clover'],
      yellow: ['sun', 'banana', 'lemon', 'butter', 'sunflower', 'gold', 'wheat', 'mustard', 'dandelion', 'corn',
               'marigold', 'daffodil', 'buttercup', 'canary', 'mango', 'saffron', 'goldenrod', 'turmeric', 'brass',
               'honey', 'amber', 'spark', 'straw', 'blonde', 'pineapple', 'lemonade',
               'yellow pepper', 'squash', 'yellow taxi', 'school bus', 'caution sign', 'highlighter', 'egg yolk',
               'cheese', 'popcorn', 'giraffe', 'yellow jacket', 'bumblebee', 'yellow rose', 'yellow tulip', 'ducky'],
      white: ['snow', 'cloud', 'pearl', 'milk', 'ivory', 'cream', 'frost', 'ice', 'cotton', 'vanilla', 'paper',
              'daisy', 'jasmine', 'apple blossom', 'eggshell', 'coconut', 'powder', 'chalk', 'marshmallow', 'dove',
              'silk', 'crystal', 'diamond', 'salt', 'swan', 'polar bear',
              'white rabbit', 'ghost', 'sugar', 'rice', 'tooth', 'bone', 'wedding dress', 'angel', 'lily',
              'white rose', 'snowflake', 'flour', 'cloud', 'sheep', 'white cat', 'arctic fox', 'seagull'],
      black: ['coal', 'night', 'onyx', 'raven', 'ebony', 'jet', 'soot', 'ink', 'tar', 'pitch', 'tarmac', 'obsidian',
              'jet black', 'licorice', 'shadow', 'crow', 'panther', 'bat', 'blackboard', 'tire',
              'black bear', 'black cat', 'blackberry', 'black olive', 'black bean', 'orca', 'gorilla',
              'asphalt', 'charcoal', 'coffee bean', 'pepper', 'penguin', 'skunk', 'black widow', 'black hole'],
      orange: ['orange', 'carrot', 'pumpkin', 'tiger', 'tangerine', 'salmon', 'coral', 'peach', 'apricot', 'sunset',
               'flame', 'papaya', 'mango', 'clementine', 'persimmon', 'pumpkin spice', 'tangerine peel', 'rust',
               'brick', 'terracotta', 'terracotta pot', 'ginger', 'paprika', 'cayenne',
               'traffic cone', 'basketball', 'goldfish', 'orange juice', 'cantaloupe', 'nectarine', 'marigold',
               'orange butterfly', 'monarch', 'cheddar', 'autumn leaves', 'sweet potato', 'yam', 'marmalade'],
      purple: ['grape', 'plum', 'eggplant', 'violet', 'lilac', 'lavender', 'mauve', 'orchid', 'amethyst', 'fig',
               'pansy', 'hyacinth', 'iris', 'twilight', 'dusk', 'aubergine', 'raisin', 'urchin', 'eggplant', 'mulberry',
               'plum wine', 'dusk sky',
               'purple cabbage', 'beetroot', 'purple onion', 'blackberry', 'blueberry', 'acai', 'elderberry',
               'purple iris', 'wisteria', 'purple finch', 'purple martin', 'purple loosestrife', 'heather'],
      pink: ['flamingo', 'rose petal', 'blush', 'cherry blossom', 'watermelon', 'grapefruit', 'raspberry sorbet',
             'dawn', 'sunrise', 'peach', 'salmon', 'coral', 'bubblegum', 'cotton candy', 'carnation', 'azalea',
             'pink tulip', 'pink peony', 'pink panther', 'pig', 'pink lemonade', 'strawberry ice cream',
             'pink eraser', 'pink frosting', 'pink rose', 'begonia', 'hibiscus', 'pink hydrangea', 'shrimp'],
      brown: ['chocolate', 'dirt', 'mud', 'coffee', 'cinnamon', 'chestnut', 'mahogany', 'walnut', 'sepia', 'umber',
              'mocha', 'espresso', 'cocoa', 'pecan', 'oak', 'redwood', 'cherry wood', 'bark', 'bear', 'potato',
              'deer', 'moose', 'camel', 'brown sugar', 'pretzel', 'bread', 'toast', 'nutmeg', 'allspice',
              'acorn', 'hazelnut', 'almond', 'wood', 'leather', 'teddy bear', 'beaver', 'sparrow', 'owl'],
      gray: ['ash', 'smoke', 'fog', 'charcoal', 'slate', 'storm', 'graphite', 'granite', 'concrete', 'stone',
             'elephant', 'dove', 'fog', 'mist', 'storm cloud', 'lead', 'iron', 'steel', 'pewter', 'shadow',
             'charcoal gray', 'smoke gray', 'storm sky', 'gunmetal', 'slate rock', 'mushroom', 'koala'],
      gold: ['gold', 'wheat', 'honey', 'amber', 'saffron', 'sunflower', 'brass', 'marigold', 'spark', 'topaz',
             'rose gold', 'treasure', 'coin', 'trophy'],
      silver: ['silver', 'moon', 'pewter', 'platinum', 'nickel', 'chrome', 'aluminum', 'sterling', 'mirror'],
      tan: ['sand', 'beach', 'caramel', 'tan', 'fawn', 'dust', 'oatmeal', 'sandalwood', 'suede', 'straw',
            'desert sand', 'beach sand', 'khaki', 'beige'],
      cream: ['cream', 'butter', 'vanilla', 'eggshell', 'champagne', 'cream cheese', 'flax', 'french vanilla',
              'latex', 'oyster', 'ivory', 'lace', 'parchment'],
      teal: ['teal', 'turquoise', 'cyan', 'aqua', 'pond', 'stream', 'algae', 'peacock', 'sea foam', 'turquoise stone'],
      maroon: ['maroon', 'burgundy', 'wine', 'claret', 'wine red', 'merlot', 'cranberry', 'tulip', 'plum wine'],
      beige: ['beige', 'tan', 'sand', 'taupe', 'mushroom', 'fawn', 'camel', 'khaki']
    },
    'followup-numerical': Array.from({length: 200}, (_, i) => [String(i), String(i + 1)]),
    'physical-numerical': [
      // Ascending Words (up to 100)
      ['one', 'two'], ['two', 'three'], ['three', 'four'], ['four', 'five'], ['five', 'six'],
      ['six', 'seven'], ['seven', 'eight'], ['eight', 'nine'], ['nine', 'ten'], ['ten', 'eleven'],
      ['eleven', 'twelve'], ['twelve', 'thirteen'], ['thirteen', 'fourteen'], ['fourteen', 'fifteen'], ['fifteen', 'sixteen'],
      ['sixteen', 'seventeen'], ['seventeen', 'eighteen'], ['eighteen', 'nineteen'], ['nineteen', 'twenty'], ['twenty', 'twenty-one'],
      ['twenty-one', 'twenty-two'], ['twenty-two', 'twenty-three'], ['twenty-three', 'twenty-four'], ['twenty-four', 'twenty-five'],
      ['twenty-five', 'twenty-six'], ['twenty-six', 'twenty-seven'], ['twenty-seven', 'twenty-eight'], ['twenty-eight', 'twenty-nine'],
      ['twenty-nine', 'thirty'], ['thirty', 'thirty-one'], ['thirty-one', 'thirty-two'], ['thirty-two', 'thirty-three'],
      ['thirty-three', 'thirty-four'], ['thirty-four', 'thirty-five'], ['thirty-five', 'thirty-six'], ['thirty-six', 'thirty-seven'],
      ['thirty-seven', 'thirty-eight'], ['thirty-eight', 'thirty-nine'], ['thirty-nine', 'forty'], ['forty', 'forty-one'],
      ['forty-one', 'forty-two'], ['forty-two', 'forty-three'], ['forty-three', 'forty-four'], ['forty-four', 'forty-five'],
      ['forty-five', 'forty-six'], ['forty-six', 'forty-seven'], ['forty-seven', 'forty-eight'], ['forty-eight', 'forty-nine'],
      ['forty-nine', 'fifty'], ['fifty', 'fifty-one'], ['fifty-one', 'fifty-two'], ['fifty-two', 'fifty-three'],
      ['fifty-three', 'fifty-four'], ['fifty-four', 'fifty-five'], ['fifty-five', 'fifty-six'], ['fifty-six', 'fifty-seven'],
      ['fifty-seven', 'fifty-eight'], ['fifty-eight', 'fifty-nine'], ['fifty-nine', 'sixty'], ['sixty', 'sixty-one'],
      ['sixty-one', 'sixty-two'], ['sixty-two', 'sixty-three'], ['sixty-three', 'sixty-four'], ['sixty-four', 'sixty-five'],
      ['sixty-five', 'sixty-six'], ['sixty-six', 'sixty-seven'], ['sixty-seven', 'sixty-eight'], ['sixty-eight', 'sixty-nine'],
      ['sixty-nine', 'seventy'], ['seventy', 'seventy-one'], ['seventy-one', 'seventy-two'], ['seventy-two', 'seventy-three'],
      ['seventy-three', 'seventy-four'], ['seventy-four', 'seventy-five'], ['seventy-five', 'seventy-six'], ['seventy-six', 'seventy-seven'],
      ['seventy-seven', 'seventy-eight'], ['seventy-eight', 'seventy-nine'], ['seventy-nine', 'eighty'], ['eighty', 'eighty-one'],
      ['eighty-one', 'eighty-two'], ['eighty-two', 'eighty-three'], ['eighty-three', 'eighty-four'], ['eighty-four', 'eighty-five'],
      ['eighty-five', 'eighty-six'], ['eighty-six', 'eighty-seven'], ['eighty-seven', 'eighty-eight'], ['eighty-eight', 'eighty-nine'],
      ['eighty-nine', 'ninety'], ['ninety', 'ninety-one'], ['ninety-one', 'ninety-two'], ['ninety-two', 'ninety-three'],
      ['ninety-three', 'ninety-four'], ['ninety-four', 'ninety-five'], ['ninety-five', 'ninety-six'], ['ninety-six', 'ninety-seven'],
      ['ninety-seven', 'ninety-eight'], ['ninety-eight', 'ninety-nine'], ['ninety-nine', 'one hundred'],
      // Descending Words
      ['two', 'one'], ['three', 'two'], ['four', 'three'], ['five', 'four'], ['six', 'five'],
      ['seven', 'six'], ['eight', 'seven'], ['nine', 'eight'], ['ten', 'nine'], ['eleven', 'ten'],
      ['twelve', 'eleven'], ['thirteen', 'twelve'], ['fourteen', 'thirteen'], ['fifteen', 'fourteen'], ['sixteen', 'fifteen'],
      ['seventeen', 'sixteen'], ['eighteen', 'seventeen'], ['nineteen', 'eighteen'], ['twenty', 'nineteen'], ['thirty', 'twenty-nine'],
      ['forty', 'thirty-nine'], ['fifty', 'forty-nine'], ['sixty', 'fifty-nine'], ['seventy', 'sixty-nine'], ['eighty', 'seventy-nine'],
      ['ninety', 'eighty-nine'], ['one hundred', 'ninety-nine'],
      // Ascending Roman numerals (up to 100)
      ['I', 'II'], ['II', 'III'], ['III', 'IV'], ['IV', 'V'], ['V', 'VI'],
      ['VI', 'VII'], ['VII', 'VIII'], ['VIII', 'IX'], ['IX', 'X'], ['X', 'XI'],
      ['XI', 'XII'], ['XII', 'XIII'], ['XIII', 'XIV'], ['XIV', 'XV'], ['XV', 'XVI'],
      ['XVI', 'XVII'], ['XVII', 'XVIII'], ['XVIII', 'XIX'], ['XIX', 'XX'], ['XX', 'XXI'],
      ['XXI', 'XXII'], ['XXII', 'XXIII'], ['XXIII', 'XXIV'], ['XXIV', 'XXV'], ['XXV', 'XXVI'],
      ['XXVI', 'XXVII'], ['XXVII', 'XXVIII'], ['XXVIII', 'XXIX'], ['XXIX', 'XXX'], ['XXX', 'XXXI'],
      ['XXXI', 'XXXII'], ['XXXII', 'XXXIII'], ['XXXIII', 'XXXIV'], ['XXXIV', 'XXXV'], ['XXXV', 'XXXVI'],
      ['XXXVI', 'XXXVII'], ['XXXVII', 'XXXVIII'], ['XXXVIII', 'XXXIX'], ['XXXIX', 'XL'], ['XL', 'XLI'],
      ['XLI', 'XLII'], ['XLII', 'XLIII'], ['XLIII', 'XLIV'], ['XLIV', 'XLV'], ['XLV', 'XLVI'],
      ['XLVI', 'XLVII'], ['XLVII', 'XLVIII'], ['XLVIII', 'XLIX'], ['XLIX', 'L'], ['L', 'LI'],
      ['LI', 'LII'], ['LII', 'LIII'], ['LIII', 'LIV'], ['LIV', 'LV'], ['LV', 'LVI'],
      ['LVI', 'LVII'], ['LVII', 'LVIII'], ['LVIII', 'LIX'], ['LIX', 'LX'], ['LX', 'LXI'],
      ['LXI', 'LXII'], ['LXII', 'LXIII'], ['LXIII', 'LXIV'], ['LXIV', 'LXV'], ['LXV', 'LXVI'],
      ['LXVI', 'LXVII'], ['LXVII', 'LXVIII'], ['LXVIII', 'LXIX'], ['LXIX', 'LXX'], ['LXX', 'LXXI'],
      ['LXXI', 'LXXII'], ['LXXII', 'LXXIII'], ['LXXIII', 'LXXIV'], ['LXXIV', 'LXXV'], ['LXXV', 'LXXVI'],
      ['LXXVI', 'LXXVII'], ['LXXVII', 'LXXVIII'], ['LXXVIII', 'LXXIX'], ['LXXIX', 'LXXX'], ['LXXX', 'LXXXI'],
      ['LXXXI', 'LXXXII'], ['LXXXII', 'LXXXIII'], ['LXXXIII', 'LXXXIV'], ['LXXXIV', 'LXXXV'], ['LXXXV', 'LXXXVI'],
      ['LXXXVI', 'LXXXVII'], ['LXXXVII', 'LXXXVIII'], ['LXXXVIII', 'LXXXIX'], ['LXXXIX', 'XC'], ['XC', 'XCI'],
      ['XCI', 'XCII'], ['XCII', 'XCIII'], ['XCIII', 'XCIV'], ['XCIV', 'XCV'], ['XCV', 'XCVI'],
      ['XCVI', 'XCVII'], ['XCVII', 'XCVIII'], ['XCVIII', 'XCIX'], ['XCIX', 'C'],
      // Descending Roman numerals
      ['II', 'I'], ['III', 'II'], ['IV', 'III'], ['V', 'IV'], ['VI', 'V'],
      ['VII', 'VI'], ['VIII', 'VII'], ['IX', 'VIII'], ['X', 'IX'], ['XI', 'X'],
      ['XII', 'XI'], ['XIII', 'XII'], ['XIV', 'XIII'], ['XV', 'XIV'], ['XVI', 'XV'],
      ['XVII', 'XVI'], ['XVIII', 'XVII'], ['XIX', 'XVIII'], ['XX', 'XIX'], ['XXX', 'XXIX'],
      ['XL', 'XXXIX'], ['L', 'XLIX'], ['LX', 'LIX'], ['LXX', 'LXIX'], ['LXXX', 'LXXIX'],
      ['XC', 'LXXXIX'], ['C', 'XCIX'],
      // Ascending Digits (up to 100)
      ['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['5', '6'],
      ['6', '7'], ['7', '8'], ['8', '9'], ['9', '10'], ['10', '11'],
      ['11', '12'], ['12', '13'], ['13', '14'], ['14', '15'], ['15', '16'],
      ['16', '17'], ['17', '18'], ['18', '19'], ['19', '20'], ['20', '21'],
      ['21', '22'], ['22', '23'], ['23', '24'], ['24', '25'], ['25', '26'],
      ['26', '27'], ['27', '28'], ['28', '29'], ['29', '30'], ['30', '31'],
      ['31', '32'], ['32', '33'], ['33', '34'], ['34', '35'], ['35', '36'],
      ['36', '37'], ['37', '38'], ['38', '39'], ['39', '40'], ['40', '41'],
      ['41', '42'], ['42', '43'], ['43', '44'], ['44', '45'], ['45', '46'],
      ['46', '47'], ['47', '48'], ['48', '49'], ['49', '50'], ['50', '51'],
      ['51', '52'], ['52', '53'], ['53', '54'], ['54', '55'], ['55', '56'],
      ['56', '57'], ['57', '58'], ['58', '59'], ['59', '60'], ['60', '61'],
      ['61', '62'], ['62', '63'], ['63', '64'], ['64', '65'], ['65', '66'],
      ['66', '67'], ['67', '68'], ['68', '69'], ['69', '70'], ['70', '71'],
      ['71', '72'], ['72', '73'], ['73', '74'], ['74', '75'], ['75', '76'],
      ['76', '77'], ['77', '78'], ['78', '79'], ['79', '80'], ['80', '81'],
      ['81', '82'], ['82', '83'], ['83', '84'], ['84', '85'], ['85', '86'],
      ['86', '87'], ['87', '88'], ['88', '89'], ['89', '90'], ['90', '91'],
      ['91', '92'], ['92', '93'], ['93', '94'], ['94', '95'], ['95', '96'],
      ['96', '97'], ['97', '98'], ['98', '99'], ['99', '100'],
      // Descending Digits
      ['2', '1'], ['3', '2'], ['4', '3'], ['5', '4'], ['6', '5'],
      ['7', '6'], ['8', '7'], ['9', '8'], ['10', '9'], ['11', '10'],
      ['12', '11'], ['13', '12'], ['14', '13'], ['15', '14'], ['16', '15'],
      ['17', '16'], ['18', '17'], ['19', '18'], ['20', '19'], ['30', '29'],
      ['40', '39'], ['50', '49'], ['60', '59'], ['70', '69'], ['80', '79'],
      ['90', '89'], ['100', '99'],
      // Mixed formats (words, Roman, digits)
      ['one', 'II'], ['II', 'three'], ['three', 'IV'], ['IV', 'five'], ['five', 'VI'],
      ['VI', 'seven'], ['seven', 'VIII'], ['VIII', 'nine'], ['nine', 'X'], ['X', 'eleven'],
      ['1', 'two'], ['two', '3'], ['3', 'four'], ['four', '5'], ['5', 'six'],
      ['six', '7'], ['7', 'eight'], ['eight', '9'], ['9', 'ten'], ['ten', '11'],
      ['I', '2'], ['2', 'III'], ['III', '4'], ['4', 'V'], ['V', '6'],
      ['6', 'VII'], ['VII', '8'], ['8', 'IX'], ['IX', '10'], ['10', 'XI'],
      ['twenty', 'XXI'], ['XXI', '22'], ['22', 'twenty-three'], ['thirty', '31'], ['31', 'XXXII'],
      ['forty', 'XLI'], ['XLI', '42'], ['fifty', 'LI'], ['LI', 'fifty-two'], ['sixty', 'LXI'],
      ['seventy', 'LXXI'], ['eighty', 'LXXXI'], ['ninety', 'XCI'], ['XCI', '92'],
      // Roman numeral C (100) - final Roman numeral
      ['C', '100'], ['99', 'C'], ['XCIX', 'C'], ['ninety-nine', 'C']
    ],
    'same-time': [
      // Clock emoji to digital
      ['🕐', '1:00'], ['🕑', '2:00'], ['🕒', '3:00'], ['🕓', '4:00'], ['🕔', '5:00'], ['🕕', '6:00'],
      ['🕖', '7:00'], ['🕗', '8:00'], ['🕘', '9:00'], ['🕙', '10:00'], ['🕚', '11:00'], ['🕛', '12:00'],
      ['🕜', '1:30'], ['🕝', '2:30'], ['🕞', '3:30'], ['🕟', '4:30'], ['🕠', '5:30'], ['🕡', '6:30'],
      ['🕢', '7:30'], ['🕣', '8:30'], ['🕤', '9:30'], ['🕥', '10:30'], ['🕦', '11:30'], ['🕧', '12:30'],
      // Clock emoji to verbal
      ['🕐', 'one o\'clock'], ['🕑', 'two o\'clock'], ['🕒', 'three o\'clock'], ['🕓', 'four o\'clock'],
      ['🕔', 'five o\'clock'], ['🕕', 'six o\'clock'], ['🕖', 'seven o\'clock'], ['🕗', 'eight o\'clock'],
      ['🕘', 'nine o\'clock'], ['🕙', 'ten o\'clock'], ['🕚', 'eleven o\'clock'], ['🕛', 'twelve o\'clock'],
      ['🕜', 'half past one'], ['🕝', 'half past two'], ['🕞', 'half past three'], ['🕟', 'half past four'],
      ['🕠', 'half past five'], ['🕡', 'half past six'], ['🕢', 'half past seven'], ['🕣', 'half past eight'],
      ['🕤', 'half past nine'], ['🕥', 'half past ten'], ['🕦', 'half past eleven'], ['🕧', 'half past twelve'],
      // Digital to verbal
      ['1:00', 'one o\'clock'], ['2:00', 'two o\'clock'], ['3:00', 'three o\'clock'], ['4:00', 'four o\'clock'],
      ['5:00', 'five o\'clock'], ['6:00', 'six o\'clock'], ['7:00', 'seven o\'clock'], ['8:00', 'eight o\'clock'],
      ['9:00', 'nine o\'clock'], ['10:00', 'ten o\'clock'], ['11:00', 'eleven o\'clock'], ['12:00', 'twelve o\'clock'],
      ['1:30', 'half past one'], ['2:30', 'half past two'], ['3:30', 'half past three'], ['4:30', 'half past four'],
      ['5:30', 'half past five'], ['6:30', 'half past six'], ['7:30', 'half past seven'], ['8:30', 'half past eight'],
      ['9:30', 'half past nine'], ['10:30', 'half past ten'], ['11:30', 'half past eleven'], ['12:30', 'half past twelve'],
      ['1:15', 'quarter past one'], ['2:15', 'quarter past two'], ['3:15', 'quarter past three'], ['4:15', 'quarter past four'],
      ['5:15', 'quarter past five'], ['6:15', 'quarter past six'], ['7:15', 'quarter past seven'], ['8:15', 'quarter past eight'],
      ['9:15', 'quarter past nine'], ['10:15', 'quarter past ten'], ['11:15', 'quarter past eleven'], ['12:15', 'quarter past twelve'],
      ['1:45', 'quarter to two'], ['2:45', 'quarter to three'], ['3:45', 'quarter to four'], ['4:45', 'quarter to five'],
      ['5:45', 'quarter to six'], ['6:45', 'quarter to seven'], ['7:45', 'quarter to eight'], ['8:45', 'quarter to nine'],
      ['9:45', 'quarter to ten'], ['10:45', 'quarter to eleven'], ['11:45', 'quarter to twelve'], ['12:45', 'quarter to one'],
      // More variations
      ['1:00', '1 o\'clock'], ['2:00', '2 o\'clock'], ['3:00', '3 o\'clock'], ['4:00', '4 o\'clock'],
      ['5:00', '5 o\'clock'], ['6:00', '6 o\'clock'], ['7:00', '7 o\'clock'], ['8:00', '8 o\'clock'],
      ['1:30', '1:30 pm'], ['2:30', '2:30 pm'], ['3:30', '3:30 am'], ['4:30', '4:30 am'],
      ['one o\'clock', '1 o\'clock'], ['two o\'clock', '2 o\'clock'], ['three o\'clock', '3 o\'clock'],
      ['12:00', 'noon'], ['12:00', 'midnight'], ['00:00', 'midnight'], ['12:00', 'twelve o\'clock']
    ],
    'even': [
      // Both numbers are even (0-100) - digits
      ['0', '2'], ['2', '4'], ['4', '6'], ['6', '8'], ['8', '10'],
      ['10', '12'], ['12', '14'], ['14', '16'], ['16', '18'], ['18', '20'],
      ['20', '22'], ['22', '24'], ['24', '26'], ['26', '28'], ['28', '30'],
      ['30', '32'], ['32', '34'], ['34', '36'], ['36', '38'], ['38', '40'],
      ['40', '42'], ['42', '44'], ['44', '46'], ['46', '48'], ['48', '50'],
      ['50', '52'], ['52', '54'], ['54', '56'], ['56', '58'], ['58', '60'],
      ['60', '62'], ['62', '64'], ['64', '66'], ['66', '68'], ['68', '70'],
      ['70', '72'], ['72', '74'], ['74', '76'], ['76', '78'], ['78', '80'],
      ['80', '82'], ['82', '84'], ['84', '86'], ['86', '88'], ['88', '90'],
      ['90', '92'], ['92', '94'], ['94', '96'], ['96', '98'], ['98', '100'],
      // Both even - verbal
      ['zero', 'two'], ['two', 'four'], ['four', 'six'], ['six', 'eight'], ['eight', 'ten'],
      ['ten', 'twelve'], ['twelve', 'fourteen'], ['fourteen', 'sixteen'], ['sixteen', 'eighteen'], ['eighteen', 'twenty'],
      ['twenty', 'thirty'], ['thirty', 'forty'], ['forty', 'fifty'], ['fifty', 'sixty'], ['sixty', 'seventy'],
      ['seventy', 'eighty'], ['eighty', 'ninety'], ['ninety', 'one hundred'],
      // Both even - Roman numerals
      ['II', 'IV'], ['IV', 'VI'], ['VI', 'VIII'], ['VIII', 'X'], ['X', 'XII'],
      ['XII', 'XIV'], ['XIV', 'XVI'], ['XVI', 'XVIII'], ['XVIII', 'XX'], ['XX', 'XXX'],
      ['XXX', 'XL'], ['XL', 'L'], ['L', 'LX'], ['LX', 'LXX'], ['LXX', 'LXXX'],
      ['LXXX', 'XC'], ['XC', 'C'],
      // Both even - mixed formats
      ['2', 'four'], ['4', 'VI'], ['VI', 'eight'], ['8', 'X'], ['ten', '12'],
      ['12', 'XIV'], ['XIV', 'sixteen'], ['16', 'XVIII'], ['twenty', '22'], ['24', 'XXVI'],
      ['30', 'forty'], ['L', 'sixty'], ['70', 'LXXX'], ['ninety', '92']
    ],
    'odd': [
      // Both numbers are odd (1-99) - digits
      ['1', '3'], ['3', '5'], ['5', '7'], ['7', '9'], ['9', '11'],
      ['11', '13'], ['13', '15'], ['15', '17'], ['17', '19'], ['19', '21'],
      ['21', '23'], ['23', '25'], ['25', '27'], ['27', '29'], ['29', '31'],
      ['31', '33'], ['33', '35'], ['35', '37'], ['37', '39'], ['39', '41'],
      ['41', '43'], ['43', '45'], ['45', '47'], ['47', '49'], ['49', '51'],
      ['51', '53'], ['53', '55'], ['55', '57'], ['57', '59'], ['59', '61'],
      ['61', '63'], ['63', '65'], ['65', '67'], ['67', '69'], ['69', '71'],
      ['71', '73'], ['73', '75'], ['75', '77'], ['77', '79'], ['79', '81'],
      ['81', '83'], ['83', '85'], ['85', '87'], ['87', '89'], ['89', '91'],
      ['91', '93'], ['93', '95'], ['95', '97'], ['97', '99'],
      // Both odd - verbal
      ['one', 'three'], ['three', 'five'], ['five', 'seven'], ['seven', 'nine'], ['nine', 'eleven'],
      ['eleven', 'thirteen'], ['thirteen', 'fifteen'], ['fifteen', 'seventeen'], ['seventeen', 'nineteen'], ['nineteen', 'twenty-one'],
      ['twenty-one', 'twenty-three'], ['twenty-three', 'twenty-five'], ['twenty-five', 'twenty-seven'], ['twenty-seven', 'twenty-nine'],
      // Both odd - Roman numerals
      ['I', 'III'], ['III', 'V'], ['V', 'VII'], ['VII', 'IX'], ['IX', 'XI'],
      ['XI', 'XIII'], ['XIII', 'XV'], ['XV', 'XVII'], ['XVII', 'XIX'], ['XIX', 'XXI'],
      ['XXI', 'XXIII'], ['XXIII', 'XXV'], ['XXV', 'XXVII'], ['XXVII', 'XXIX'],
      // Both odd - mixed formats
      ['1', 'three'], ['3', 'V'], ['V', 'seven'], ['7', 'IX'], ['nine', '11'],
      ['11', 'XIII'], ['XIII', 'fifteen'], ['15', 'XVII'], ['nineteen', '21'], ['23', 'XXV'],
      ['31', 'thirty-three'], ['41', 'XLIII'], ['51', 'fifty-three'], ['61', 'LXIII']
    ],
    'doubled': [
      // Number is doubled (0-50 range so doubled stays within 100) - digits
      ['0', '0'], ['1', '2'], ['2', '4'], ['3', '6'], ['4', '8'], ['5', '10'],
      ['6', '12'], ['7', '14'], ['8', '16'], ['9', '18'], ['10', '20'],
      ['11', '22'], ['12', '24'], ['13', '26'], ['14', '28'], ['15', '30'],
      ['16', '32'], ['17', '34'], ['18', '36'], ['19', '38'], ['20', '40'],
      ['21', '42'], ['22', '44'], ['23', '46'], ['24', '48'], ['25', '50'],
      ['26', '52'], ['27', '54'], ['28', '56'], ['29', '58'], ['30', '60'],
      ['31', '62'], ['32', '64'], ['33', '66'], ['34', '68'], ['35', '70'],
      ['36', '72'], ['37', '74'], ['38', '76'], ['39', '78'], ['40', '80'],
      ['41', '82'], ['42', '84'], ['43', '86'], ['44', '88'], ['45', '90'],
      ['46', '92'], ['47', '94'], ['48', '96'], ['49', '98'], ['50', '100'],
      // Doubled - verbal
      ['zero', 'zero'], ['one', 'two'], ['two', 'four'], ['three', 'six'], ['four', 'eight'], ['five', 'ten'],
      ['six', 'twelve'], ['seven', 'fourteen'], ['eight', 'sixteen'], ['nine', 'eighteen'], ['ten', 'twenty'],
      ['eleven', 'twenty-two'], ['twelve', 'twenty-four'], ['thirteen', 'twenty-six'], ['fourteen', 'twenty-eight'], ['fifteen', 'thirty'],
      ['twenty', 'forty'], ['twenty-five', 'fifty'], ['thirty', 'sixty'], ['forty', 'eighty'], ['fifty', 'one hundred'],
      // Doubled - Roman numerals
      ['I', 'II'], ['II', 'IV'], ['III', 'VI'], ['IV', 'VIII'], ['V', 'X'],
      ['VI', 'XII'], ['VII', 'XIV'], ['VIII', 'XVI'], ['IX', 'XVIII'], ['X', 'XX'],
      ['XI', 'XXII'], ['XII', 'XXIV'], ['XIII', 'XXVI'], ['XIV', 'XXVIII'], ['XV', 'XXX'],
      ['XX', 'XL'], ['XXV', 'L'], ['XXX', 'LX'], ['XL', 'LXXX'], ['L', 'C'],
      // Doubled - mixed formats
      ['1', 'two'], ['2', 'IV'], ['III', 'six'], ['4', 'VIII'], ['five', '10'],
      ['6', 'XII'], ['VII', 'fourteen'], ['8', 'XVI'], ['ten', '20'], ['12', 'XXIV'],
      ['fifteen', '30'], ['20', 'forty'], ['XXV', '50'], ['thirty', '60'], ['XL', 'eighty']
    ],
    'tripled': [
      // Number is tripled (0-33 range so tripled stays within 100) - digits
      ['0', '0'], ['1', '3'], ['2', '6'], ['3', '9'], ['4', '12'], ['5', '15'],
      ['6', '18'], ['7', '21'], ['8', '24'], ['9', '27'], ['10', '30'],
      ['11', '33'], ['12', '36'], ['13', '39'], ['14', '42'], ['15', '45'],
      ['16', '48'], ['17', '51'], ['18', '54'], ['19', '57'], ['20', '60'],
      ['21', '63'], ['22', '66'], ['23', '69'], ['24', '72'], ['25', '75'],
      ['26', '78'], ['27', '81'], ['28', '84'], ['29', '87'], ['30', '90'],
      ['31', '93'], ['32', '96'], ['33', '99'],
      // Tripled - verbal
      ['zero', 'zero'], ['one', 'three'], ['two', 'six'], ['three', 'nine'], ['four', 'twelve'], ['five', 'fifteen'],
      ['six', 'eighteen'], ['seven', 'twenty-one'], ['eight', 'twenty-four'], ['nine', 'twenty-seven'], ['ten', 'thirty'],
      ['eleven', 'thirty-three'], ['twelve', 'thirty-six'], ['thirteen', 'thirty-nine'], ['fourteen', 'forty-two'], ['fifteen', 'forty-five'],
      ['twenty', 'sixty'], ['thirty', 'ninety'],
      // Tripled - Roman numerals
      ['I', 'III'], ['II', 'VI'], ['III', 'IX'], ['IV', 'XII'], ['V', 'XV'],
      ['VI', 'XVIII'], ['VII', 'XXI'], ['VIII', 'XXIV'], ['IX', 'XXVII'], ['X', 'XXX'],
      ['XI', 'XXXIII'], ['XII', 'XXXVI'], ['XIII', 'XXXIX'], ['XIV', 'XLII'], ['XV', 'XLV'],
      ['XX', 'LX'], ['XXX', 'XC'],
      // Tripled - mixed formats
      ['1', 'three'], ['2', 'VI'], ['III', 'nine'], ['4', 'XII'], ['five', '15'],
      ['6', 'XVIII'], ['VII', 'twenty-one'], ['8', 'XXIV'], ['ten', '30'], ['12', 'XXXVI'],
      ['fifteen', '45'], ['20', 'sixty'], ['XXX', 'ninety']
    ],
    'synonym': [
      // Advanced vocabulary - similar meanings
      ['abundant', 'plentiful'], ['accelerate', 'hasten'], ['accomplish', 'achieve'], ['accumulate', 'amass'], ['accurate', 'precise'],
      ['acquire', 'obtain'], ['adequate', 'sufficient'], ['adjacent', 'neighboring'], ['admire', 'respect'], ['adversary', 'opponent'],
      ['advocate', 'support'], ['affluent', 'wealthy'], ['aggravate', 'worsen'], ['alleviate', 'relieve'], ['ambiguous', 'unclear'],
      ['amend', 'modify'], ['amiable', 'friendly'], ['ample', 'spacious'], ['ancient', 'archaic'], ['animate', 'enliven'],
      ['antagonist', 'rival'], ['antipathy', 'hostility'], ['apex', 'summit'], ['apparatus', 'device'], ['apprehensive', 'anxious'],
      ['arbitrary', 'random'], ['arduous', 'difficult'], ['articulate', 'eloquent'], ['ascend', 'rise'], ['assemble', 'gather'],
      ['astute', 'shrewd'], ['augment', 'increase'], ['austere', 'severe'], ['authentic', 'genuine'], ['autonomous', 'independent'],
      ['averse', 'opposed'], ['belligerent', 'hostile'], ['benevolent', 'kind'], ['bewildered', 'confused'], ['bizarre', 'strange'],
      ['bleak', 'dismal'], ['brevity', 'conciseness'], ['candid', 'frank'], ['capable', 'competent'], ['catastrophe', 'disaster'],
      ['cease', 'stop'], ['cede', 'surrender'], ['censure', 'criticize'], ['chaos', 'disorder'], ['chronicle', 'record'],
      ['circumvent', 'avoid'], ['clandestine', 'secret'], ['coerce', 'force'], ['coherent', 'logical'], ['collaborate', 'cooperate'],
      ['commence', 'begin'], ['commend', 'praise'], ['compassion', 'sympathy'], ['compatible', 'harmonious'], ['compel', 'force'],
      ['compensate', 'reimburse'], ['competent', 'capable'], ['compile', 'collect'], ['complacent', 'smug'], ['comply', 'obey'],
      ['comprehend', 'understand'], ['comprehensive', 'thorough'], ['comprise', 'include'], ['compulsory', 'mandatory'], ['conceal', 'hide'],
      ['concede', 'admit'], ['conceive', 'imagine'], ['concise', 'brief'], ['condemn', 'denounce'], ['conduct', 'lead'],
      ['confer', 'consult'], ['confine', 'restrict'], ['confirm', 'verify'], ['conform', 'comply'], ['confront', 'face'],
      ['congeal', 'solidify'], ['congenial', 'friendly'], ['conjecture', 'speculation'], ['conscientious', 'diligent'], ['consecutive', 'successive'],
      ['consensus', 'agreement'], ['consequence', 'result'], ['conserve', 'preserve'], ['considerable', 'substantial'], ['console', 'comfort'],
      ['consolidate', 'unite'], ['conspicuous', 'obvious'], ['constant', 'steady'], ['constitute', 'compose'], ['constrain', 'restrict'],
      ['construct', 'build'], ['contaminate', 'pollute'], ['contemplate', 'consider'], ['contemporary', 'modern'], ['contempt', 'disdain'],
      ['contend', 'compete'], ['content', 'satisfied'], ['context', 'setting'], ['contingent', 'dependent'], ['contract', 'shrink'],
      ['contradict', 'oppose'], ['contrary', 'opposite'], ['contribute', 'donate'], ['contrive', 'devise'], ['controversy', 'dispute'],
      ['convene', 'assemble'], ['conventional', 'traditional'], ['converge', 'meet'], ['convey', 'communicate'], ['convict', 'condemn'],
      ['copious', 'abundant'], ['cordial', 'warm'], ['correlate', 'relate'], ['corroborate', 'confirm'], ['corrupt', 'dishonest'],
      ['counterfeit', 'fake'], ['credible', 'believable'], ['crucial', 'critical'], ['crude', 'rough'], ['cultivate', 'develop'],
      ['cunning', 'crafty'], ['curtail', 'reduce'], ['customary', 'usual'], ['cynical', 'skeptical'], ['daunting', 'intimidating'],
      ['dearth', 'scarcity'], ['debacle', 'fiasco'], ['debate', 'discuss'], ['debris', 'rubble'], ['deceit', 'deception'],
      ['deceive', 'mislead'], ['decent', 'respectable'], ['decipher', 'decode'], ['decisive', 'conclusive'], ['declaration', 'proclamation'],
      ['decline', 'refuse'], ['decorate', 'adorn'], ['decrease', 'diminish'], ['dedicate', 'devote'], ['deduce', 'infer'],
      ['defect', 'flaw'], ['defer', 'postpone'], ['defiant', 'rebellious'], ['deficient', 'inadequate'], ['definite', 'certain'],
      ['defy', 'resist'], ['degrade', 'demote'], ['deliberate', 'intentional'], ['delicate', 'fragile'], ['delineate', 'describe'],
      ['delude', 'deceive'], ['demonstrate', 'show'], ['denote', 'indicate'], ['dense', 'thick'], ['depict', 'portray'],
      ['deplete', 'exhaust'], ['deplore', 'regret'], ['deport', 'expel'], ['depose', 'oust'], ['depress', 'sadden'],
      ['deprive', 'deny'], ['deride', 'mock'], ['derive', 'obtain'], ['descend', 'drop'], ['designate', 'appoint'],
      ['desist', 'cease'], ['desolate', 'barren'], ['despise', 'hate'], ['detect', 'discover'], ['deter', 'discourage'],
      ['deteriorate', 'worsen'], ['determine', 'decide'], ['detest', 'hate'], ['detrimental', 'harmful'], ['devastate', 'destroy'],
      ['deviate', 'diverge'], ['devise', 'invent'], ['devoid', 'lacking'], ['devote', 'dedicate'], ['devour', 'consume'],
      ['dexterous', 'skillful'], ['diligent', 'hardworking'], ['diminish', 'decrease'], ['discern', 'perceive'], ['disclose', 'reveal'],
      ['discord', 'conflict'], ['discourage', 'dishearten'], ['discreet', 'cautious'], ['discrepancy', 'difference'], ['discriminate', 'distinguish'],
      ['disdain', 'contempt'], ['disgrace', 'shame'], ['disguise', 'conceal'], ['dismal', 'gloomy'], ['dismantle', 'disassemble'],
      ['dismiss', 'discharge'], ['disparage', 'belittle'], ['disparity', 'inequality'], ['dispatch', 'send'], ['dispel', 'eliminate'],
      ['disperse', 'scatter'], ['displace', 'move'], ['dispute', 'argue'], ['disregard', 'ignore'], ['dissent', 'disagree'],
      ['dissipate', 'disperse'], ['dissolve', 'melt'], ['dissuade', 'discourage'], ['distinct', 'separate'], ['distinguish', 'differentiate'],
      ['distort', 'twist'], ['distract', 'divert'], ['distress', 'anguish'], ['distribute', 'dispense'], ['diverge', 'deviate'],
      ['diverse', 'varied'], ['divert', 'redirect'], ['divulge', 'reveal'], ['docile', 'obedient'], ['doctrine', 'principle'],
      ['document', 'record'], ['domestic', 'household'], ['dominant', 'prevailing'], ['dormant', 'inactive'], ['dubious', 'doubtful'],
      ['durable', 'lasting'], ['dwindle', 'decrease'], ['eager', 'enthusiastic'], ['eccentric', 'peculiar'], ['ecstatic', 'overjoyed'],
      ['edifice', 'building'], ['efface', 'erase'], ['effective', 'efficient'], ['elaborate', 'detailed'], ['elated', 'joyful'],
      ['elevate', 'raise'], ['elicit', 'evoke'], ['eligible', 'qualified'], ['eliminate', 'remove'], ['elucidate', 'explain'],
      ['elude', 'evade'], ['emanate', 'originate'], ['embark', 'begin'], ['embed', 'implant'], ['embellish', 'decorate'],
      ['embody', 'represent'], ['embrace', 'hug'], ['emerge', 'appear'], ['eminent', 'prominent'], ['emit', 'discharge'],
      ['emphatic', 'forceful'], ['enable', 'allow'], ['enact', 'perform'], ['encounter', 'meet'], ['encourage', 'inspire'],
      ['encroach', 'intrude'], ['endorse', 'approve'], ['endow', 'provide'], ['endure', 'tolerate'], ['energetic', 'vigorous'],
      ['enforce', 'implement'], ['engage', 'involve'], ['engross', 'absorb'], ['enhance', 'improve'], ['enigma', 'mystery'],
      ['enlighten', 'inform'], ['enormous', 'huge'], ['enrage', 'infuriate'], ['enrich', 'enhance'], ['ensue', 'follow'],
      ['ensure', 'guarantee'], ['entail', 'involve'], ['enterprise', 'venture'], ['entice', 'lure'], ['entire', 'whole'],
      ['entitle', 'authorize'], ['enumerate', 'list'], ['enunciate', 'pronounce'], ['envision', 'imagine'], ['ephemeral', 'temporary'],
      ['equitable', 'fair'], ['equivalent', 'equal'], ['equivocal', 'ambiguous'], ['eradicate', 'eliminate'], ['erode', 'wear'],
      ['erratic', 'unpredictable'], ['erudite', 'scholarly'], ['escalate', 'intensify'], ['eschew', 'avoid'], ['essential', 'vital'],
      ['establish', 'found'], ['esteem', 'respect'], ['estimate', 'approximate'], ['eternal', 'everlasting'], ['ethical', 'moral'],
      ['evacuate', 'empty'], ['evade', 'avoid'], ['evaluate', 'assess'], ['evasive', 'elusive'], ['evoke', 'elicit'],
      ['exacerbate', 'worsen'], ['exact', 'precise'], ['exalt', 'praise'], ['examine', 'inspect'], ['exasperate', 'annoy'],
      ['exceed', 'surpass'], ['excel', 'surpass'], ['excerpt', 'extract'], ['excessive', 'extreme'], ['exclude', 'omit'],
      ['excruciating', 'agonizing'], ['execute', 'perform'], ['exemplary', 'outstanding'], ['exempt', 'free'], ['exert', 'apply'],
      ['exhaust', 'deplete'], ['exhibit', 'display'], ['exhilarate', 'thrill'], ['exhort', 'urge'], ['exile', 'banish'],
      ['exodus', 'departure'], ['exonerate', 'absolve'], ['exorbitant', 'excessive'], ['expand', 'enlarge'], ['expedite', 'accelerate'],
      ['expel', 'eject'], ['explicit', 'clear'], ['exploit', 'utilize'], ['exquisite', 'beautiful'], ['extend', 'prolong'],
      ['extenuate', 'mitigate'], ['exterior', 'outer'], ['exterminate', 'destroy'], ['external', 'outer'], ['extinct', 'vanished'],
      ['extinguish', 'quench'], ['extol', 'praise'], ['extract', 'remove'], ['extraneous', 'irrelevant'], ['extraordinary', 'remarkable'],
      ['extravagant', 'lavish'], ['extreme', 'radical'], ['extricate', 'free'], ['exuberant', 'enthusiastic'], ['fabricate', 'invent'],
      ['facilitate', 'enable'], ['faction', 'group'], ['fallacious', 'false'], ['falter', 'waver'], ['famine', 'starvation'],
      ['fanatical', 'zealous'], ['fathom', 'understand'], ['fatigue', 'exhaustion'], ['feasible', 'possible'], ['feeble', 'weak'],
      ['feign', 'pretend'], ['ferocious', 'fierce'], ['fervent', 'passionate'], ['fetter', 'restrain'], ['fickle', 'changeable'],
      ['fictitious', 'imaginary'], ['fidelity', 'loyalty'], ['filament', 'fiber'], ['finale', 'ending'], ['finesse', 'skill'],
      ['finite', 'limited'], ['flagrant', 'blatant'], ['flaw', 'defect'], ['fledgling', 'beginner'], ['flexible', 'adaptable'],
      ['flourish', 'thrive'], ['fluctuate', 'vary'], ['fluent', 'articulate'], ['foil', 'thwart'], ['forbearance', 'patience'],
      ['forbid', 'prohibit'], ['foreign', 'alien'], ['foresee', 'predict'], ['foreshadow', 'presage'], ['forfeit', 'lose'],
      ['forge', 'create'], ['formidable', 'intimidating'], ['forsake', 'abandon'], ['fortify', 'strengthen'], ['fortuitous', 'lucky'],
      ['foster', 'encourage'], ['founder', 'fail'], ['fragile', 'delicate'], ['fragment', 'piece'], ['frantic', 'frenzied'],
      ['fraudulent', 'deceptive'], ['frugal', 'thrifty'], ['frustrate', 'thwart'], ['fulfill', 'accomplish'], ['fundamental', 'basic'],
      ['futile', 'useless'], ['garrulous', 'talkative'], ['gauge', 'measure'], ['generate', 'produce'], ['generic', 'general'],
      ['generous', 'liberal'], ['genesis', 'origin'], ['genial', 'friendly'], ['genuine', 'authentic'], ['germane', 'relevant'],
      ['ghastly', 'horrifying'], ['gist', 'essence'], ['gloomy', 'dismal'], ['glorify', 'praise'], ['gluttonous', 'greedy'],
      ['goad', 'provoke'], ['gracious', 'courteous'], ['gradual', 'progressive'], ['grandiose', 'grand'], ['gratify', 'satisfy'],
      ['gratuitous', 'unnecessary'], ['grave', 'serious'], ['gregarious', 'sociable'], ['grieve', 'mourn'], ['grim', 'severe'],
      ['grueling', 'exhausting'], ['guarantee', 'ensure'], ['guile', 'cunning'], ['gullible', 'naive'], ['habitual', 'customary'],
      ['hackneyed', 'trite'], ['hallow', 'sanctify'], ['halt', 'stop'], ['hamper', 'hinder'], ['haphazard', 'random'],
      ['harangue', 'tirade'], ['harbor', 'shelter'], ['hardy', 'robust'], ['harmonious', 'compatible'], ['harness', 'utilize'],
      ['harrowing', 'distressing'], ['harsh', 'severe'], ['hasten', 'hurry'], ['haughty', 'arrogant'], ['hazardous', 'dangerous'],
      ['heed', 'attention'], ['heinous', 'atrocious'], ['herald', 'announce'], ['hereditary', 'genetic'], ['heresy', 'unorthodoxy'],
      ['hermit', 'recluse'], ['hesitate', 'pause'], ['heterogeneous', 'diverse'], ['hiatus', 'break'], ['hibernate', 'sleep'],
      ['hideous', 'ugly'], ['hierarchy', 'ranking'], ['hilarious', 'funny'], ['hinder', 'obstruct'], ['hoax', 'deception'],
      ['homage', 'tribute'], ['homogeneous', 'uniform'], ['hone', 'sharpen'], ['honor', 'respect'], ['hostile', 'unfriendly'],
      ['humane', 'compassionate'], ['humble', 'modest'], ['humiliate', 'embarrass'], ['hypocrisy', 'insincerity'], ['hypothesis', 'theory'],
      ['identical', 'same'], ['idle', 'inactive'], ['ignite', 'kindle'], ['ignoble', 'dishonorable'], ['ignominy', 'disgrace'],
      ['ignorant', 'uninformed'], ['illegal', 'unlawful'], ['illicit', 'illegal'], ['illuminate', 'enlighten'], ['illusion', 'delusion'],
      ['illustrate', 'demonstrate'], ['illustrious', 'famous'], ['imbue', 'infuse'], ['imitate', 'copy'], ['immaculate', 'spotless'],
      ['immature', 'childish'], ['immense', 'huge'], ['immerse', 'submerge'], ['imminent', 'impending'], ['immoral', 'unethical'],
      ['immortal', 'eternal'], ['immutable', 'unchangeable'], ['impair', 'damage'], ['impartial', 'unbiased'], ['impassive', 'unemotional'],
      ['impeccable', 'flawless'], ['impede', 'hinder'], ['impel', 'urge'], ['imperative', 'essential'], ['imperceptible', 'undetectable'],
      ['imperfect', 'flawed'], ['imperial', 'majestic'], ['imperil', 'endanger'], ['imperious', 'domineering'], ['impersonal', 'detached'],
      ['impertinent', 'rude'], ['impervious', 'impenetrable'], ['impetuous', 'impulsive'], ['impetus', 'stimulus'], ['impinge', 'encroach'],
      ['implacable', 'relentless'], ['implement', 'execute'], ['implicate', 'involve'], ['implicit', 'implied'], ['implore', 'beg'],
      ['imply', 'suggest'], ['impolite', 'rude'], ['import', 'significance'], ['importune', 'harass'], ['impose', 'inflict'],
      ['imposing', 'impressive'], ['impotent', 'powerless'], ['impoverish', 'deplete'], ['impractical', 'unfeasible'], ['impregnable', 'invulnerable'],
      ['impress', 'affect'], ['improvise', 'extemporize'], ['imprudent', 'unwise'], ['impudent', 'insolent'], ['impulse', 'urge'],
      // Additional 400+ synonyms for massively expanded vocabulary
      ['inactive', 'dormant'], ['inadequate', 'insufficient'], ['inadvertent', 'unintentional'], ['inauspicious', 'unfavorable'], ['inaugurate', 'initiate'],
      ['incandescent', 'glowing'], ['incapable', 'unable'], ['incarcerate', 'imprison'], ['incendiary', 'inflammatory'], ['incessant', 'continuous'],
      ['inchoate', 'rudimentary'], ['incidence', 'occurrence'], ['incident', 'event'], ['incidental', 'minor'], ['incinerate', 'burn'],
      ['incipient', 'beginning'], ['incisive', 'sharp'], ['incite', 'provoke'], ['inclement', 'harsh'], ['inclination', 'tendency'],
      ['incline', 'slope'], ['include', 'encompass'], ['inclusive', 'comprehensive'], ['incoherent', 'confused'], ['income', 'revenue'],
      ['incomparable', 'matchless'], ['incompatible', 'inconsistent'], ['incompetent', 'inept'], ['incomplete', 'unfinished'], ['incomprehensible', 'unintelligible'],
      ['inconceivable', 'unimaginable'], ['inconclusive', 'uncertain'], ['incongruous', 'inappropriate'], ['inconsequential', 'trivial'], ['inconsiderate', 'thoughtless'],
      ['inconsistent', 'contradictory'], ['inconspicuous', 'unnoticeable'], ['incontestable', 'indisputable'], ['incontrovertible', 'undeniable'], ['inconvenience', 'trouble'],
      ['incorporate', 'integrate'], ['incorrect', 'wrong'], ['incorrigible', 'unmanageable'], ['incorruptible', 'honest'], ['increase', 'augment'],
      ['incredible', 'unbelievable'], ['incredulous', 'skeptical'], ['increment', 'increase'], ['incriminate', 'accuse'], ['incubate', 'hatch'],
      ['inculcate', 'instill'], ['inculpate', 'blame'], ['incumbent', 'obligatory'], ['incur', 'contract'], ['incurable', 'hopeless'],
      ['incursion', 'invasion'], ['indebted', 'obliged'], ['indecent', 'improper'], ['indecision', 'hesitation'], ['indecisive', 'uncertain'],
      ['indefatigable', 'tireless'], ['indefensible', 'unjustifiable'], ['indefinite', 'vague'], ['indelible', 'permanent'], ['indelicate', 'tactless'],
      ['indemnify', 'compensate'], ['indemnity', 'compensation'], ['indent', 'notch'], ['independence', 'autonomy'], ['independent', 'self-reliant'],
      ['indescribable', 'ineffable'], ['indestructible', 'durable'], ['indeterminate', 'uncertain'], ['index', 'indicator'], ['indicate', 'show'],
      ['indication', 'sign'], ['indicative', 'suggestive'], ['indicator', 'sign'], ['indict', 'accuse'], ['indictment', 'accusation'],
      ['indifference', 'apathy'], ['indifferent', 'unconcerned'], ['indigenous', 'native'], ['indigent', 'poor'], ['indigestible', 'unpalatable'],
      ['indignant', 'angry'], ['indignation', 'anger'], ['indignity', 'insult'], ['indirect', 'roundabout'], ['indiscernible', 'imperceptible'],
      ['indiscreet', 'careless'], ['indiscretion', 'mistake'], ['indiscriminate', 'random'], ['indispensable', 'essential'], ['indisposed', 'unwell'],
      ['indisputable', 'undeniable'], ['indissoluble', 'permanent'], ['indistinct', 'unclear'], ['indistinguishable', 'identical'], ['individual', 'person'],
      ['individualism', 'independence'], ['individuality', 'uniqueness'], ['indivisible', 'inseparable'], ['indoctrinate', 'brainwash'], ['indolence', 'laziness'],
      ['indolent', 'lazy'], ['indomitable', 'unconquerable'], ['indoor', 'interior'], ['indorse', 'endorse'], ['indubitable', 'certain'],
      ['induce', 'persuade'], ['inducement', 'incentive'], ['induct', 'initiate'], ['induction', 'introduction'], ['indulge', 'gratify'],
      ['indulgence', 'leniency'], ['indulgent', 'lenient'], ['indurate', 'harden'], ['industrious', 'hardworking'], ['industry', 'business'],
      ['inebriated', 'drunk'], ['ineffable', 'indescribable'], ['ineffective', 'useless'], ['ineffectual', 'futile'], ['inefficiency', 'waste'],
      ['inefficient', 'wasteful'], ['inelegant', 'clumsy'], ['ineligible', 'unqualified'], ['ineluctable', 'inevitable'], ['inept', 'incompetent'],
      ['ineptitude', 'incompetence'], ['inequality', 'disparity'], ['inequitable', 'unfair'], ['inequity', 'injustice'], ['ineradicable', 'permanent'],
      ['inert', 'inactive'], ['inertia', 'passivity'], ['inescapable', 'unavoidable'], ['inessential', 'unnecessary'], ['inestimable', 'invaluable'],
      ['inevitable', 'unavoidable'], ['inevitability', 'certainty'], ['inexact', 'imprecise'], ['inexcusable', 'unforgivable'], ['inexhaustible', 'endless'],
      ['inexorable', 'relentless'], ['inexpedient', 'inadvisable'], ['inexpensive', 'cheap'], ['inexperience', 'naivety'], ['inexperienced', 'novice'],
      ['inexpert', 'unskilled'], ['inexpiable', 'unforgivable'], ['inexplicable', 'mysterious'], ['inexpressible', 'ineffable'], ['inexpressive', 'blank'],
      ['inextinguishable', 'permanent'], ['inextricable', 'inseparable'], ['infallible', 'perfect'], ['infamous', 'notorious'], ['infamy', 'disgrace'],
      ['infancy', 'babyhood'], ['infantile', 'childish'], ['infantry', 'soldiers'], ['infatuate', 'obsess'], ['infatuated', 'obsessed'],
      ['infatuation', 'obsession'], ['infect', 'contaminate'], ['infected', 'diseased'], ['infection', 'disease'], ['infectious', 'contagious'],
      ['infelicitous', 'inappropriate'], ['infer', 'deduce'], ['inference', 'deduction'], ['inferior', 'subordinate'], ['inferiority', 'inadequacy'],
      ['infernal', 'hellish'], ['inferno', 'blaze'], ['infertile', 'barren'], ['infest', 'overrun'], ['infestation', 'plague'],
      ['infidel', 'nonbeliever'], ['infidelity', 'unfaithfulness'], ['infiltrate', 'penetrate'], ['infiltration', 'penetration'], ['infinite', 'endless'],
      ['infinitesimal', 'tiny'], ['infinity', 'eternity'], ['infirm', 'weak'], ['infirmary', 'hospital'], ['infirmity', 'weakness'],
      ['inflame', 'excite'], ['inflamed', 'swollen'], ['inflammable', 'flammable'], ['inflammation', 'swelling'], ['inflammatory', 'provocative'],
      ['inflate', 'expand'], ['inflated', 'exaggerated'], ['inflation', 'expansion'], ['inflect', 'modulate'], ['inflection', 'modulation'],
      ['inflexible', 'rigid'], ['inflexibility', 'rigidity'], ['inflict', 'impose'], ['infliction', 'imposition'], ['influence', 'sway'],
      ['influential', 'powerful'], ['influenza', 'flu'], ['influx', 'inflow'], ['inform', 'notify'], ['informal', 'casual'],
      ['informality', 'casualness'], ['informant', 'source'], ['information', 'data'], ['informative', 'educational'], ['informed', 'knowledgeable'],
      ['informer', 'snitch'], ['infraction', 'violation'], ['infrequent', 'rare'], ['infringe', 'violate'], ['infringement', 'violation'],
      ['infuriate', 'anger'], ['infuriated', 'angry'], ['infuse', 'instill'], ['infusion', 'injection'], ['ingenious', 'clever'],
      ['ingenuity', 'cleverness'], ['ingenuous', 'naive'], ['ingest', 'consume'], ['ingestion', 'consumption'], ['inglorious', 'shameful'],
      ['ingot', 'bar'], ['ingrain', 'instill'], ['ingrained', 'deep-rooted'], ['ingratiate', 'flatter'], ['ingratiating', 'flattering'],
      ['ingratitude', 'ungratefulness'], ['ingredient', 'component'], ['ingress', 'entrance'], ['inhabit', 'occupy'], ['inhabitant', 'resident'],
      ['inhabited', 'populated'], ['inhalation', 'breath'], ['inhale', 'breathe'], ['inharmonious', 'discordant'], ['inherent', 'innate'],
      ['inherit', 'receive'], ['inheritance', 'legacy'], ['inherited', 'hereditary'], ['inheritor', 'heir'], ['inhibit', 'restrain'],
      ['inhibited', 'restrained'], ['inhibition', 'restraint'], ['inhibitor', 'suppressant'], ['inhospitable', 'unfriendly'], ['inhuman', 'cruel'],
      ['inhumane', 'cruel'], ['inhumanity', 'cruelty'], ['inimical', 'hostile'], ['inimitable', 'unique'], ['iniquitous', 'wicked'],
      ['iniquity', 'wickedness'], ['initial', 'first'], ['initially', 'originally'], ['initiate', 'begin'], ['initiation', 'beginning'],
      ['initiative', 'enterprise'], ['inject', 'insert'], ['injection', 'shot'], ['injudicious', 'unwise'], ['injunction', 'order'],
      ['injure', 'hurt'], ['injured', 'hurt'], ['injurious', 'harmful'], ['injury', 'harm'], ['injustice', 'unfairness'],
      ['inkling', 'hint'], ['inland', 'interior'], ['inlay', 'insert'], ['inlet', 'bay'], ['inmate', 'prisoner'],
      ['inmost', 'innermost'], ['inn', 'hotel'], ['innate', 'inherent'], ['inner', 'internal'], ['innermost', 'deepest'],
      ['innocence', 'purity'], ['innocent', 'blameless'], ['innocuous', 'harmless'], ['innovate', 'revolutionize'], ['innovation', 'invention'],
      ['innovative', 'creative'], ['innovator', 'pioneer'], ['innuendo', 'insinuation'], ['innumerable', 'countless'], ['inoculate', 'vaccinate'],
      ['inoculation', 'vaccination'], ['inoffensive', 'harmless'], ['inoperable', 'incurable'], ['inoperative', 'broken'], ['inopportune', 'untimely'],
      ['inordinate', 'excessive'], ['inorganic', 'mineral'], ['input', 'contribution'], ['inquest', 'investigation'], ['inquire', 'ask'],
      ['inquiry', 'investigation'], ['inquisition', 'interrogation'], ['inquisitive', 'curious'], ['inquisitor', 'interrogator'], ['inroad', 'encroachment'],
      ['insalubrious', 'unhealthy'], ['insane', 'mad'], ['insanity', 'madness'], ['insatiable', 'greedy'], ['inscribe', 'engrave'],
      ['inscription', 'engraving'], ['inscrutable', 'mysterious'], ['insect', 'bug'], ['insecure', 'uncertain'], ['insecurity', 'uncertainty'],
      ['insensate', 'unfeeling'], ['insensible', 'unconscious'], ['insensitive', 'callous'], ['insensitivity', 'callousness'], ['inseparable', 'indivisible'],
      ['insert', 'introduce'], ['insertion', 'introduction'], ['inset', 'insert'], ['inside', 'interior'], ['insider', 'member'],
      ['insidious', 'treacherous'], ['insight', 'understanding'], ['insightful', 'perceptive'], ['insignia', 'badge'], ['insignificance', 'triviality'],
      ['insignificant', 'trivial'], ['insincere', 'dishonest'], ['insincerity', 'dishonesty'], ['insinuate', 'hint'], ['insinuation', 'hint'],
      ['insipid', 'bland'], ['insist', 'demand'], ['insistence', 'persistence'], ['insistent', 'persistent'], ['insobriety', 'drunkenness'],
      ['insolence', 'rudeness'], ['insolent', 'rude'], ['insoluble', 'unsolvable'], ['insolvency', 'bankruptcy'], ['insolvent', 'bankrupt'],
      ['insomnia', 'sleeplessness'], ['insouciance', 'nonchalance'], ['insouciant', 'carefree'], ['inspect', 'examine'], ['inspection', 'examination'],
      ['inspector', 'examiner'], ['inspiration', 'motivation'], ['inspirational', 'motivational'], ['inspire', 'motivate'], ['inspired', 'brilliant'],
      ['inspiring', 'uplifting'], ['instability', 'volatility'], ['install', 'set-up'], ['installation', 'setup'], ['installment', 'payment'],
      ['instance', 'example'], ['instant', 'moment'], ['instantaneous', 'immediate'], ['instantly', 'immediately'], ['instead', 'alternatively'],
      ['instigate', 'provoke'], ['instigation', 'provocation'], ['instigator', 'agitator'], ['instill', 'implant'], ['instinct', 'intuition'],
      ['instinctive', 'intuitive'], ['instinctively', 'intuitively'], ['institute', 'establish'], ['institution', 'establishment'], ['institutional', 'established'],
      ['instruct', 'teach'], ['instruction', 'teaching'], ['instructional', 'educational'], ['instructive', 'informative'], ['instructor', 'teacher'],
      ['instrument', 'tool'], ['instrumental', 'helpful'], ['insubordinate', 'disobedient'], ['insubordination', 'disobedience'], ['insubstantial', 'flimsy'],
      ['insufferable', 'unbearable'], ['insufficiency', 'inadequacy'], ['insufficient', 'inadequate'], ['insular', 'isolated'], ['insularity', 'isolation'],
      ['insulate', 'isolate'], ['insulation', 'isolation'], ['insulator', 'barrier'], ['insult', 'offend'], ['insulting', 'offensive'],
      ['insuperable', 'insurmountable'], ['insupportable', 'unbearable'], ['insurance', 'coverage'], ['insure', 'ensure'], ['insured', 'protected'],
      ['insurgence', 'uprising'], ['insurgency', 'rebellion'], ['insurgent', 'rebel'], ['insurmountable', 'impossible'], ['insurrection', 'rebellion'],
      ['intact', 'whole'], ['intake', 'consumption'], ['intangible', 'abstract'], ['integer', 'whole-number'], ['integral', 'essential'],
      ['integrate', 'combine'], ['integrated', 'unified'], ['integration', 'unification'], ['integrity', 'honesty'], ['integument', 'covering'],
      ['intellect', 'intelligence'], ['intellectual', 'scholar'], ['intelligence', 'cleverness'], ['intelligent', 'smart'], ['intelligentsia', 'intellectuals'],
      ['intelligible', 'understandable'], ['intemperance', 'excess'], ['intemperate', 'excessive'], ['intend', 'plan'], ['intended', 'planned'],
      ['intense', 'extreme'], ['intensely', 'extremely'], ['intensification', 'increase'], ['intensify', 'strengthen'], ['intensity', 'strength'],
      ['intensive', 'concentrated'], ['intent', 'purpose'], ['intention', 'aim'], ['intentional', 'deliberate'], ['intentionally', 'deliberately'],
      ['inter', 'bury'], ['interact', 'communicate'], ['interaction', 'communication'], ['interactive', 'communicative'], ['intercede', 'mediate'],
      ['intercept', 'block'], ['interception', 'blockage'], ['intercession', 'mediation'], ['interchange', 'exchange'], ['interchangeable', 'exchangeable'],
      ['interconnect', 'link'], ['interconnection', 'linkage'], ['intercourse', 'communication'], ['interdependence', 'mutual-dependence'], ['interdependent', 'mutually-dependent'],
      ['interdict', 'prohibit'], ['interdiction', 'prohibition'], ['interest', 'concern'], ['interested', 'concerned'], ['interesting', 'fascinating'],
      ['interface', 'connection'], ['interfere', 'meddle'], ['interference', 'meddling'], ['interim', 'temporary'], ['interior', 'inside'],
      ['interject', 'interrupt'], ['interjection', 'interruption'], ['interlace', 'interweave'], ['interlock', 'connect'], ['interloper', 'intruder'],
      ['interlude', 'intermission'], ['intermediary', 'mediator'], ['intermediate', 'middle'], ['interment', 'burial'], ['interminable', 'endless'],
      ['intermingle', 'mix'], ['intermission', 'break'], ['intermittent', 'sporadic'], ['intermix', 'blend'], ['intern', 'apprentice'],
      ['internal', 'inner'], ['internalize', 'absorb'], ['international', 'global'], ['internecine', 'destructive'], ['internment', 'imprisonment'],
      ['interpenetrate', 'permeate'], ['interplay', 'interaction'], ['interpolate', 'insert'], ['interpose', 'intervene'], ['interposition', 'intervention']
    ],
    'cause-effect': [
      // Causal relationships - sophisticated
      ['drought', 'famine'], ['earthquake', 'tsunami'], ['erosion', 'landslide'], ['deforestation', 'flooding'], ['pollution', 'disease'],
      ['friction', 'heat'], ['pressure', 'explosion'], ['gravity', 'falling'], ['magnetism', 'attraction'], ['electricity', 'shock'],
      ['combustion', 'fire'], ['oxidation', 'rust'], ['evaporation', 'vapor'], ['condensation', 'dew'], ['freezing', 'ice'],
      ['melting', 'liquid'], ['fermentation', 'alcohol'], ['photosynthesis', 'oxygen'], ['respiration', 'energy'], ['digestion', 'nutrition'],
      ['infection', 'fever'], ['inflammation', 'swelling'], ['hemorrhage', 'bleeding'], ['fracture', 'pain'], ['contusion', 'bruise'],
      ['vaccination', 'immunity'], ['antibiotic', 'healing'], ['anesthetic', 'numbness'], ['stimulant', 'alertness'], ['sedative', 'drowsiness'],
      ['exercise', 'fitness'], ['training', 'skill'], ['practice', 'proficiency'], ['study', 'knowledge'], ['education', 'enlightenment'],
      ['neglect', 'deterioration'], ['maintenance', 'preservation'], ['repair', 'restoration'], ['investment', 'profit'], ['savings', 'accumulation'],
      ['spending', 'depletion'], ['borrowing', 'debt'], ['taxation', 'revenue'], ['inflation', 'devaluation'], ['recession', 'unemployment'],
      ['innovation', 'progress'], ['research', 'discovery'], ['experimentation', 'learning'], ['observation', 'understanding'], ['analysis', 'insight'],
      ['synthesis', 'creation'], ['optimization', 'efficiency'], ['automation', 'productivity'], ['specialization', 'expertise'], ['diversification', 'security'],
      ['concentration', 'focus'], ['meditation', 'calmness'], ['relaxation', 'stress-relief'], ['sleep', 'restoration'], ['rest', 'recovery'],
      ['fatigue', 'exhaustion'], ['overwork', 'burnout'], ['stress', 'illness'], ['anxiety', 'tension'], ['depression', 'apathy'],
      ['motivation', 'achievement'], ['encouragement', 'confidence'], ['praise', 'satisfaction'], ['criticism', 'improvement'], ['feedback', 'adjustment'],
      ['communication', 'understanding'], ['negotiation', 'agreement'], ['cooperation', 'success'], ['collaboration', 'synergy'], ['partnership', 'mutual-benefit'],
      ['competition', 'innovation'], ['rivalry', 'motivation'], ['conflict', 'resolution'], ['dispute', 'settlement'], ['argument', 'conclusion'],
      ['persuasion', 'conviction'], ['influence', 'change'], ['leadership', 'direction'], ['management', 'organization'], ['supervision', 'compliance'],
      ['authority', 'obedience'], ['power', 'control'], ['domination', 'submission'], ['oppression', 'rebellion'], ['tyranny', 'revolution'],
      ['liberty', 'freedom'], ['democracy', 'participation'], ['voting', 'representation'], ['legislation', 'regulation'], ['enforcement', 'compliance'],
      ['violation', 'punishment'], ['crime', 'consequence'], ['justice', 'fairness'], ['equity', 'balance'], ['impartiality', 'trust'],
      ['corruption', 'injustice'], ['fraud', 'loss'], ['theft', 'deprivation'], ['vandalism', 'damage'], ['assault', 'injury'],
      ['negligence', 'accident'], ['recklessness', 'danger'], ['caution', 'safety'], ['precaution', 'prevention'], ['protection', 'security'],
      ['fortification', 'defense'], ['deterrence', 'dissuasion'], ['intimidation', 'fear'], ['threat', 'concern'], ['warning', 'awareness'],
      ['notification', 'information'], ['announcement', 'knowledge'], ['publication', 'dissemination'], ['broadcast', 'reception'], ['transmission', 'delivery'],
      ['transportation', 'movement'], ['migration', 'displacement'], ['immigration', 'diversity'], ['emigration', 'exodus'], ['travel', 'exploration'],
      ['navigation', 'direction'], ['guidance', 'orientation'], ['instruction', 'learning'], ['teaching', 'comprehension'], ['explanation', 'clarity'],
      ['demonstration', 'illustration'], ['example', 'understanding'], ['model', 'replication'], ['prototype', 'testing'], ['experiment', 'verification'],
      ['measurement', 'quantification'], ['assessment', 'evaluation'], ['examination', 'diagnosis'], ['investigation', 'revelation'], ['inquiry', 'answer'],
      ['question', 'curiosity'], ['wonder', 'exploration'], ['doubt', 'skepticism'], ['suspicion', 'investigation'], ['certainty', 'confidence'],
      ['proof', 'belief'], ['evidence', 'conviction'], ['testimony', 'credibility'], ['witness', 'verification'], ['documentation', 'record'],
      ['registration', 'recognition'], ['certification', 'qualification'], ['authorization', 'permission'], ['approval', 'acceptance'], ['endorsement', 'support'],
      ['recommendation', 'consideration'], ['nomination', 'candidacy'], ['election', 'representation'], ['appointment', 'assignment'], ['designation', 'role'],
      ['promotion', 'advancement'], ['demotion', 'regression'], ['transfer', 'relocation'], ['dismissal', 'termination'], ['resignation', 'departure'],
      ['retirement', 'cessation'], ['succession', 'continuation'], ['inheritance', 'legacy'], ['tradition', 'preservation'], ['custom', 'practice'],
      ['ritual', 'ceremony'], ['celebration', 'joy'], ['mourning', 'grief'], ['sympathy', 'compassion'], ['empathy', 'connection'],
      ['bonding', 'attachment'], ['affection', 'love'], ['devotion', 'loyalty'], ['commitment', 'dedication'], ['perseverance', 'achievement'],
      // Additional 200+ cause-effect pairs for more depth
      ['ambition', 'success'], ['aspiration', 'achievement'], ['belief', 'conviction'], ['boldness', 'risk-taking'], ['boredom', 'inaction'],
      ['bravery', 'heroism'], ['carelessness', 'mistake'], ['compassion', 'kindness'], ['confidence', 'success'], ['confusion', 'error'],
      ['cooperation', 'teamwork'], ['courage', 'action'], ['creativity', 'innovation'], ['curiosity', 'discovery'], ['deception', 'distrust'],
      ['dedication', 'excellence'], ['delay', 'frustration'], ['denial', 'ignorance'], ['determination', 'perseverance'], ['diligence', 'success'],
      ['disappointment', 'sadness'], ['discipline', 'mastery'], ['dishonesty', 'distrust'], ['disobedience', 'punishment'], ['disorganization', 'chaos'],
      ['doubt', 'hesitation'], ['efficiency', 'productivity'], ['effort', 'achievement'], ['embarrassment', 'shame'], ['empathy', 'understanding'],
      ['enthusiasm', 'energy'], ['envy', 'resentment'], ['error', 'correction'], ['ethics', 'integrity'], ['exhaustion', 'fatigue'],
      ['experience', 'wisdom'], ['expertise', 'authority'], ['exploitation', 'harm'], ['exploration', 'discovery'], ['exposure', 'awareness'],
      ['fairness', 'justice'], ['faith', 'belief'], ['fame', 'recognition'], ['fear', 'avoidance'], ['focus', 'clarity'],
      ['forgiveness', 'healing'], ['freedom', 'choice'], ['friendship', 'loyalty'], ['frustration', 'anger'], ['generosity', 'gratitude'],
      ['goal', 'achievement'], ['gratitude', 'happiness'], ['greed', 'corruption'], ['grief', 'sorrow'], ['guilt', 'remorse'],
      ['happiness', 'contentment'], ['hard-work', 'success'], ['harmony', 'peace'], ['hatred', 'violence'], ['health', 'vitality'],
      ['honesty', 'trust'], ['hope', 'optimism'], ['hostility', 'conflict'], ['humility', 'respect'], ['hunger', 'eating'],
      ['hypocrisy', 'distrust'], ['idealism', 'disappointment'], ['ignorance', 'misunderstanding'], ['imagination', 'creativity'], ['imitation', 'learning'],
      ['impatience', 'frustration'], ['improvisation', 'creativity'], ['impulse', 'action'], ['inaction', 'stagnation'], ['incentive', 'motivation'],
      ['indecision', 'delay'], ['indifference', 'apathy'], ['inefficiency', 'waste'], ['inequality', 'injustice'], ['inspiration', 'creation'],
      ['integrity', 'trust'], ['intelligence', 'problem-solving'], ['intention', 'action'], ['intimidation', 'compliance'], ['intuition', 'insight'],
      ['jealousy', 'conflict'], ['joy', 'laughter'], ['judgment', 'evaluation'], ['kindness', 'appreciation'], ['knowledge', 'power'],
      ['labor', 'product'], ['laziness', 'failure'], ['leadership', 'influence'], ['learning', 'growth'], ['loneliness', 'isolation'],
      ['love', 'happiness'], ['loyalty', 'trust'], ['luck', 'opportunity'], ['manipulation', 'control'], ['meditation', 'peace'],
      ['misunderstanding', 'conflict'], ['modesty', 'respect'], ['momentum', 'progress'], ['morality', 'ethics'], ['necessity', 'invention'],
      ['negativity', 'pessimism'], ['networking', 'opportunities'], ['nostalgia', 'longing'], ['obedience', 'compliance'], ['objectivity', 'fairness'],
      ['obligation', 'responsibility'], ['observation', 'insight'], ['obsession', 'compulsion'], ['optimism', 'positivity'], ['oppression', 'resistance'],
      ['organization', 'efficiency'], ['originality', 'uniqueness'], ['overconfidence', 'failure'], ['pain', 'suffering'], ['panic', 'chaos'],
      ['passion', 'commitment'], ['patience', 'calmness'], ['peer-pressure', 'conformity'], ['perception', 'understanding'], ['perfection', 'excellence'],
      ['persistence', 'success'], ['persuasion', 'influence'], ['pessimism', 'despair'], ['planning', 'organization'], ['politeness', 'respect'],
      ['popularity', 'influence'], ['poverty', 'hunger'], ['power', 'influence'], ['practice', 'improvement'], ['prejudice', 'discrimination'],
      ['preparation', 'readiness'], ['pressure', 'stress'], ['pride', 'confidence'], ['priority', 'importance'], ['privilege', 'advantage'],
      ['procrastination', 'delay'], ['productivity', 'achievement'], ['professionalism', 'respect'], ['progress', 'advancement'], ['propaganda', 'manipulation'],
      ['prosperity', 'wealth'], ['provocation', 'reaction'], ['punishment', 'deterrence'], ['purpose', 'motivation'], ['quality', 'satisfaction'],
      ['questioning', 'learning'], ['rationalization', 'denial'], ['realism', 'pragmatism'], ['reason', 'logic'], ['rebellion', 'change'],
      ['recognition', 'motivation'], ['reflection', 'insight'], ['regret', 'remorse'], ['rejection', 'disappointment'], ['relaxation', 'calmness'],
      ['reliability', 'trust'], ['repetition', 'mastery'], ['reputation', 'credibility'], ['resentment', 'bitterness'], ['resilience', 'recovery'],
      ['resistance', 'persistence'], ['resourcefulness', 'innovation'], ['respect', 'admiration'], ['responsibility', 'accountability'], ['restraint', 'discipline'],
      ['retaliation', 'escalation'], ['revenge', 'satisfaction'], ['reverence', 'respect'], ['risk', 'opportunity'], ['routine', 'habit'],
      ['sacrifice', 'loss'], ['sadness', 'tears'], ['safety', 'security'], ['satisfaction', 'contentment'], ['scarcity', 'value'],
      ['schedule', 'organization'], ['secrecy', 'mystery'], ['security', 'confidence'], ['selfishness', 'isolation'], ['shame', 'embarrassment'],
      ['sharing', 'community'], ['silence', 'peace'], ['simplicity', 'clarity'], ['sincerity', 'authenticity'], ['skepticism', 'doubt'],
      ['skill', 'competence'], ['sloth', 'laziness'], ['solitude', 'reflection'], ['sophistication', 'complexity'], ['sorrow', 'grief'],
      ['speculation', 'uncertainty'], ['speed', 'efficiency'], ['spontaneity', 'creativity'], ['stability', 'security'], ['stamina', 'endurance'],
      ['standardization', 'consistency'], ['starvation', 'weakness'], ['stimulation', 'engagement'], ['strategy', 'planning'], ['strength', 'power'],
      ['stubbornness', 'conflict'], ['submission', 'compliance'], ['substance-abuse', 'addiction'], ['subtlety', 'sophistication'], ['success', 'confidence'],
      ['suffering', 'empathy'], ['suggestion', 'consideration'], ['superstition', 'irrationality'], ['support', 'encouragement'], ['suppression', 'rebellion'],
      ['surprise', 'shock'], ['surrender', 'defeat'], ['survival', 'adaptation'], ['suspense', 'anticipation'], ['suspicion', 'distrust'],
      ['sympathy', 'support'], ['talent', 'advantage'], ['teamwork', 'collaboration'], ['technology', 'progress'], ['temptation', 'desire'],
      ['tension', 'conflict'], ['terror', 'fear'], ['thankfulness', 'appreciation'], ['thoughtfulness', 'consideration'], ['thrift', 'savings'],
      ['tolerance', 'acceptance'], ['torture', 'pain'], ['tradition', 'continuity'], ['tragedy', 'sorrow'], ['transparency', 'trust'],
      ['trauma', 'ptsd'], ['treachery', 'betrayal'], ['treatment', 'cure'], ['triumph', 'joy'], ['trust', 'confidence'],
      ['truth', 'clarity'], ['uncertainty', 'anxiety'], ['understanding', 'empathy'], ['unemployment', 'poverty'], ['unity', 'strength'],
      ['urgency', 'stress'], ['validation', 'confidence'], ['value', 'worth'], ['vanity', 'narcissism'], ['variety', 'diversity'],
      ['vengeance', 'retaliation'], ['victory', 'celebration'], ['vigilance', 'safety'], ['violence', 'trauma'], ['virtue', 'goodness'],
      ['visibility', 'awareness'], ['vision', 'clarity'], ['vitality', 'energy'], ['vulnerability', 'exposure'], ['war', 'destruction'],
      ['warning', 'prevention'], ['weakness', 'vulnerability'], ['wealth', 'power'], ['weariness', 'exhaustion'], ['willpower', 'discipline'],
      ['wisdom', 'judgment'], ['wonder', 'curiosity'], ['worry', 'anxiety'], ['worship', 'devotion'], ['wrath', 'destruction'],
      ['zeal', 'enthusiasm'], ['zealotry', 'extremism']
    ],
    'tool-action': [
      // Tool to action relationships
      ['hammer', 'pound'], ['saw', 'cut'], ['drill', 'bore'], ['wrench', 'turn'], ['screwdriver', 'twist'],
      ['pliers', 'grip'], ['chisel', 'carve'], ['file', 'smooth'], ['sandpaper', 'polish'], ['brush', 'paint'],
      ['scissors', 'snip'], ['knife', 'slice'], ['cleaver', 'chop'], ['peeler', 'peel'], ['grater', 'shred'],
      ['whisk', 'beat'], ['spatula', 'flip'], ['ladle', 'scoop'], ['tongs', 'grasp'], ['colander', 'drain'],
      ['sieve', 'sift'], ['strainer', 'filter'], ['blender', 'mix'], ['mixer', 'blend'], ['processor', 'chop'],
      ['toaster', 'toast'], ['oven', 'bake'], ['grill', 'roast'], ['microwave', 'heat'], ['refrigerator', 'chill'],
      ['freezer', 'freeze'], ['kettle', 'boil'], ['pot', 'cook'], ['pan', 'fry'], ['wok', 'stir-fry'],
      ['broom', 'sweep'], ['mop', 'clean'], ['vacuum', 'suck'], ['duster', 'dust'], ['sponge', 'wipe'],
      ['iron', 'press'], ['washer', 'wash'], ['dryer', 'dry'], ['hanger', 'hang'], ['clothespin', 'clip'],
      ['needle', 'sew'], ['thread', 'stitch'], ['scissors', 'cut'], ['ruler', 'measure'], ['compass', 'draw'],
      ['protractor', 'angle'], ['calculator', 'compute'], ['abacus', 'count'], ['pencil', 'write'], ['eraser', 'erase'],
      ['pen', 'inscribe'], ['marker', 'mark'], ['highlighter', 'emphasize'], ['stamp', 'imprint'], ['seal', 'close'],
      ['stapler', 'bind'], ['clip', 'fasten'], ['tape', 'stick'], ['glue', 'adhere'], ['pin', 'attach'],
      ['magnet', 'attract'], ['hook', 'hang'], ['nail', 'fasten'], ['screw', 'secure'], ['bolt', 'lock'],
      ['key', 'unlock'], ['lock', 'secure'], ['chain', 'restrain'], ['rope', 'bind'], ['cord', 'tie'],
      ['lever', 'lift'], ['pulley', 'hoist'], ['crane', 'raise'], ['jack', 'elevate'], ['hoist', 'suspend'],
      ['shovel', 'dig'], ['spade', 'excavate'], ['rake', 'gather'], ['hoe', 'till'], ['plow', 'furrow'],
      ['sickle', 'reap'], ['scythe', 'mow'], ['shears', 'trim'], ['pruner', 'prune'], ['loppers', 'cut'],
      ['wheelbarrow', 'cart'], ['wagon', 'haul'], ['trolley', 'transport'], ['dolly', 'move'], ['forklift', 'lift'],
      ['microscope', 'magnify'], ['telescope', 'observe'], ['binoculars', 'view'], ['magnifier', 'enlarge'], ['lens', 'focus'],
      ['camera', 'photograph'], ['video', 'record'], ['microphone', 'capture'], ['speaker', 'amplify'], ['headphones', 'listen'],
      ['guitar', 'strum'], ['piano', 'play'], ['drum', 'beat'], ['trumpet', 'blow'], ['violin', 'bow'],
      ['flute', 'blow'], ['clarinet', 'toot'], ['saxophone', 'play'], ['harmonica', 'suck'], ['accordion', 'squeeze'],
      ['bat', 'hit'], ['racket', 'swing'], ['club', 'strike'], ['paddle', 'row'], ['oar', 'propel'],
      ['sail', 'navigate'], ['rudder', 'steer'], ['wheel', 'drive'], ['pedal', 'cycle'], ['brake', 'stop'],
      ['accelerator', 'speed'], ['clutch', 'engage'], ['gear', 'shift'], ['steering-wheel', 'turn'], ['horn', 'honk'],
      ['bell', 'ring'], ['whistle', 'blow'], ['alarm', 'alert'], ['siren', 'warn'], ['beacon', 'signal'],
      ['flashlight', 'illuminate'], ['lamp', 'light'], ['candle', 'glow'], ['torch', 'burn'], ['lighter', 'ignite'],
      ['match', 'strike'], ['flint', 'spark'], ['extinguisher', 'quench'], ['hose', 'spray'], ['sprinkler', 'water'],
      ['faucet', 'pour'], ['valve', 'regulate'], ['pump', 'circulate'], ['compressor', 'pressurize'], ['fan', 'ventilate'],
      ['heater', 'warm'], ['cooler', 'chill'], ['thermostat', 'regulate'], ['filter', 'purify'], ['sifter', 'separate'],
      ['scale', 'weigh'], ['meter', 'measure'], ['gauge', 'indicate'], ['thermometer', 'read'], ['barometer', 'predict'],
      ['compass', 'orient'], ['map', 'navigate'], ['chart', 'plot'], ['graph', 'display'], ['diagram', 'illustrate'],
      ['pencil', 'sketch'], ['crayon', 'color'], ['paintbrush', 'stroke'], ['palette', 'mix'], ['easel', 'support'],
      ['chisel', 'sculpt'], ['mallet', 'shape'], ['awl', 'pierce'], ['gimlet', 'drill'], ['auger', 'bore'],
      // Additional 150+ tool-action pairs for comprehensive coverage
      ['axe', 'chop'], ['adze', 'smooth'], ['anvil', 'forge'], ['apron', 'protect'], ['balancer', 'equilibrate'],
      ['bandsaw', 'slice'], ['bellows', 'inflate'], ['blowtorch', 'weld'], ['bolt-cutter', 'sever'], ['buffer', 'polish'],
      ['burner', 'heat'], ['calipers', 'measure'], ['can-opener', 'open'], ['caulking-gun', 'seal'], ['cement-mixer', 'blend'],
      ['chainsaw', 'fell'], ['circular-saw', 'rip'], ['claw-hammer', 'extract'], ['cleats', 'grip'], ['clinometer', 'measure'],
      ['clothesline', 'dry'], ['compactor', 'compress'], ['corkscrew', 'uncork'], ['crowbar', 'pry'], ['cultivator', 'loosen'],
      ['curling-iron', 'curl'], ['dart', 'throw'], ['defibrillator', 'shock'], ['dividers', 'measure'], ['dowel', 'join'],
      ['drawknife', 'shave'], ['dumbbells', 'lift'], ['edger', 'trim'], ['emery-board', 'file'], ['excavator', 'dig'],
      ['extractor', 'remove'], ['eyedropper', 'dispense'], ['faucet-wrench', 'tighten'], ['fertilizer-spreader', 'distribute'], ['finishing-sander', 'finish'],
      ['fishing-rod', 'cast'], ['funnel', 'pour'], ['garden-fork', 'turn'], ['gasket-scraper', 'clean'], ['gauge-block', 'calibrate'],
      ['glass-cutter', 'score'], ['glue-gun', 'bond'], ['goggles', 'protect'], ['grater', 'shred'], ['grease-gun', 'lubricate'],
      ['grinder', 'sharpen'], ['hacksaw', 'cut'], ['hair-dryer', 'dry'], ['handsaw', 'cut'], ['harness', 'secure'],
      ['harvester', 'reap'], ['hay-fork', 'lift'], ['hedge-trimmer', 'prune'], ['hex-key', 'tighten'], ['hoist', 'lift'],
      ['hole-punch', 'puncture'], ['honing-stone', 'sharpen'], ['hose-clamp', 'secure'], ['hydraulic-jack', 'lift'], ['hydrometer', 'measure'],
      ['ice-pick', 'chip'], ['impact-driver', 'drive'], ['inclinometer', 'measure'], ['jigsaw', 'curve'], ['jointer', 'flatten'],
      ['kettle', 'boil'], ['ladder', 'climb'], ['lathe', 'turn'], ['lawn-mower', 'mow'], ['leaf-blower', 'blow'],
      ['level', 'align'], ['log-splitter', 'split'], ['loppers', 'trim'], ['lubricator', 'oil'], ['machete', 'slash'],
      ['magnifying-glass', 'enlarge'], ['mandrel', 'shape'], ['mattock', 'dig'], ['maul', 'split'], ['measuring-tape', 'measure'],
      ['micrometer', 'measure'], ['mixer', 'combine'], ['mortar', 'crush'], ['nail-gun', 'fasten'], ['needle-nose', 'grip'],
      ['nut-driver', 'turn'], ['oil-can', 'lubricate'], ['pallet-jack', 'move'], ['paring-knife', 'pare'], ['peeler', 'skin'],
      ['pestle', 'grind'], ['pick', 'break'], ['pickaxe', 'break'], ['pipe-cutter', 'sever'], ['pipe-wrench', 'grip'],
      ['plane', 'smooth'], ['planer', 'level'], ['pliers', 'grasp'], ['plumb-bob', 'align'], ['plunger', 'unclog'],
      ['pneumatic-drill', 'bore'], ['pocketknife', 'cut'], ['post-driver', 'pound'], ['potato-masher', 'mash'], ['power-drill', 'bore'],
      ['pressure-washer', 'clean'], ['pry-bar', 'leverage'], ['pulley-system', 'lift'], ['putty-knife', 'spread'], ['rasp', 'file'],
      ['ratchet', 'tighten'], ['reamer', 'enlarge'], ['reciprocating-saw', 'demolish'], ['rivet-gun', 'fasten'], ['roller', 'flatten'],
      ['router', 'hollow'], ['safety-glasses', 'protect'], ['sander', 'smooth'], ['sandblaster', 'clean'], ['sawhorse', 'support'],
      ['scalpel', 'incise'], ['scissors', 'trim'], ['scoop', 'gather'], ['scraper', 'remove'], ['scribe', 'mark'],
      ['scythe', 'cut'], ['sealer', 'waterproof'], ['secateurs', 'prune'], ['sharpener', 'hone'], ['shears', 'clip'],
      ['shovel', 'scoop'], ['sickle', 'harvest'], ['sieve', 'separate'], ['socket-set', 'loosen'], ['soldering-iron', 'join'],
      ['spacer', 'separate'], ['spanner', 'turn'], ['spray-bottle', 'spritz'], ['spreader', 'distribute'], ['square', 'check'],
      ['squeegee', 'wipe'], ['staple-gun', 'attach'], ['stethoscope', 'listen'], ['stopwatch', 'time'], ['strainer', 'drain'],
      ['strap-wrench', 'grip'], ['stud-finder', 'locate'], ['surveyor-wheel', 'measure'], ['swatter', 'kill'], ['swiss-army-knife', 'multifunction'],
      ['syringe', 'inject'], ['tack-hammer', 'tap'], ['tamper', 'compact'], ['tarp', 'cover'], ['tenderizer', 'pound'],
      ['thermometer', 'measure'], ['thresher', 'separate'], ['tile-cutter', 'score'], ['tiller', 'cultivate'], ['tin-snips', 'cut'],
      ['tire-iron', 'pry'], ['toggle-clamp', 'hold'], ['torque-wrench', 'tighten'], ['trowel', 'spread'], ['tuning-fork', 'calibrate'],
      ['tweezers', 'pluck'], ['utility-knife', 'slice'], ['vise-grip', 'clamp'], ['voltmeter', 'measure'], ['watering-can', 'irrigate'],
      ['wedge', 'split'], ['welding-torch', 'fuse'], ['wheelbarrow', 'transport'], ['whetstone', 'sharpen'], ['winch', 'pull'],
      ['wire-brush', 'clean'], ['wire-cutter', 'snip'], ['wire-stripper', 'strip'], ['wood-plane', 'shave'], ['wrench-set', 'turn']
    ],
    'material-product': [
      // Raw material to finished product
      ['wood', 'furniture'], ['timber', 'lumber'], ['tree', 'paper'], ['pulp', 'cardboard'], ['bamboo', 'scaffolding'],
      ['cotton', 'fabric'], ['wool', 'yarn'], ['silk', 'cloth'], ['flax', 'linen'], ['hemp', 'rope'],
      ['leather', 'shoe'], ['hide', 'leather'], ['fur', 'coat'], ['feather', 'pillow'], ['down', 'comforter'],
      ['clay', 'pottery'], ['mud', 'brick'], ['sand', 'glass'], ['silica', 'silicon'], ['quartz', 'crystal'],
      ['iron-ore', 'steel'], ['bauxite', 'aluminum'], ['copper-ore', 'copper'], ['gold-ore', 'gold'], ['silver-ore', 'silver'],
      ['crude-oil', 'gasoline'], ['petroleum', 'plastic'], ['coal', 'fuel'], ['natural-gas', 'propane'], ['uranium', 'nuclear-energy'],
      ['wheat', 'flour'], ['grain', 'bread'], ['rice', 'meal'], ['corn', 'cornmeal'], ['barley', 'malt'],
      ['grapes', 'wine'], ['hops', 'beer'], ['sugarcane', 'sugar'], ['cocoa', 'chocolate'], ['coffee-bean', 'coffee'],
      ['tea-leaf', 'tea'], ['tobacco', 'cigar'], ['opium', 'morphine'], ['latex', 'rubber'], ['resin', 'plastic'],
      ['milk', 'cheese'], ['cream', 'butter'], ['soy', 'tofu'], ['curd', 'yogurt'], ['whey', 'protein'],
      ['ore', 'metal'], ['mineral', 'compound'], ['crystal', 'gem'], ['diamond-ore', 'diamond'], ['emerald-ore', 'emerald'],
      ['marble', 'sculpture'], ['granite', 'countertop'], ['limestone', 'cement'], ['gypsum', 'plaster'], ['slate', 'roof'],
      ['fiber', 'rope'], ['thread', 'fabric'], ['yarn', 'sweater'], ['strand', 'cord'], ['filament', 'wire'],
      ['pulp', 'paper'], ['cellulose', 'cellophane'], ['starch', 'adhesive'], ['gelatin', 'jelly'], ['agar', 'culture-medium'],
      ['silicon', 'chip'], ['germanium', 'transistor'], ['graphite', 'pencil'], ['carbon', 'diamond'], ['charcoal', 'filter'],
      ['petroleum', 'kerosene'], ['crude', 'diesel'], ['bitumen', 'asphalt'], ['tar', 'pitch'], ['wax', 'candle'],
      ['beeswax', 'polish'], ['honey', 'mead'], ['nectar', 'honey'], ['pollen', 'propolis'], ['sap', 'syrup'],
      ['latex', 'paint'], ['pigment', 'dye'], ['mineral', 'pigment'], ['ochre', 'paint'], ['indigo', 'blue-dye'],
      ['hemp', 'canvas'], ['jute', 'burlap'], ['sisal', 'twine'], ['coir', 'mat'], ['raffia', 'basket'],
      ['rattan', 'furniture'], ['wicker', 'chair'], ['cane', 'walking-stick'], ['reed', 'mat'], ['straw', 'hat'],
      ['feather', 'quill'], ['bone', 'button'], ['horn', 'comb'], ['ivory', 'carving'], ['shell', 'jewelry'],
      ['pearl', 'necklace'], ['coral', 'ornament'], ['amber', 'pendant'], ['jade', 'sculpture'], ['turquoise', 'ring'],
      ['glass', 'window'], ['crystal', 'chandelier'], ['ceramic', 'tile'], ['porcelain', 'dish'], ['terracotta', 'pot'],
      ['cement', 'concrete'], ['mortar', 'bond'], ['grout', 'filler'], ['plaster', 'wall'], ['stucco', 'finish'],
      ['brick', 'wall'], ['stone', 'foundation'], ['beam', 'structure'], ['plank', 'floor'], ['shingle', 'roof'],
      ['aluminum', 'can'], ['tin', 'container'], ['copper', 'wire'], ['brass', 'instrument'], ['bronze', 'statue'],
      ['steel', 'beam'], ['iron', 'nail'], ['zinc', 'coating'], ['lead', 'battery'], ['mercury', 'thermometer'],
      ['plastic', 'bottle'], ['polyester', 'fabric'], ['nylon', 'stocking'], ['acrylic', 'paint'], ['vinyl', 'record'],
      ['foam', 'cushion'], ['sponge', 'pad'], ['felt', 'hat'], ['velvet', 'curtain'], ['satin', 'ribbon'],
      ['denim', 'jeans'], ['tweed', 'jacket'], ['corduroy', 'pants'], ['flannel', 'shirt'], ['muslin', 'cloth']
    ],
    'abstract-concept': [
      // Complex abstract relationships
      ['theory', 'hypothesis'], ['principle', 'axiom'], ['concept', 'idea'], ['notion', 'thought'], ['belief', 'conviction'],
      ['opinion', 'viewpoint'], ['perspective', 'outlook'], ['paradigm', 'framework'], ['philosophy', 'wisdom'], ['ideology', 'doctrine'],
      ['methodology', 'approach'], ['strategy', 'tactic'], ['policy', 'guideline'], ['regulation', 'rule'], ['protocol', 'procedure'],
      ['algorithm', 'process'], ['formula', 'equation'], ['theorem', 'proof'], ['lemma', 'proposition'], ['corollary', 'consequence'],
      ['premise', 'conclusion'], ['argument', 'reasoning'], ['logic', 'rationality'], ['inference', 'deduction'], ['assumption', 'presupposition'],
      ['hypothesis', 'conjecture'], ['prediction', 'forecast'], ['estimation', 'approximation'], ['calculation', 'computation'], ['analysis', 'examination'],
      ['synthesis', 'integration'], ['abstraction', 'generalization'], ['specification', 'detail'], ['definition', 'meaning'], ['interpretation', 'explanation'],
      ['description', 'characterization'], ['classification', 'categorization'], ['taxonomy', 'hierarchy'], ['ontology', 'existence'], ['epistemology', 'knowledge'],
      ['metaphysics', 'reality'], ['ethics', 'morality'], ['aesthetics', 'beauty'], ['axiology', 'value'], ['teleology', 'purpose'],
      ['phenomenology', 'experience'], ['hermeneutics', 'interpretation'], ['dialectics', 'synthesis'], ['rhetoric', 'persuasion'], ['semiotics', 'meaning'],
      ['linguistics', 'language'], ['semantics', 'meaning'], ['syntax', 'structure'], ['pragmatics', 'usage'], ['phonetics', 'sound'],
      ['morphology', 'form'], ['etymology', 'origin'], ['lexicon', 'vocabulary'], ['grammar', 'rules'], ['orthography', 'spelling'],
      ['algebra', 'variables'], ['geometry', 'shapes'], ['calculus', 'change'], ['statistics', 'data'], ['probability', 'likelihood'],
      ['topology', 'space'], ['set-theory', 'collection'], ['number-theory', 'integers'], ['logic', 'truth'], ['combinatorics', 'counting'],
      ['mechanics', 'motion'], ['dynamics', 'force'], ['kinematics', 'velocity'], ['thermodynamics', 'energy'], ['electromagnetism', 'field'],
      ['optics', 'light'], ['acoustics', 'sound'], ['quantum', 'particle'], ['relativity', 'spacetime'], ['cosmology', 'universe'],
      ['astronomy', 'celestial'], ['astrophysics', 'stars'], ['astrobiology', 'extraterrestrial'], ['geology', 'earth'], ['meteorology', 'weather'],
      ['oceanography', 'seas'], ['ecology', 'ecosystems'], ['biology', 'life'], ['genetics', 'heredity'], ['evolution', 'adaptation'],
      ['anatomy', 'structure'], ['physiology', 'function'], ['biochemistry', 'molecules'], ['neuroscience', 'brain'], ['psychology', 'mind'],
      ['sociology', 'society'], ['anthropology', 'culture'], ['archaeology', 'artifacts'], ['history', 'past'], ['economics', 'resources'],
      ['politics', 'power'], ['jurisprudence', 'law'], ['criminology', 'crime'], ['pedagogy', 'teaching'], ['andragogy', 'adult-learning'],
      ['epistemology', 'knowledge'], ['ontology', 'being'], ['cosmology', 'cosmos'], ['theology', 'divinity'], ['mythology', 'legends'],
      ['allegory', 'symbolism'], ['metaphor', 'comparison'], ['simile', 'likeness'], ['analogy', 'correspondence'], ['paradox', 'contradiction'],
      ['irony', 'opposite'], ['satire', 'mockery'], ['parody', 'imitation'], ['caricature', 'exaggeration'], ['hyperbole', 'overstatement'],
      ['understatement', 'minimization'], ['euphemism', 'politeness'], ['dysphemism', 'harshness'], ['colloquialism', 'informality'], ['jargon', 'terminology'],
      ['idiom', 'expression'], ['proverb', 'wisdom'], ['aphorism', 'maxim'], ['adage', 'saying'], ['motto', 'principle'],
      ['slogan', 'catchphrase'], ['epithet', 'descriptor'], ['epitaph', 'inscription'], ['epigram', 'witticism'], ['pun', 'wordplay'],
      ['alliteration', 'repetition'], ['assonance', 'vowel-sound'], ['consonance', 'consonant-sound'], ['rhyme', 'ending-sound'], ['rhythm', 'pattern'],
      ['meter', 'measure'], ['verse', 'stanza'], ['couplet', 'pair'], ['quatrain', 'four-lines'], ['sonnet', 'fourteen-lines'],
      ['haiku', 'syllables'], ['limerick', 'five-lines'], ['ballad', 'narrative'], ['ode', 'tribute'], ['elegy', 'lament'],
      ['epic', 'heroic-tale'], ['lyric', 'emotion'], ['pastoral', 'rural'], ['satire', 'criticism'], ['tragedy', 'downfall'],
      ['comedy', 'humor'], ['farce', 'absurdity'], ['melodrama', 'exaggeration'], ['romance', 'love-story'], ['mystery', 'puzzle']
    ],
    'intensifier': [
      // Word to stronger/more intense version
      ['hot', 'scorching'], ['cold', 'frigid'], ['warm', 'sweltering'], ['cool', 'icy'], ['wet', 'drenched'],
      ['dry', 'parched'], ['hungry', 'starving'], ['thirsty', 'parched'], ['tired', 'exhausted'], ['sleepy', 'drowsy'],
      ['angry', 'furious'], ['happy', 'ecstatic'], ['sad', 'devastated'], ['scared', 'terrified'], ['surprised', 'astonished'],
      ['worried', 'anxious'], ['nervous', 'panicked'], ['excited', 'thrilled'], ['bored', 'apathetic'], ['interested', 'fascinated'],
      ['good', 'excellent'], ['bad', 'terrible'], ['nice', 'wonderful'], ['mean', 'cruel'], ['kind', 'compassionate'],
      ['smart', 'brilliant'], ['dumb', 'idiotic'], ['strong', 'mighty'], ['weak', 'feeble'], ['brave', 'heroic'],
      ['cowardly', 'craven'], ['proud', 'arrogant'], ['humble', 'meek'], ['loud', 'deafening'], ['quiet', 'silent'],
      ['fast', 'lightning-fast'], ['slow', 'sluggish'], ['big', 'gigantic'], ['small', 'minuscule'], ['tall', 'towering'],
      ['short', 'tiny'], ['wide', 'vast'], ['narrow', 'cramped'], ['thick', 'dense'], ['thin', 'skeletal'],
      ['heavy', 'ponderous'], ['light', 'weightless'], ['bright', 'brilliant'], ['dark', 'pitch-black'], ['clean', 'pristine'],
      ['dirty', 'filthy'], ['new', 'brand-new'], ['old', 'ancient'], ['young', 'youthful'], ['beautiful', 'gorgeous'],
      ['ugly', 'hideous'], ['rich', 'wealthy'], ['poor', 'destitute'], ['expensive', 'exorbitant'], ['cheap', 'dirt-cheap'],
      ['difficult', 'impossible'], ['easy', 'effortless'], ['hard', 'grueling'], ['soft', 'plush'], ['rough', 'coarse'],
      ['smooth', 'silky'], ['sharp', 'razor-sharp'], ['dull', 'blunt'], ['clear', 'crystal-clear'], ['cloudy', 'murky'],
      ['busy', 'swamped'], ['lazy', 'slothful'], ['active', 'energetic'], ['still', 'motionless'], ['noisy', 'cacophonous'],
      ['peaceful', 'serene'], ['violent', 'savage'], ['gentle', 'tender'], ['harsh', 'brutal'], ['mild', 'moderate'],
      ['extreme', 'radical'], ['normal', 'ordinary'], ['strange', 'bizarre'], ['common', 'ubiquitous'], ['rare', 'unique'],
      ['frequent', 'constant'], ['occasional', 'sporadic'], ['permanent', 'eternal'], ['temporary', 'fleeting'], ['stable', 'immutable'],
      ['unstable', 'volatile'], ['solid', 'impenetrable'], ['fragile', 'delicate'], ['flexible', 'elastic'], ['rigid', 'inflexible'],
      ['full', 'overflowing'], ['empty', 'barren'], ['crowded', 'packed'], ['spacious', 'vast'], ['tight', 'constricting']
    ],
    'analogy': [
      // A:B :: C:D pattern (simplified to just C:D, assuming A:B is known)
      ['king', 'queen'], ['prince', 'princess'], ['duke', 'duchess'], ['lord', 'lady'], ['sir', 'madam'],
      ['man', 'woman'], ['boy', 'girl'], ['father', 'mother'], ['son', 'daughter'], ['brother', 'sister'],
      ['uncle', 'aunt'], ['nephew', 'niece'], ['husband', 'wife'], ['groom', 'bride'], ['bachelor', 'bachelorette'],
      ['actor', 'actress'], ['waiter', 'waitress'], ['steward', 'stewardess'], ['host', 'hostess'], ['hero', 'heroine'],
      ['lion', 'lioness'], ['tiger', 'tigress'], ['bull', 'cow'], ['stallion', 'mare'], ['rooster', 'hen'],
      ['ram', 'ewe'], ['buck', 'doe'], ['gander', 'goose'], ['drake', 'duck'], ['peacock', 'peahen'],
      ['dog', 'puppy'], ['cat', 'kitten'], ['cow', 'calf'], ['horse', 'foal'], ['pig', 'piglet'],
      ['sheep', 'lamb'], ['goat', 'kid'], ['deer', 'fawn'], ['bear', 'cub'], ['lion', 'cub'],
      ['bird', 'chick'], ['duck', 'duckling'], ['goose', 'gosling'], ['swan', 'cygnet'], ['frog', 'tadpole'],
      ['fish', 'fry'], ['butterfly', 'caterpillar'], ['chicken', 'egg'], ['plant', 'seed'], ['tree', 'sapling'],
      ['doctor', 'patient'], ['teacher', 'student'], ['lawyer', 'client'], ['chef', 'customer'], ['pilot', 'passenger'],
      ['author', 'reader'], ['artist', 'viewer'], ['musician', 'listener'], ['actor', 'audience'], ['preacher', 'congregation'],
      ['captain', 'crew'], ['general', 'soldier'], ['manager', 'employee'], ['boss', 'worker'], ['leader', 'follower'],
      ['shepherd', 'flock'], ['conductor', 'orchestra'], ['director', 'cast'], ['coach', 'team'], ['trainer', 'athlete'],
      ['hammer', 'nail'], ['saw', 'wood'], ['needle', 'thread'], ['pen', 'paper'], ['brush', 'paint'],
      ['key', 'lock'], ['plug', 'socket'], ['button', 'buttonhole'], ['zipper', 'fabric'], ['buckle', 'belt'],
      ['wheel', 'axle'], ['pedal', 'bicycle'], ['sail', 'boat'], ['oar', 'rowboat'], ['propeller', 'airplane'],
      ['rudder', 'ship'], ['steering-wheel', 'car'], ['handle', 'door'], ['knob', 'cabinet'], ['lever', 'machine'],
      ['cup', 'coffee'], ['glass', 'water'], ['bowl', 'soup'], ['plate', 'food'], ['spoon', 'cereal'],
      ['fork', 'pasta'], ['knife', 'meat'], ['chopsticks', 'rice'], ['straw', 'milkshake'], ['bottle', 'wine']
    ],
    'sequence': [
      // Temporal/logical ordering - what comes next
      ['infant', 'toddler'], ['toddler', 'child'], ['child', 'teenager'], ['teenager', 'adult'], ['adult', 'senior'],
      ['egg', 'larva'], ['larva', 'pupa'], ['pupa', 'adult'], ['seed', 'sprout'], ['sprout', 'seedling'],
      ['seedling', 'plant'], ['bud', 'flower'], ['flower', 'fruit'], ['dawn', 'morning'], ['morning', 'noon'],
      ['noon', 'afternoon'], ['afternoon', 'evening'], ['evening', 'night'], ['night', 'dawn'], ['spring', 'summer'],
      ['summer', 'autumn'], ['autumn', 'winter'], ['winter', 'spring'], ['new-moon', 'crescent'], ['crescent', 'quarter'],
      ['quarter', 'gibbous'], ['gibbous', 'full-moon'], ['sunday', 'monday'], ['monday', 'tuesday'], ['tuesday', 'wednesday'],
      ['wednesday', 'thursday'], ['thursday', 'friday'], ['friday', 'saturday'], ['saturday', 'sunday'], ['january', 'february'],
      ['february', 'march'], ['march', 'april'], ['april', 'may'], ['may', 'june'], ['june', 'july'],
      ['july', 'august'], ['august', 'september'], ['september', 'october'], ['october', 'november'], ['november', 'december'],
      ['first', 'second'], ['second', 'third'], ['third', 'fourth'], ['fourth', 'fifth'], ['fifth', 'sixth'],
      ['bronze', 'silver'], ['silver', 'gold'], ['good', 'better'], ['better', 'best'], ['bad', 'worse'],
      ['crawl', 'walk'], ['walk', 'run'], ['whisper', 'talk'], ['talk', 'shout'], ['trickle', 'flow'],
      ['flow', 'gush'], ['spark', 'flame'], ['flame', 'blaze'], ['drizzle', 'rain'], ['rain', 'downpour'],
      ['breeze', 'wind'], ['wind', 'gale'], ['tremor', 'earthquake'], ['wave', 'tsunami'], ['crack', 'crevice'],
      ['crevice', 'chasm'], ['pebble', 'stone'], ['stone', 'boulder'], ['stream', 'river'], ['river', 'ocean'],
      ['droplet', 'puddle'], ['puddle', 'pond'], ['pond', 'lake'], ['hill', 'mountain'], ['village', 'town'],
      ['town', 'city'], ['city', 'metropolis'], ['house', 'mansion'], ['cabin', 'house'], ['hut', 'cabin'],
      ['introduction', 'body'], ['body', 'conclusion'], ['beginning', 'middle'], ['middle', 'end'], ['alpha', 'beta'],
      ['beta', 'gamma'], ['past', 'present'], ['present', 'future'], ['yesterday', 'today'], ['today', 'tomorrow'],
      ['prehistory', 'ancient'], ['ancient', 'medieval'], ['medieval', 'modern'], ['modern', 'contemporary'], ['birth', 'life']
    ],
    'figurative': [
      // Literal meaning to figurative/idiomatic meaning
      ['break-ice', 'start-conversation'], ['spill-beans', 'reveal-secret'], ['piece-cake', 'very-easy'], ['cost-arm-leg', 'very-expensive'],
      ['hit-sack', 'go-sleep'], ['under-weather', 'feel-sick'], ['break-leg', 'good-luck'], ['bite-bullet', 'face-difficulty'],
      ['beat-bush', 'avoid-point'], ['let-cat-out', 'reveal-secret'], ['cry-milk', 'regret-past'], ['add-fuel', 'worsen-situation'],
      ['back-wall', 'desperate-situation'], ['ball-court', 'your-decision'], ['bark-tree', 'wrong-approach'], ['best-worlds', 'ideal-combination'],
      ['bite-dust', 'fail-badly'], ['blessing-disguise', 'hidden-benefit'], ['blow-steam', 'release-anger'], ['break-bank', 'very-costly'],
      ['burn-bridges', 'destroy-relationships'], ['burn-candle', 'overwork'], ['bury-hatchet', 'make-peace'], ['call-shots', 'make-decisions'],
      ['catch-drift', 'understand-meaning'], ['cut-chase', 'get-point'], ['devil-advocate', 'opposing-argument'], ['drop-hat', 'immediately'],
      ['face-music', 'accept-consequences'], ['fish-water', 'uncomfortable'], ['get-ball-rolling', 'start-project'], ['give-benefit-doubt', 'trust-despite-uncertainty'],
      ['go-extra-mile', 'exceed-expectations'], ['hang-there', 'persevere'], ['hit-nail-head', 'exactly-right'], ['jump-gun', 'act-prematurely'],
      ['keep-chin-up', 'stay-positive'], ['kill-birds', 'achieve-multiple'], ['let-sleeping-dogs', 'avoid-trouble'], ['make-long-short', 'summarize'],
      ['miss-boat', 'lose-opportunity'], ['no-brainer', 'obvious-choice'], ['on-cloud-nine', 'extremely-happy'], ['once-blue-moon', 'very-rarely'],
      ['piece-mind', 'honest-opinion'], ['pull-leg', 'joke-tease'], ['pull-yourself-together', 'regain-composure'], ['rain-cats-dogs', 'heavy-rain'],
      ['read-between-lines', 'understand-hidden'], ['rock-hard-place', 'difficult-choice'], ['see-eye-eye', 'agree-completely'], ['steal-thunder', 'take-credit'],
      ['take-grain-salt', 'skeptical'], ['the-last-straw', 'final-provocation'], ['throw-towel', 'give-up'], ['twist-arm', 'persuade-forcefully'],
      ['up-air', 'undecided'], ['weather-storm', 'survive-difficulty'], ['whole-nine-yards', 'everything-possible'], ['your-guess-good', 'equally-uncertain'],
      ['bite-tongue', 'remain-silent'], ['burn-midnight-oil', 'work-late'], ['cross-bridge', 'deal-later'], ['cut-corners', 'do-inadequately'],
      ['draw-line', 'set-limit'], ['get-cold-feet', 'become-nervous'], ['give-cold-shoulder', 'ignore-deliberately'], ['go-grain', 'contradict-normal'],
      ['have-heart-mouth', 'very-anxious'], ['hold-horses', 'wait-patiently'], ['in-hot-water', 'in-trouble'], ['jump-bandwagon', 'follow-trend'],
      ['keep-cards-close', 'be-secretive'], ['leave-no-stone', 'try-everything'], ['make-ends-meet', 'survive-financially'], ['on-same-page', 'mutual-understanding'],
      ['open-worms', 'create-problems'], ['over-moon', 'extremely-happy'], ['play-safe', 'avoid-risk'], ['put-foot-down', 'be-firm'],
      ['raining-pours', 'multiple-problems'], ['ring-bell', 'sound-familiar'], ['rock-boat', 'cause-trouble'], ['run-mill', 'ordinary'],
      ['saved-bell', 'rescued-last-minute'], ['sell-ice-eskimo', 'persuasive'], ['sit-fence', 'remain-neutral'], ['speak-devil', 'person-appears'],
      ['steal-show', 'get-attention'], ['straight-horse-mouth', 'reliable-source'], ['take-rain-check', 'postpone'], ['the-ball-your-court', 'your-turn'],
      ['throw-book', 'punish-severely'], ['turn-blind-eye', 'ignore-deliberately'], ['walk-eggshells', 'be-careful'], ['wild-goose-chase', 'futile-pursuit']
    ],
    'homophone': [
      // Same sound, different meaning and spelling
      ['to', 'too'], ['to', 'two'], ['too', 'two'], ['their', 'there'], ['their', 'they\'re'], ['there', 'they\'re'],
      ['your', 'you\'re'], ['its', 'it\'s'], ['whose', 'who\'s'], ['were', 'we\'re'], ['hear', 'here'],
      ['see', 'sea'], ['be', 'bee'], ['buy', 'by'], ['buy', 'bye'], ['by', 'bye'],
      ['no', 'know'], ['new', 'knew'], ['one', 'won'], ['son', 'sun'], ['for', 'four'],
      ['eight', 'ate'], ['pair', 'pear'], ['bare', 'bear'], ['brake', 'break'], ['flower', 'flour'],
      ['hour', 'our'], ['meat', 'meet'], ['peace', 'piece'], ['plain', 'plane'], ['rain', 'reign'],
      ['right', 'write'], ['road', 'rode'], ['sail', 'sale'], ['tail', 'tale'], ['wait', 'weight'],
      ['weak', 'week'], ['wear', 'where'], ['wood', 'would'], ['ad', 'add'], ['ale', 'ail'],
      ['allowed', 'aloud'], ['altar', 'alter'], ['ball', 'bawl'], ['band', 'banned'], ['billed', 'build'],
      ['blew', 'blue'], ['boar', 'bore'], ['board', 'bored'], ['bold', 'bowled'], ['cell', 'sell'],
      ['cent', 'scent'], ['cent', 'sent'], ['scent', 'sent'], ['cereal', 'serial'], ['chews', 'choose'],
      ['chord', 'cord'], ['coarse', 'course'], ['crews', 'cruise'], ['dear', 'deer'], ['dew', 'do'],
      ['dew', 'due'], ['do', 'due'], ['die', 'dye'], ['fair', 'fare'], ['feat', 'feet'],
      ['fir', 'fur'], ['flea', 'flee'], ['flew', 'flu'], ['flew', 'flue'], ['flu', 'flue'],
      ['foul', 'fowl'], ['gait', 'gate'], ['genes', 'jeans'], ['grate', 'great'], ['groan', 'grown'],
      ['guest', 'guessed'], ['hail', 'hale'], ['hair', 'hare'], ['hall', 'haul'], ['heal', 'heel'],
      ['heard', 'herd'], ['hi', 'high'], ['him', 'hymn'], ['hoarse', 'horse'], ['hole', 'whole'],
      ['idle', 'idol'], ['in', 'inn'], ['knight', 'night'], ['knot', 'not'], ['lain', 'lane'],
      ['leased', 'least'], ['loan', 'lone'], ['made', 'maid'], ['mail', 'male'], ['main', 'mane'],
      ['maze', 'maize'], ['miner', 'minor'], ['mist', 'missed'], ['moose', 'mousse'], ['none', 'nun'],
      ['oar', 'or'], ['ore', 'oar'], ['pail', 'pale'], ['pain', 'pane'], ['passed', 'past'],
      ['pause', 'paws'], ['peek', 'peak'], ['peel', 'peal'], ['pier', 'peer'], ['pole', 'poll'],
      ['poor', 'pour'], ['pray', 'prey'], ['principal', 'principle'], ['profit', 'prophet'], ['raise', 'rays'],
      ['rap', 'wrap'], ['read', 'red'], ['real', 'reel'], ['role', 'roll'], ['root', 'route'],
      ['rose', 'rows'], ['scene', 'seen'], ['seam', 'seem'], ['sew', 'so'], ['shone', 'shown'],
      ['soar', 'sore'], ['sole', 'soul'], ['some', 'sum'], ['stair', 'stare'], ['stake', 'steak'],
      ['stationary', 'stationery'], ['steal', 'steel'], ['suite', 'sweet'], ['than', 'then'], ['threw', 'through'],
      ['throne', 'thrown'], ['tide', 'tied'], ['toe', 'tow'], ['vain', 'vein'], ['vary', 'very'],
      ['wade', 'weighed'], ['waist', 'waste'], ['way', 'weigh'], ['weather', 'whether'], ['which', 'witch']
    ]
  };

  // Generate lookalike non-matching pairs for each relationship type
  const generateLookalike = (relationType) => {
    if (relationType === 'whole-part') {
      // For whole-part, use unrelated category-item pairs
      const categories = ['animal', 'tree', 'fish', 'bird', 'flower', 'vehicle', 'fruit', 'furniture', 'building', 'color',
                         'emotion', 'body', 'continent', 'ocean', 'mountain', 'country', 'city', 'instrument', 'sport', 'book',
                         'food', 'drink', 'clothing', 'planet', 'star', 'metal', 'gem', 'season', 'month', 'day',
                         'tool', 'weapon', 'plant', 'insect', 'mammal', 'reptile', 'vegetable', 'grain', 'disease', 'medicine'];
      const items = ['hammer', 'ocean', 'shirt', 'winter', 'jazz', 'sword', 'oil', 'painting', 'Buddhism', 'valley',
                    'thunder', 'democracy', 'telescope', 'algebra', 'gravity', 'symphony', 'alphabet', 'volcano', 'eclipse', 'prism',
                    'tornado', 'glacier', 'compass', 'molecule', 'electron', 'photon', 'neutron', 'galaxy', 'orbit', 'velocity',
                    'friction', 'pressure', 'density', 'quantum', 'spectrum', 'radiation', 'catalyst', 'polymer', 'crystal', 'plasma'];
      return [categories[Math.floor(Math.random() * categories.length)],
              items[Math.floor(Math.random() * items.length)]];
    } else if (relationType === 'antonym') {
      // For antonyms, use words that are related but not opposites (synonyms or similar meanings)
      const nonAntonyms = [
        ['hot', 'warm'], ['big', 'huge'], ['fast', 'quick'], ['light', 'bright'], ['happy', 'joyful'],
        ['cold', 'cool'], ['small', 'tiny'], ['slow', 'gradual'], ['dark', 'dim'], ['sad', 'unhappy'],
        ['strong', 'powerful'], ['loud', 'noisy'], ['soft', 'gentle'], ['clean', 'pure'], ['wet', 'damp'],
        ['angry', 'furious'], ['scared', 'afraid'], ['brave', 'courageous'], ['smart', 'intelligent'], ['foolish', 'silly'],
        ['rich', 'wealthy'], ['poor', 'needy'], ['beautiful', 'gorgeous'], ['ugly', 'hideous'], ['thin', 'slim'],
        ['fat', 'obese'], ['tall', 'towering'], ['short', 'petite'], ['wide', 'broad'], ['narrow', 'slim'],
        ['deep', 'profound'], ['shallow', 'superficial'], ['rough', 'coarse'], ['smooth', 'silky'], ['hard', 'solid'],
        ['easy', 'simple'], ['difficult', 'challenging'], ['complex', 'complicated'], ['clear', 'transparent'], ['cloudy', 'overcast'],
        ['bright', 'luminous'], ['dull', 'boring'], ['sharp', 'keen'], ['old', 'ancient'], ['new', 'fresh'],
        ['modern', 'contemporary'], ['early', 'premature'], ['late', 'tardy'], ['quick', 'rapid'], ['lazy', 'idle'],
        ['busy', 'occupied'], ['empty', 'vacant'], ['full', 'complete'], ['partial', 'incomplete'], ['whole', 'entire'],
        ['broken', 'damaged'], ['fixed', 'repaired'], ['real', 'authentic'], ['fake', 'counterfeit'], ['true', 'accurate'],
        ['false', 'incorrect'], ['right', 'correct'], ['wrong', 'mistaken'], ['good', 'excellent'], ['bad', 'terrible'],
        ['great', 'magnificent'], ['terrible', 'awful'], ['wonderful', 'fantastic'], ['horrible', 'dreadful'], ['nice', 'pleasant'],
        ['mean', 'cruel'], ['kind', 'caring'], ['selfish', 'greedy'], ['generous', 'charitable'], ['honest', 'truthful'],
        ['dishonest', 'deceitful'], ['loyal', 'faithful'], ['disloyal', 'treacherous'], ['friend', 'companion'], ['enemy', 'foe'],
        ['love', 'adore'], ['hate', 'despise'], ['like', 'enjoy'], ['dislike', 'detest'], ['want', 'desire'],
        ['need', 'require'], ['give', 'donate'], ['take', 'grab'], ['buy', 'purchase'], ['sell', 'vend'],
        ['win', 'triumph'], ['lose', 'forfeit'], ['succeed', 'achieve'], ['fail', 'flounder'], ['start', 'begin'],
        ['end', 'finish'], ['continue', 'persist'], ['stop', 'halt'], ['go', 'proceed'], ['come', 'arrive'],
        ['leave', 'depart'], ['stay', 'remain'], ['move', 'shift'], ['rest', 'relax'], ['work', 'labor'],
        ['play', 'frolic'], ['sleep', 'slumber'], ['wake', 'awaken'], ['eat', 'consume'], ['drink', 'sip'],
        ['walk', 'stroll'], ['run', 'sprint'], ['jump', 'leap'], ['fall', 'tumble'], ['rise', 'ascend'],
        ['sit', 'perch'], ['stand', 'upright'], ['lie', 'recline'], ['laugh', 'chuckle'], ['cry', 'weep'],
        ['smile', 'grin'], ['frown', 'scowl'], ['speak', 'talk'], ['listen', 'hear'], ['see', 'observe'],
        ['look', 'gaze'], ['touch', 'feel'], ['smell', 'sniff'], ['taste', 'savor'], ['think', 'ponder'],
        // Additional 200+ deceiving antonym pairs (related words that are NOT opposites)
        ['abandon', 'desert'], ['abbreviate', 'shorten'], ['abdicate', 'resign'], ['aberrant', 'deviant'], ['abhor', 'detest'],
        ['abide', 'tolerate'], ['ability', 'skill'], ['abnormal', 'unusual'], ['abolish', 'eliminate'], ['abominable', 'terrible'],
        ['aboriginal', 'native'], ['abridge', 'condense'], ['abrupt', 'sudden'], ['absent', 'missing'], ['absolute', 'complete'],
        ['absorb', 'soak'], ['abstain', 'refrain'], ['abstract', 'theoretical'], ['absurd', 'ridiculous'], ['abundant', 'plentiful'],
        ['abuse', 'mistreat'], ['accelerate', 'speed'], ['accept', 'receive'], ['acclaim', 'praise'], ['accommodate', 'adjust'],
        ['accompany', 'escort'], ['accomplish', 'achieve'], ['accord', 'agreement'], ['accumulate', 'gather'], ['accurate', 'precise'],
        ['accuse', 'blame'], ['acknowledge', 'admit'], ['acquire', 'obtain'], ['active', 'energetic'], ['acute', 'severe'],
        ['adapt', 'adjust'], ['addicted', 'dependent'], ['additional', 'extra'], ['adequate', 'sufficient'], ['adhere', 'stick'],
        ['adjacent', 'neighboring'], ['adjourn', 'postpone'], ['admire', 'respect'], ['admit', 'confess'], ['admonish', 'warn'],
        ['adopt', 'choose'], ['adore', 'worship'], ['adorn', 'decorate'], ['advance', 'progress'], ['advantage', 'benefit'],
        ['adversary', 'opponent'], ['adverse', 'unfavorable'], ['advertise', 'promote'], ['advice', 'counsel'], ['advocate', 'support'],
        ['aesthetic', 'artistic'], ['affable', 'friendly'], ['affect', 'influence'], ['affection', 'fondness'], ['affirm', 'confirm'],
        ['affluent', 'rich'], ['afford', 'provide'], ['affront', 'insult'], ['agile', 'nimble'], ['agitate', 'disturb'],
        ['agree', 'concur'], ['agreeable', 'pleasant'], ['aid', 'help'], ['ailment', 'illness'], ['aim', 'goal'],
        ['alarm', 'frighten'], ['alert', 'aware'], ['alien', 'foreign'], ['alleviate', 'relieve'], ['allocate', 'distribute'],
        ['allow', 'permit'], ['allude', 'refer'], ['ally', 'partner'], ['alter', 'change'], ['alternate', 'substitute'],
        ['altitude', 'height'], ['altruistic', 'selfless'], ['amass', 'collect'], ['amateur', 'novice'], ['amaze', 'astonish'],
        ['ambiguous', 'vague'], ['ambitious', 'driven'], ['amble', 'stroll'], ['ameliorate', 'improve'], ['amend', 'correct'],
        ['amiable', 'friendly'], ['ample', 'plentiful'], ['amplify', 'enlarge'], ['amuse', 'entertain'], ['analyze', 'examine'],
        ['ancient', 'archaic'], ['anecdote', 'story'], ['animosity', 'hostility'], ['annex', 'attach'], ['annihilate', 'destroy'],
        ['announce', 'declare'], ['annoy', 'irritate'], ['annual', 'yearly'], ['anomaly', 'irregularity'], ['anonymous', 'nameless'],
        ['antagonize', 'provoke'], ['anticipate', 'expect'], ['antiquated', 'outdated'], ['anxious', 'worried'], ['apathetic', 'indifferent'],
        ['apex', 'peak'], ['apologize', 'regret'], ['appall', 'horrify'], ['apparent', 'obvious'], ['appeal', 'request'],
        ['appear', 'emerge'], ['appease', 'pacify'], ['appetite', 'hunger'], ['applaud', 'praise'], ['applicable', 'relevant'],
        ['appreciate', 'value'], ['apprehend', 'arrest'], ['apprehensive', 'fearful'], ['apprentice', 'trainee'], ['approach', 'near'],
        ['appropriate', 'suitable'], ['approve', 'authorize'], ['approximate', 'estimate'], ['arbitrary', 'random'], ['archaic', 'ancient'],
        ['ardent', 'passionate'], ['arduous', 'difficult'], ['arid', 'dry'], ['arise', 'emerge'], ['arrogant', 'haughty'],
        ['articulate', 'express'], ['artificial', 'synthetic'], ['ascend', 'climb'], ['ascertain', 'determine'], ['ashamed', 'embarrassed'],
        ['aspire', 'strive'], ['assail', 'attack'], ['assassinate', 'murder'], ['assault', 'attack'], ['assemble', 'gather'],
        ['assert', 'declare'], ['assess', 'evaluate'], ['assign', 'allocate'], ['assist', 'help'], ['associate', 'connect'],
        ['assume', 'presume'], ['assure', 'guarantee'], ['astonish', 'surprise'], ['astound', 'amaze'], ['astute', 'clever'],
        ['atrocious', 'horrible'], ['attach', 'connect'], ['attain', 'achieve'], ['attempt', 'try'], ['attend', 'participate'],
        ['attentive', 'alert'], ['attest', 'certify'], ['attitude', 'disposition'], ['attract', 'draw'], ['attribute', 'characteristic'],
        ['atypical', 'unusual'], ['audacious', 'bold'], ['augment', 'increase'], ['auspicious', 'favorable'], ['austere', 'severe'],
        ['authentic', 'genuine'], ['authorize', 'approve'], ['automatic', 'mechanical'], ['autonomous', 'independent'], ['available', 'accessible'],
        ['averse', 'opposed'], ['avert', 'prevent'], ['avid', 'eager'], ['avoid', 'evade'], ['await', 'expect'],
        ['awaken', 'rouse'], ['aware', 'conscious'], ['awe', 'wonder'], ['awkward', 'clumsy'], ['ban', 'prohibit'],
        ['banish', 'exile'], ['barren', 'sterile'], ['barrier', 'obstacle'], ['basic', 'fundamental'], ['battery', 'assault'],
        ['battle', 'fight'], ['beaming', 'radiant'], ['bear', 'endure'], ['beast', 'animal'], ['beat', 'defeat'],
        ['beautiful', 'pretty'], ['beckon', 'summon'], ['befit', 'suit'], ['befriend', 'assist'], ['beg', 'plead'],
        ['begin', 'commence'], ['beguile', 'deceive'], ['behave', 'act'], ['belated', 'late'], ['belief', 'faith'],
        ['believable', 'credible'], ['belittle', 'disparage'], ['bellicose', 'warlike'], ['beloved', 'dear'], ['bemoan', 'lament'],
        ['bend', 'curve'], ['beneficial', 'advantageous'], ['benevolent', 'kind'], ['benign', 'harmless'], ['berate', 'scold']
      ];
      return nonAntonyms[Math.floor(Math.random() * nonAntonyms.length)];
    } else if (relationType === 'synonym') {
      // For synonyms, use words that look similar but have different meanings (antonyms or unrelated words)
      const nonSynonyms = [
        ['hot', 'cold'], ['big', 'small'], ['fast', 'slow'], ['light', 'dark'], ['happy', 'sad'],
        ['strong', 'weak'], ['loud', 'quiet'], ['soft', 'hard'], ['clean', 'dirty'], ['wet', 'dry'],
        ['angry', 'calm'], ['brave', 'cowardly'], ['smart', 'foolish'], ['rich', 'poor'], ['beautiful', 'ugly'],
        ['tall', 'short'], ['wide', 'narrow'], ['deep', 'shallow'], ['rough', 'smooth'], ['difficult', 'easy'],
        ['bright', 'dull'], ['old', 'new'], ['early', 'late'], ['quick', 'slow'], ['busy', 'idle'],
        ['empty', 'full'], ['broken', 'fixed'], ['true', 'false'], ['right', 'wrong'], ['good', 'bad'],
        ['love', 'hate'], ['win', 'lose'], ['start', 'end'], ['go', 'stay'], ['give', 'take'],
        ['increase', 'decrease'], ['expand', 'contract'], ['rise', 'fall'], ['ascend', 'descend'], ['advance', 'retreat'],
        ['accept', 'reject'], ['agree', 'disagree'], ['allow', 'forbid'], ['attract', 'repel'], ['build', 'destroy'],
        ['combine', 'separate'], ['create', 'destroy'], ['defend', 'attack'], ['encourage', 'discourage'], ['entrance', 'exit'],
        ['export', 'import'], ['extend', 'shorten'], ['freeze', 'melt'], ['gather', 'scatter'], ['generous', 'selfish'],
        ['genuine', 'fake'], ['grant', 'deny'], ['growth', 'decline'], ['guilty', 'innocent'], ['harmony', 'discord'],
        ['healthy', 'sick'], ['hero', 'villain'], ['honest', 'dishonest'], ['horizontal', 'vertical'], ['humble', 'proud'],
        ['include', 'exclude'], ['increase', 'reduce'], ['inferior', 'superior'], ['inner', 'outer'], ['input', 'output'],
        ['insert', 'remove'], ['inside', 'outside'], ['internal', 'external'], ['join', 'separate'], ['junior', 'senior'],
        ['knowledge', 'ignorance'], ['leader', 'follower'], ['legal', 'illegal'], ['lengthen', 'shorten'], ['liberal', 'conservative'],
        ['liberty', 'captivity'], ['liquid', 'solid'], ['living', 'dead'], ['loose', 'tight'], ['major', 'minor'],
        ['maximum', 'minimum'], ['mercy', 'cruelty'], ['modern', 'ancient'], ['moist', 'arid'], ['natural', 'artificial'],
        ['negative', 'positive'], ['nephew', 'niece'], ['noble', 'ignoble'], ['normal', 'abnormal'], ['obedient', 'disobedient'],
        ['obese', 'skinny'], ['obscure', 'obvious'], ['occupy', 'vacate'], ['offense', 'defense'], ['open', 'closed'],
        ['optimist', 'pessimist'], ['order', 'chaos'], ['ordinary', 'extraordinary'], ['original', 'copy'], ['orthodox', 'unorthodox'],
        ['outdoor', 'indoor'], ['over', 'under'], ['partial', 'complete'], ['particular', 'general'], ['passive', 'active'],
        ['past', 'future'], ['patient', 'impatient'], ['peace', 'war'], ['permanent', 'temporary'], ['polite', 'rude'],
        ['poverty', 'wealth'], ['powerful', 'powerless'], ['praise', 'criticize'], ['precede', 'follow'], ['precious', 'worthless'],
        ['predator', 'prey'], ['present', 'absent'], ['preserve', 'destroy'], ['private', 'public'], ['probable', 'improbable'],
        ['professional', 'amateur'], ['profit', 'loss'], ['progress', 'regress'], ['prohibit', 'allow'], ['prominent', 'obscure'],
        ['protect', 'endanger'], ['proud', 'ashamed'], ['prudent', 'reckless'], ['public', 'private'], ['punctual', 'late']
      ];
      return nonSynonyms[Math.floor(Math.random() * nonSynonyms.length)];
    } else if (relationType === 'cause-effect') {
      // For cause-effect, use unrelated pairs that look plausible
      const nonCausalPairs = [
        ['thunder', 'rain'], ['sunshine', 'flowers'], ['moon', 'tides'], ['wind', 'trees'], ['fire', 'smoke'],
        ['ice', 'cold'], ['heat', 'sweat'], ['exercise', 'strength'], ['music', 'dance'], ['light', 'vision'],
        ['darkness', 'fear'], ['noise', 'distraction'], ['silence', 'peace'], ['water', 'life'], ['food', 'energy'],
        ['sleep', 'dreams'], ['coffee', 'alertness'], ['sugar', 'energy'], ['salt', 'thirst'], ['spice', 'flavor'],
        ['perfume', 'attraction'], ['paint', 'color'], ['ink', 'writing'], ['paper', 'books'], ['glass', 'transparency'],
        ['metal', 'strength'], ['plastic', 'flexibility'], ['rubber', 'elasticity'], ['wood', 'furniture'], ['stone', 'durability'],
        ['gold', 'wealth'], ['diamond', 'beauty'], ['silver', 'jewelry'], ['copper', 'wiring'], ['iron', 'tools'],
        ['steel', 'construction'], ['concrete', 'buildings'], ['clay', 'pottery'], ['sand', 'beaches'], ['soil', 'agriculture'],
        ['seeds', 'plants'], ['flowers', 'bees'], ['trees', 'oxygen'], ['grass', 'livestock'], ['vegetables', 'nutrition'],
        ['fruits', 'vitamins'], ['meat', 'protein'], ['bread', 'carbohydrates'], ['milk', 'calcium'], ['fish', 'omega-3'],
        ['honey', 'sweetness'], ['vinegar', 'sourness'], ['lemon', 'acidity'], ['pepper', 'spiciness'], ['garlic', 'flavor']
      ];
      return nonCausalPairs[Math.floor(Math.random() * nonCausalPairs.length)];
    } else if (relationType === 'tool-action') {
      // For tool-action, use incorrect tool-action pairs
      const incorrectToolAction = [
        ['hammer', 'write'], ['pen', 'dig'], ['shovel', 'paint'], ['brush', 'cut'], ['knife', 'sweep'],
        ['broom', 'drill'], ['drill', 'wash'], ['soap', 'measure'], ['ruler', 'cook'], ['pot', 'saw'],
        ['saw', 'iron'], ['iron', 'type'], ['keyboard', 'mow'], ['lawnmower', 'staple'], ['stapler', 'sew'],
        ['needle', 'hammer'], ['hammer', 'erase'], ['eraser', 'screw'], ['screwdriver', 'mop'], ['mop', 'photograph'],
        ['camera', 'vacuum'], ['vacuum', 'paint'], ['paintbrush', 'unlock'], ['key', 'weigh'], ['scale', 'light'],
        ['lamp', 'cool'], ['fan', 'heat'], ['heater', 'filter'], ['filter', 'mix'], ['mixer', 'grind'],
        ['grinder', 'toast'], ['toaster', 'freeze'], ['freezer', 'peel'], ['peeler', 'staple'], ['staple', 'pour']
      ];
      return incorrectToolAction[Math.floor(Math.random() * incorrectToolAction.length)];
    } else if (relationType === 'same-color') {
      // For same-color lookalike, use items from DIFFERENT color groups
      const colorGroups = wordPairs['same-color'];
      const colorKeys = Object.keys(colorGroups);

      // Pick two different color groups
      let colorKey1 = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      let colorKey2 = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      while (colorKey1 === colorKey2) {
        colorKey2 = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      }

      // Pick random item from each color group
      const items1 = colorGroups[colorKey1];
      const items2 = colorGroups[colorKey2];
      const item1 = items1[Math.floor(Math.random() * items1.length)];
      const item2 = items2[Math.floor(Math.random() * items2.length)];

      return [item1, item2];
    } else if (relationType === 'followup-numerical') {
      // For sequential, use numbers that are NOT sequential
      const num1 = Math.floor(Math.random() * 95);
      let num2 = Math.floor(Math.random() * 95);
      while (num2 === num1 + 1 || num2 === num1 - 1 || num2 === num1) {
        num2 = Math.floor(Math.random() * 95);
      }
      return [String(num1), String(num2)];
    } else if (relationType === 'physical-numerical') {
      // For physical numerical, use NON-consecutive numbers (looks similar but wrong)
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        if (n === 200) return 'two hundred';
        if (n === 300) return 'three hundred';
        if (n === 400) return 'four hundred';
        if (n === 500) return 'five hundred';
        if (n > 100) {
          const hundreds = Math.floor(n / 100);
          const remainder = n % 100;
          const hundredsWords = ['', 'one hundred', 'two hundred', 'three hundred', 'four hundred', 'five hundred'];
          if (remainder === 0) return hundredsWords[hundreds];
          return `${hundredsWords[hundreds]} ${numberToWord(remainder)}`;
        }
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n > 100) n = 100; // Cap at 100
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n > 100 ? String(n) : numberToRoman(n) // Use digits for >100
      ];

      const num = Math.floor(Math.random() * 98) + 1; // 1-98
      const offset = Math.floor(Math.random() * 2) + 1; // Skip by 1 or 2
      const nextNum = Math.min(num + offset, 100); // Cap at 100

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [format1(num), format2(nextNum)];
    } else if (relationType === 'meaning') {
      // For meaning, use DIFFERENT numbers in different forms
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        if (n === 200) return 'two hundred';
        if (n === 300) return 'three hundred';
        if (n === 400) return 'four hundred';
        if (n === 500) return 'five hundred';
        if (n > 100) {
          const hundreds = Math.floor(n / 100);
          const remainder = n % 100;
          const hundredsWords = ['', 'one hundred', 'two hundred', 'three hundred', 'four hundred', 'five hundred'];
          if (remainder === 0) return hundredsWords[hundreds];
          return `${hundredsWords[hundreds]} ${numberToWord(remainder)}`;
        }
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n > 100) n = 100; // Cap at 100
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n > 100 ? String(n) : numberToRoman(n) // Use digits for >100
      ];

      let num1 = Math.floor(Math.random() * 100) + 1; // 1-100
      let num2 = Math.floor(Math.random() * 100) + 1; // 1-100
      while (num1 === num2) {
        num2 = Math.floor(Math.random() * 100) + 1;
      }

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [format1(num1), format2(num2)];
    } else if (relationType === 'same-time') {
      // For same-time, use different times in different formats
      const clocks = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
      const clocksHalf = ['🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'];
      const digitalHours = ['1:00', '2:00', '3:00', '4:00', '5:00', '6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00'];
      const digitalHalf = ['1:30', '2:30', '3:30', '4:30', '5:30', '6:30', '7:30', '8:30', '9:30', '10:30', '11:30', '12:30'];
      const verbalHours = ['one o\'clock', 'two o\'clock', 'three o\'clock', 'four o\'clock', 'five o\'clock', 'six o\'clock',
                           'seven o\'clock', 'eight o\'clock', 'nine o\'clock', 'ten o\'clock', 'eleven o\'clock', 'twelve o\'clock'];
      const verbalHalf = ['half past one', 'half past two', 'half past three', 'half past four', 'half past five', 'half past six',
                          'half past seven', 'half past eight', 'half past nine', 'half past ten', 'half past eleven', 'half past twelve'];

      // Create array of all possible times (24 total: 12 on-the-hour + 12 half-past)
      const allTimes = [
        // Hour times (index 0-11)
        ...clocks.map((c, i) => ({ clock: c, digital: digitalHours[i], verbal: verbalHours[i] })),
        // Half-past times (index 12-23)
        ...clocksHalf.map((c, i) => ({ clock: c, digital: digitalHalf[i], verbal: verbalHalf[i] }))
      ];

      // Pick two DIFFERENT time indices (ensuring they represent different actual times)
      let idx1 = Math.floor(Math.random() * allTimes.length);
      let idx2 = Math.floor(Math.random() * allTimes.length);
      while (idx1 === idx2) {
        idx2 = Math.floor(Math.random() * allTimes.length);
      }

      // Pick random formats for each time
      const formats = ['clock', 'digital', 'verbal'];
      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [allTimes[idx1][format1], allTimes[idx2][format2]];
    } else if (relationType === 'even') {
      // For even, use one even and one odd number (mixed parity)
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0'; // Roman doesn't have zero
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n === 0 ? '0' : numberToRoman(n)
      ];

      // Pick one even and one odd number
      const evenNum = Math.floor(Math.random() * 50) * 2; // 0, 2, 4, ..., 98
      const oddNum = Math.floor(Math.random() * 50) * 2 + 1; // 1, 3, 5, ..., 99

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      // Randomly decide which comes first
      return Math.random() < 0.5 ? [format1(evenNum), format2(oddNum)] : [format1(oddNum), format2(evenNum)];
    } else if (relationType === 'odd') {
      // For odd, use one even and one odd number (mixed parity)
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n === 0 ? '0' : numberToRoman(n)
      ];

      // Pick one even and one odd number
      const evenNum = Math.floor(Math.random() * 50) * 2; // 0, 2, 4, ..., 98
      const oddNum = Math.floor(Math.random() * 50) * 2 + 1; // 1, 3, 5, ..., 99

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      // Randomly decide which comes first
      return Math.random() < 0.5 ? [format1(evenNum), format2(oddNum)] : [format1(oddNum), format2(evenNum)];
    } else if (relationType === 'doubled') {
      // For doubled, use numbers that are NOT in a doubling relationship
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n === 0 ? '0' : numberToRoman(n)
      ];

      let num1 = Math.floor(Math.random() * 50); // 0-49
      let num2 = Math.floor(Math.random() * 100); // 0-99
      // Ensure num2 is NOT double of num1 and num1 is NOT double of num2
      while (num2 === num1 * 2 || num1 === num2 * 2 || num1 === num2) {
        num2 = Math.floor(Math.random() * 100);
      }

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [format1(num1), format2(num2)];
    } else if (relationType === 'tripled') {
      // For tripled, use numbers that are NOT in a tripling relationship
      const numberToWord = (n) => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
              'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (n < 20) return words[n];
        if (n === 100) return 'one hundred';
        const ten = Math.floor(n / 10);
        const one = n % 10;
        return one === 0 ? tens[ten] : `${tens[ten]}-${words[one]}`;
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      const formats = [
        (n) => String(n),
        (n) => numberToWord(n),
        (n) => n === 0 ? '0' : numberToRoman(n)
      ];

      let num1 = Math.floor(Math.random() * 33); // 0-32
      let num2 = Math.floor(Math.random() * 100); // 0-99
      // Ensure num2 is NOT triple of num1 and num1 is NOT triple of num2
      while (num2 === num1 * 3 || num1 === num2 * 3 || num1 === num2) {
        num2 = Math.floor(Math.random() * 100);
      }

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [format1(num1), format2(num2)];
    } else if (relationType === 'parity-same-format') {
      // For parity-same-format, generate pairs with DIFFERENT parity (one odd, one even) in the SAME format
      const numberToChinese = (n) => {
        const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        return chinese[n] || String(n);
      };

      const numberToKorean = (n) => {
        const korean = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        return korean[n] || String(n);
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      // Pick one even (2,4,6,8) and one odd (1,3,5,7,9) number from 1-9
      const evenNums = [2, 4, 6, 8];
      const oddNums = [1, 3, 5, 7, 9];
      const evenNum = evenNums[Math.floor(Math.random() * evenNums.length)];
      const oddNum = oddNums[Math.floor(Math.random() * oddNums.length)];

      // Choose one format (Arabic, Chinese, Korean, or Roman) - only include enabled formats
      const formats = [
        (n) => String(n) // Arabic
      ];
      if (chineseNumeralsEnabled) {
        formats.push((n) => numberToChinese(n)); // Chinese
      }
      if (koreanNumeralsEnabled) {
        formats.push((n) => numberToKorean(n)); // Korean
      }
      formats.push((n) => numberToRoman(n)); // Roman

      const format = formats[Math.floor(Math.random() * formats.length)];

      // Randomly decide which comes first
      return Math.random() < 0.5 ? [format(evenNum), format(oddNum)] : [format(oddNum), format(evenNum)];
    } else if (relationType === 'parity-mixed-format') {
      // For parity-mixed-format, generate pairs with DIFFERENT parity (one odd, one even) in DIFFERENT formats
      const numberToChinese = (n) => {
        const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        return chinese[n] || String(n);
      };

      const numberToKorean = (n) => {
        const korean = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        return korean[n] || String(n);
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      // Pick one even (2,4,6,8) and one odd (1,3,5,7,9) number from 1-9
      const evenNums = [2, 4, 6, 8];
      const oddNums = [1, 3, 5, 7, 9];
      const evenNum = evenNums[Math.floor(Math.random() * evenNums.length)];
      const oddNum = oddNums[Math.floor(Math.random() * oddNums.length)];

      // Choose two DIFFERENT formats - only include enabled formats
      const formats = [
        (n) => String(n) // Arabic
      ];
      if (chineseNumeralsEnabled) {
        formats.push((n) => numberToChinese(n)); // Chinese
      }
      if (koreanNumeralsEnabled) {
        formats.push((n) => numberToKorean(n)); // Korean
      }
      formats.push((n) => numberToRoman(n)); // Roman

      let format1 = formats[Math.floor(Math.random() * formats.length)];
      let format2 = formats[Math.floor(Math.random() * formats.length)];
      // Ensure formats are different
      while (format1 === format2) {
        format2 = formats[Math.floor(Math.random() * formats.length)];
      }

      // Randomly decide which comes first
      return Math.random() < 0.5 ? [format1(evenNum), format2(oddNum)] : [format1(oddNum), format2(evenNum)];
    } else if (relationType === 'same-format') {
      // For same-format, generate pairs in DIFFERENT formats (not matching)
      const numberToChinese = (n) => {
        const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        return chinese[n] || String(n);
      };

      const numberToKorean = (n) => {
        const korean = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
        return korean[n] || String(n);
      };

      const numberToRoman = (n) => {
        if (n === 0) return '0';
        const vals = [9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
        let roman = '';
        for (let i = 0; i < vals.length; i++) {
          while (n >= vals[i]) {
            roman += syms[i];
            n -= vals[i];
          }
        }
        return roman;
      };

      // Pick two different numbers from 1-9
      let num1 = Math.floor(Math.random() * 9) + 1;
      let num2 = Math.floor(Math.random() * 9) + 1;
      while (num1 === num2) {
        num2 = Math.floor(Math.random() * 9) + 1;
      }

      // Choose two DIFFERENT formats - only include enabled formats
      const formats = [
        (n) => String(n) // Arabic
      ];
      if (chineseNumeralsEnabled) {
        formats.push((n) => numberToChinese(n)); // Chinese
      }
      if (koreanNumeralsEnabled) {
        formats.push((n) => numberToKorean(n)); // Korean
      }
      formats.push((n) => numberToRoman(n)); // Roman

      let format1 = formats[Math.floor(Math.random() * formats.length)];
      let format2 = formats[Math.floor(Math.random() * formats.length)];
      // Ensure formats are different
      while (format1 === format2) {
        format2 = formats[Math.floor(Math.random() * formats.length)];
      }

      return [format1(num1), format2(num2)];
    }

    return ['error', 'error'];
  };

  const getRandomPair = (relationType) => {
    // Special handling for same-color (color groups instead of pairs)
    if (relationType === 'same-color') {
      const colorGroups = wordPairs['same-color'];
      const colorKeys = Object.keys(colorGroups);

      // Try to find a color group with available pairs
      let attempts = 0;
      while (attempts < colorKeys.length * 2) {
        const colorKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
        const items = colorGroups[colorKey];

        // Pick two different items from this color group
        if (items.length < 2) continue; // Skip if not enough items

        let idx1 = Math.floor(Math.random() * items.length);
        let idx2 = Math.floor(Math.random() * items.length);
        while (idx1 === idx2) {
          idx2 = Math.floor(Math.random() * items.length);
        }

        const pair = [items[idx1], items[idx2]];
        const pairKey = `${relationType}:${pair[0]}:${pair[1]}`;
        const reversePairKey = `${relationType}:${pair[1]}:${pair[0]}`;

        // Check if this pair hasn't been used yet
        if (!usedPairs.has(pairKey) && !usedPairs.has(reversePairKey)) {
          setUsedPairs(prev => new Set([...prev, pairKey]));
          console.log(`✅ Selected color pair from ${colorKey}: ${pair[0]} - ${pair[1]}`);
          return pair;
        }

        attempts++;
      }

      // If we couldn't find an unused pair, reset and try again
      console.log(`⚠️ All color pairs used, resetting for ${relationType}`);
      const newUsedPairs = new Set(
        Array.from(usedPairs).filter(key => !key.startsWith(`${relationType}:`))
      );
      setUsedPairs(newUsedPairs);

      // Pick a new pair after reset
      const colorKey = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      const items = colorGroups[colorKey];
      let idx1 = Math.floor(Math.random() * items.length);
      let idx2 = Math.floor(Math.random() * items.length);
      while (idx1 === idx2 && items.length > 1) {
        idx2 = Math.floor(Math.random() * items.length);
      }
      const pair = [items[idx1], items[idx2]];
      const pairKey = `${relationType}:${pair[0]}:${pair[1]}`;
      setUsedPairs(prev => new Set([...prev, pairKey]));
      return pair;
    }

    // Original logic for other relation types
    let pairs = wordPairs[relationType];

    // Filter pairs based on Chinese and Korean numeral settings
    const chineseNumerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const koreanNumerals = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

    pairs = pairs.filter(pair => {
      const hasChineseNumeral = pair.some(word => chineseNumerals.includes(word));
      const hasKoreanNumeral = pair.some(word => koreanNumerals.includes(word));

      // If pair contains Chinese numeral and Chinese is disabled, exclude it
      if (hasChineseNumeral && !chineseNumeralsEnabled) {
        return false;
      }

      // If pair contains Korean numeral and Korean is disabled, exclude it
      if (hasKoreanNumeral && !koreanNumeralsEnabled) {
        return false;
      }

      return true;
    });

    // Filter out already used pairs
    const availablePairs = pairs.filter(pair => {
      const pairKey = `${relationType}:${pair[0]}:${pair[1]}`;
      return !usedPairs.has(pairKey);
    });

    // If all pairs have been used, reset for this relation type
    if (availablePairs.length === 0) {
      console.log(`⚠️ All pairs used for ${relationType}, resetting available pairs for this relation`);
      // Remove all used pairs for this relation type only
      const newUsedPairs = new Set(
        Array.from(usedPairs).filter(key => !key.startsWith(`${relationType}:`))
      );
      setUsedPairs(newUsedPairs);
      // Now all pairs are available again
      const selectedPair = pairs[Math.floor(Math.random() * pairs.length)];
      const pairKey = `${relationType}:${selectedPair[0]}:${selectedPair[1]}`;
      setUsedPairs(prev => new Set([...prev, pairKey]));
      console.log(`✅ Selected pair after reset: ${selectedPair[0]} - ${selectedPair[1]}`);
      return selectedPair;
    }

    // Select a random pair from available ones
    const selectedPair = availablePairs[Math.floor(Math.random() * availablePairs.length)];
    const pairKey = `${relationType}:${selectedPair[0]}:${selectedPair[1]}`;

    // Mark this pair as used
    setUsedPairs(prev => new Set([...prev, pairKey]));

    console.log(`✅ Selected unique pair: ${selectedPair[0]} - ${selectedPair[1]} (${availablePairs.length - 1} remaining for this type)`);
    return selectedPair;
  };

  // Helper function to generate match/no-match sequence
  const generateTaskMatchSequence = useCallback((totalTasks, matchPercent) => {
    const numMatches = Math.round((totalTasks * matchPercent) / 100);
    const numNonMatches = totalTasks - numMatches;

    const sequence = [
      ...Array(numMatches).fill(true),
      ...Array(numNonMatches).fill(false)
    ];

    // Shuffle the sequence using Fisher-Yates algorithm
    for (let i = sequence.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
    }

    console.log(`🎯 Task sequence created: ${numMatches} matches (${matchPercent}%), ${numNonMatches} non-matches`);
    console.log(`📋 Sequence: ${sequence.map(m => m ? 'M' : 'N').join('')}`);
    return sequence;
  }, []);

  const startGame = (selectedMode) => {
    console.log('🎮 Starting new game session');
    setMode(selectedMode);

    // Start training session timer
    setSessionStartTime(Date.now());
    console.log('⏱️ Training session started');

    let totalTasks = numTasks;
    let matchPercent = matchPercentage;

    if (selectedMode === 'adaptive') {
      setLevel(savedAdaptiveLevel);
      totalTasks = 32;
      setNumTasks(32);
      matchPercent = 50; // Standard adaptive mode always uses 50/50 split
    }

    // Create a sequence of matches and non-matches
    // This ensures exact distribution (e.g., exactly 16 matches and 16 non-matches for 50%)
    const sequence = generateTaskMatchSequence(totalTasks, matchPercent);
    setTaskMatchSequence(sequence);

    setScore(0);
    setWrongCount(0);
    setCurrentTask(0);
    setTaskHistory([]);
    setUsedPairs(new Set()); // Clear used pairs for new session
    setResponseTimes([]); // Clear response times for new session
    console.log('🔄 Used pairs cleared - all words/numbers available again');
    prepareNextTask();
  };

  const prepareNextTask = () => {
    // Get available relation types based on mode, level, and experimental setting
    let availableRelations = getRelationTypesForLevel(level, mode, experimentalMode);

    // In manual mode, further filter to only selected relationship types
    if (mode === 'manual') {
      availableRelations = availableRelations.filter(key => selectedRelationTypes[key]);

      // If no relations are selected, fall back to all available relations for this level
      if (availableRelations.length === 0) {
        console.warn('⚠️ No relationship types selected, using all types for this level');
        availableRelations = getRelationTypesForLevel(level, mode, experimentalMode);
      }
    }

    // Log which relation types are being used (helpful for debugging)
    if (mode === 'adaptive' && !experimentalMode) {
      console.log(`📚 Level ${level} using study-based training tasks (Level 1-2 types only):`, availableRelations);
    }

    const selectedRelation = availableRelations[Math.floor(Math.random() * availableRelations.length)];
    setCurrentRelation(selectedRelation);
    setGameState('showRelation');
    setUserAnswered(false);
  };

  const handleLevelDecrease = useCallback(() => {
    setGameState('levelDown');
    levelTransitionTimerRef.current = setTimeout(() => {
      stopAllSounds();
      const currentScore = score;
      const completedLevel = level; // Save the level they just failed
      setLevel(prev => {
        const newLevel = Math.max(1, prev - 1);
        console.log(`⬇️ Level decrease: ${prev} → ${newLevel}`);
        console.log(`⬇️ NOT saving to leaderboard (level drop doesn't update leaderboard)`);
        // Only save level locally, don't update leaderboard with score=0
        localStorage.setItem('adaptivePosnerLevel', String(newLevel));
        setSavedAdaptiveLevel(newLevel);
        return newLevel;
      });
      setScore(0);
      setWrongCount(0);
      setCurrentTask(0);
      setTaskHistory([]);
      setUsedPairs(new Set()); // Clear used pairs for new level
      // Regenerate task match sequence for new level (always 50/50 in adaptive mode)
      const sequence = generateTaskMatchSequence(32, 50);
      setTaskMatchSequence(sequence);
      console.log('🔄 Level decreased - used pairs and task sequence regenerated');
      prepareNextTask();
      levelTransitionTimerRef.current = null;
    }, 2000);
  }, [saveProgress, stopAllSounds, score, level, generateTaskMatchSequence]);

  const handleGameEnd = useCallback(() => {
    // Safety guard: Don't handle game end if we're in menu state
    if (gameStateRef.current === 'menu') {
      console.log('⚠️ handleGameEnd called while in menu state - ignoring');
      return;
    }
    if (mode === 'adaptive') {
      console.log('═'.repeat(80));
      console.log('🏁 GAME END - Evaluating performance');
      console.log('🏁 Score:', score, '/', numTasks);
      console.log('🏁 Wrong answers:', wrongCount);
      console.log('🏁 Current level:', level);

      // Check if 6 or more mistakes were made
      if (wrongCount >= 6) {
        console.log('⬇️ TOO MANY MISTAKES - Level decrease (6+ wrong)');
        handleLevelDecrease();
        return;
      }

      const percentage = (score / numTasks) * 100;
      // EXPLICIT: 90% of 32 = 29 (rounded). Score >= 29 MUST advance to next level
      const requiredScore = 29; // Hardcoded to ensure 29/32 (90%+) always advances
      console.log(`📊 Level completion check: ${score}/${numTasks} = ${percentage.toFixed(1)}%`);
      console.log(`📊 Level up threshold: EXACTLY 29 or more (90%+)`);
      console.log(`📊 Required score: ${requiredScore}`);
      console.log(`📊 Actual score: ${score}`);
      console.log(`📊 Will level up: ${score >= 29}`);

      if (score >= 29) {
        console.log(`✅✅✅ SCORE IS ${score} >= 29 - LEVELING UP NOW!`);
      } else {
        console.log(`❌❌❌ SCORE IS ${score} < 29 - NOT LEVELING UP`);
      }

      // CRITICAL: Score of 29 or more (90%+) MUST progress to next level
      if (score >= 29) {
        console.log(`✅ LEVEL UP! Score ${score}/${numTasks} (${percentage.toFixed(1)}%) >= 90%`);
        // Check if perfect score (100%)
        if (score === numTasks) {
          console.log(`🎉 Perfect score! ${score}/${numTasks} = 100%`);
          setGameState('perfectScore');
        } else {
          console.log(`⬆️ Level up! Score ${score}/${numTasks} >= ${requiredScore}/${numTasks}`);
          setGameState('levelUp');
        }
        // Progress to next level
        levelTransitionTimerRef.current = setTimeout(() => {
          stopAllSounds();
          const currentScore = score;
          setLevel(prev => {
            const newLevel = prev + 1;
            console.log(`✅ Level ${prev} completed with score ${currentScore}/${numTasks}, advancing to level ${newLevel}`);
            // IMPORTANT: Save the completed level (prev) with its score, not the new level
            // This ensures leaderboard shows "Level X - Y% completed" where Y is the actual completion % of level X
            saveProgress(prev, currentScore);
            console.log(`💾 Saved progress: Level ${prev} (completed) with score ${currentScore}`);
            return newLevel;
          });
          setScore(0);
          setWrongCount(0);
          setCurrentTask(0);
          setTaskHistory([]);
          setUsedPairs(new Set()); // Clear used pairs for new level
          // Regenerate task match sequence for new level (always 50/50 in adaptive mode)
          const sequence = generateTaskMatchSequence(32, 50);
          setTaskMatchSequence(sequence);
          console.log('🔄 New level - used pairs and task sequence regenerated');
          prepareNextTask();
          levelTransitionTimerRef.current = null;
        }, 3000);
      } else {
        // Failed to progress - save current level with current score
        console.log(`⚠️ Level ${level} not completed: ${score}/${numTasks} (${percentage.toFixed(1)}%)`);
        saveProgress(level, score);
        setGameState('results');
      }
    } else {
      // Manual mode - just show results
      setGameState('results');
      levelTransitionTimerRef.current = setTimeout(() => {
        // Clear auto-continue timer when auto-returning to menu
        if (autoContinueTimerRef.current) {
          clearTimeout(autoContinueTimerRef.current);
          autoContinueTimerRef.current = null;
          console.log('⏱️ Auto-continue timer cleared on auto menu return');
        }
        setGameState('menu');
        levelTransitionTimerRef.current = null;
      }, 5000);
    }
  }, [mode, score, numTasks, saveProgress, wrongCount, handleLevelDecrease, stopAllSounds, level, generateTaskMatchSequence]);

  const handleSpacePress = useCallback(() => {
    if (gameState === 'showRelation') {
      // Use pre-determined sequence for match/no-match to ensure exact distribution
      const willBeActual = taskMatchSequence[currentTask] ?? (Math.random() < 0.5);
      setIsActualRelation(willBeActual);

      if (willBeActual) {
        setCurrentWords(getRandomPair(currentRelation));
      } else {
        setCurrentWords(generateLookalike(currentRelation));
      }

      setGameState('showWords');
      setTrialStartTime(performance.now()); // Capture start time for response time tracking

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set timeout for no answer
      timeoutRef.current = setTimeout(() => {
        if (!userAnswered) {
          // Timeout - no answer given
          setUserAnswered(true); // Mark as answered to prevent keypresses
          setFeedback('timeout');
          setTaskHistory(prev => [...prev, {
            relation: currentRelation,
            words: currentWords,
            isActual: willBeActual,
            userResponse: null,
            correct: false
          }]);

          // Track wrong count in adaptive mode
          if (mode === 'adaptive') {
            setWrongCount(prev => prev + 1);
          }

          setTimeout(() => {
            // Check if we're still in game state (not returned to menu)
            if (gameStateRef.current === 'menu') {
              console.log('⚠️ Timeout fired but already returned to menu - ignoring');
              return;
            }
            setFeedback(null);
            setUserAnswered(false); // Reset for next task
            if (currentTask + 1 < numTasks) {
              setCurrentTask(prev => prev + 1);
              prepareNextTask();
            } else {
              handleGameEnd();
            }
          }, 700);
        }
      }, getTimeForLevel(level));
    }
  }, [gameState, currentRelation, level, currentTask, numTasks, currentWords, userAnswered, handleGameEnd, mode, wrongCount, handleLevelDecrease, taskMatchSequence]);

  const handleResponse = useCallback((userSaysYes) => {
    if (gameState !== 'showWords' || userAnswered) return;

    // Clear the timeout since user answered
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setUserAnswered(true);
    const correct = userSaysYes === isActualRelation;
    setFeedback(correct ? 'correct' : 'wrong');

    // Track response time for correct answers
    if (correct && trialStartTime !== null) {
      const responseTime = performance.now() - trialStartTime;
      setResponseTimes(prev => [...prev, responseTime]);
      console.log(`⏱️ Response time: ${responseTime.toFixed(2)}ms`);
    }

    // Play feedback sound
    if (soundEnabled) {
      if (correct && correctAudioRef.current) {
        correctAudioRef.current.play().catch(error => {
          console.log('Correct sound playback failed:', error);
        });
      } else if (!correct && incorrectAudioRef.current) {
        incorrectAudioRef.current.play().catch(error => {
          console.log('Incorrect sound playback failed:', error);
        });
      }
    }

    if (correct) {
      setScore(prev => {
        const newScore = prev + 1;
        console.log(`✅ CORRECT! Score: ${prev} → ${newScore} (Task ${currentTask + 1}/${numTasks})`);
        if (newScore === 27) {
          console.log(`🎯🎯🎯 SCORE REACHED 27! Should level up after task 30 completes!`);
        }
        return newScore;
      });
    } else {
      // Track wrong count in adaptive mode
      if (mode === 'adaptive') {
        setWrongCount(prev => {
          const newWrongCount = prev + 1;
          console.log(`❌ WRONG! Wrong count: ${prev} → ${newWrongCount} (Task ${currentTask + 1}/${numTasks})`);
          if (newWrongCount >= 6) {
            console.log(`🚨🚨🚨 WRONG COUNT >= 6! Will drop level when session ends!`);
          }
          return newWrongCount;
        });
      }
    }

    setTaskHistory(prev => [...prev, {
      relation: currentRelation,
      words: currentWords,
      isActual: isActualRelation,
      userResponse: userSaysYes,
      correct
    }]);

    setTimeout(() => {
      // Check if we're still in game state (not returned to menu)
      if (gameStateRef.current === 'menu') {
        console.log('⚠️ Timeout fired but already returned to menu - ignoring');
        return;
      }
      setFeedback(null);
      if (currentTask + 1 < numTasks) {
        setCurrentTask(prev => prev + 1);
        prepareNextTask();
      } else {
        handleGameEnd();
      }
    }, 700);
  }, [gameState, isActualRelation, currentTask, numTasks, currentRelation, currentWords, userAnswered, handleGameEnd, mode, wrongCount, handleLevelDecrease, soundEnabled, trialStartTime]);

  // Auto-continue timer for showRelation state
  useEffect(() => {
    // Clear any existing timer
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
      console.log('⏱️ Auto-continue timer cleared');
    }

    // Start auto-continue timer if enabled and in showRelation state
    if (autoContinueEnabled && gameState === 'showRelation') {
      console.log(`⏱️ Auto-continue timer started: ${autoContinueDelay} seconds`);
      autoContinueTimerRef.current = setTimeout(() => {
        console.log('⏱️ Auto-continue timer fired');
        // Check current gameState using ref (not captured closure variable)
        const currentGameState = gameStateRef.current;
        console.log(`⏱️ Current game state check: ${currentGameState}`);
        // Only trigger if still in showRelation state (guard against race conditions)
        if (currentGameState === 'showRelation') {
          console.log('⏱️ Auto-continue triggered - calling handleSpacePress');
          handleSpacePress();
        } else {
          console.log(`⏱️ Auto-continue cancelled - game state is now ${currentGameState}, not showRelation`);
        }
      }, autoContinueDelay * 1000);
    }

    // Cleanup function
    return () => {
      if (autoContinueTimerRef.current) {
        console.log('⏱️ Auto-continue timer cleanup on unmount/state change');
        clearTimeout(autoContinueTimerRef.current);
        autoContinueTimerRef.current = null;
      }
    };
  }, [gameState, autoContinueEnabled, autoContinueDelay, handleSpacePress]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape' && gameState !== 'menu') {
        e.preventDefault();
        stopAllSounds();
        // Clear auto-continue timer
        if (autoContinueTimerRef.current) {
          clearTimeout(autoContinueTimerRef.current);
          autoContinueTimerRef.current = null;
          console.log('⏱️ Auto-continue timer cleared on ESC menu return');
        }
        // Clear level transition timer
        if (levelTransitionTimerRef.current) {
          clearTimeout(levelTransitionTimerRef.current);
          levelTransitionTimerRef.current = null;
          console.log('⏱️ Level transition timer cleared on ESC menu return');
        }
        // Clear timeout timer (for word display timeout)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          console.log('⏱️ Timeout timer cleared on ESC menu return');
        }
        // Save current progress before returning to menu
        if (mode === 'adaptive' && gameState !== 'results' && gameState !== 'levelUp' && gameState !== 'levelDown' && gameState !== 'perfectScore') {
          console.log(`🔴 ESC PRESSED - Current state:`);
          console.log(`🔴 Mode: ${mode}`);
          console.log(`🔴 Level: ${level}`);
          console.log(`🔴 Score: ${score}`);
          console.log(`🔴 GameState: ${gameState}`);
          console.log(`🔴 This represents: ${Math.round((score / 32) * 100)}% completion`);
          console.log(`💾 Saving progress before returning to menu: Level ${level}, Score ${score}`);
          saveProgress(level, score);
        }
        setUsedPairs(new Set()); // Clear used pairs when returning to menu
        console.log('🔄 Returned to menu - used pairs cleared');
        setGameState('menu');
        setFeedback(null);
      } else if (e.key === ' ' && gameState === 'showRelation') {
        e.preventDefault();
        handleSpacePress();
      } else if (gameState === 'showWords' && !userAnswered && !feedback) {
        // Only allow j/f keys when showing words, user hasn't answered, and no feedback is showing
        if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          handleResponse(true);
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          handleResponse(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, handleSpacePress, handleResponse, userAnswered, feedback, stopAllSounds, saveProgress, level, score, mode]);

  // Prevent body scrolling when leaderboard modal is open
  useEffect(() => {
    if (showLeaderboard) {
      console.log('🔒 Locking body scroll - leaderboard open');
      document.body.style.overflow = 'hidden';
    } else {
      console.log('🔓 Unlocking body scroll - leaderboard closed');
      document.body.style.overflow = 'unset';
    }

    // Cleanup: ensure scroll is restored when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showLeaderboard]);

  const getFeedbackColor = () => {
    if (feedback === 'correct') return 'bg-green-600';
    if (feedback === 'wrong') return 'bg-red-600';
    if (feedback === 'timeout') return 'bg-gray-600';
    return 'bg-gray-800';
  };

  return (
    <div className={`min-h-screen ${feedback ? getFeedbackColor() : 'bg-gray-800'} text-white flex items-center justify-center p-4 transition-colors duration-200`}>
      {/* Hidden audio elements for sounds */}
      <audio
        ref={celebrationAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3"
        preload="auto"
      />
      <audio
        ref={correctAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3"
        preload="auto"
      />
      <audio
        ref={incorrectAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2876/2876-preview.mp3"
        preload="auto"
      />
      <audio
        ref={levelDownAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/1/1-preview.mp3"
        preload="auto"
      />
      <audio
        ref={successAudioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3"
        preload="auto"
      />

      {gameState === 'menu' && (
        <div className="max-w-2xl w-full space-y-6">
          <h1 className="text-4xl font-bold text-center mb-4">Adaptive Posner</h1>
          <p className="text-center text-gray-400 italic text-sm mb-2">
            In memoriam of those 44 unfortunate ones who were brutally exiled from Noetica...
          </p>
          <div className="text-center mb-6 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://discord.gg/cogn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Join our Discord community
            </a>
            <button
              onClick={() => setShowAboutUs(true)}
              className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Contact Us
            </button>
          </div>

          {isSupabaseConfigured() && (
            <>
              <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-4 rounded-lg">
                {user ? (
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                      <p className="text-sm text-gray-400">Logged in as</p>
                      <p className="font-bold text-green-400">{user.user_metadata?.username || user.email}</p>
                    </div>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <button
                        onClick={() => {
                          console.log('🎯 LEADERBOARD BUTTON CLICKED');
                          setShowLeaderboard(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm w-full sm:w-auto"
                      >
                        Leaderboard
                      </button>
                      <button
                        onClick={handleLogout}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm w-full sm:w-auto"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <p className="text-gray-300">Sign in to track your scores on the leaderboard!</p>
                    <button
                      onClick={() => setShowAuth(true)}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm w-full sm:w-auto"
                    >
                      Login / Sign Up
                    </button>
                  </div>
                )}
              </div>

              {/* Samsung Chrome compatibility note */}
              {navigator.userAgent.includes('SamsungBrowser') && !user && (
                <div className="bg-orange-900/40 border border-orange-700 p-3 rounded-lg">
                  <p className="text-xs text-orange-200">
                    <strong>📱 Samsung Browser Users:</strong> If login doesn't persist after refresh, please enable cookies and site data in browser settings, or try using Chrome/Firefox for best experience.
                  </p>
                </div>
              )}
            </>
          )}

          {savedAdaptiveLevel > 1 && (
            <div className="bg-gradient-to-r from-blue-800 to-purple-800 p-4 sm:p-6 rounded-lg space-y-3">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">Saved Progress</h2>
                  <p className="text-base sm:text-lg text-white mt-2">Current Level: <span className="font-bold text-green-400">{savedAdaptiveLevel}</span></p>
                  <p className="text-sm text-gray-300">Highest Level Reached: <span className="font-bold">{highestLevel}</span></p>
                </div>
                <button
                  onClick={resetProgress}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm w-full sm:w-auto"
                >
                  Reset Progress
                </button>
              </div>
            </div>
          )}

          {/* Congratulations for reaching training goal */}
          {trainingGoalMinutes > 0 && totalSessionMinutes >= trainingGoalMinutes && (
            <div className="bg-gradient-to-r from-green-900 to-emerald-900 p-6 rounded-lg space-y-4 border-2 border-green-500">
              <div className="text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h2 className="text-2xl font-bold text-green-300 mb-2">Congratulations!</h2>
                <p className="text-lg text-white">You've reached your daily training goal of {trainingGoalMinutes} minutes!</p>
                <p className="text-sm text-green-200 mt-2">Keep up the excellent work! 💪</p>
              </div>
            </div>
          )}

          {/* Chinese and Korean Numerals Enable Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chinese Numerals Section */}
            <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-yellow-400">🇨🇳 Chinese Numerals</h2>
                <button
                  onClick={toggleChineseNumerals}
                  className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                    chineseNumeralsEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  {chineseNumeralsEnabled ? 'Enabled ✓' : 'Enable'}
                </button>
              </div>
              <p className="text-sm text-gray-300">
                Ready to implement Chinese numerals in your training? This can potentially make training more effective by engaging multiple cognitive pathways.
              </p>
              <button
                onClick={() => setShowChineseReference(!showChineseReference)}
                className="text-blue-400 hover:text-blue-300 text-sm underline"
              >
                {showChineseReference ? '▼ Hide Reference' : '▶ Click to Learn More'}
              </button>

              {showChineseReference && (
                <div className="mt-4 p-4 bg-black/30 rounded-lg space-y-3">
                  <p className="text-sm text-gray-300 mb-3">The adaptive mode uses Arabic, Chinese, and Roman numerals. Learn the Chinese characters:</p>
                  <div className="grid grid-cols-3 gap-3 text-center" style={{fontFamily: 'Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, STHeiti, WenQuanYi Micro Hei, Noto Sans SC, sans-serif'}}>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>一</div>
                      <div className="text-sm text-gray-400">1 (yī)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>二</div>
                      <div className="text-sm text-gray-400">2 (èr)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>三</div>
                      <div className="text-sm text-gray-400">3 (sān)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>四</div>
                      <div className="text-sm text-gray-400">4 (sì)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>五</div>
                      <div className="text-sm text-gray-400">5 (wǔ)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>六</div>
                      <div className="text-sm text-gray-400">6 (liù)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>七</div>
                      <div className="text-sm text-gray-400">7 (qī)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>八</div>
                      <div className="text-sm text-gray-400">8 (bā)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>九</div>
                      <div className="text-sm text-gray-400">9 (jiǔ)</div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-900/40 border border-blue-700 rounded-lg">
                    <p className="text-xs text-blue-200" style={{fontFamily: 'Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, STHeiti, WenQuanYi Micro Hei, Noto Sans SC, sans-serif'}}>
                      <strong>Tip:</strong> Odd numbers (奇数): 一三五七九 | Even numbers (偶数): 二四六八
                    </p>
                  </div>
                  <button
                    onClick={toggleChineseNumerals}
                    className={`w-full px-4 py-2 rounded-lg font-bold transition-colors ${
                      chineseNumeralsEnabled
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {chineseNumeralsEnabled ? 'Enabled ✓' : 'Enable Chinese Numerals'}
                  </button>
                </div>
              )}
            </div>

            {/* Sino-Korean Numerals Section */}
            <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-yellow-400">🇰🇷 Sino-Korean Numerals</h2>
                <button
                  onClick={toggleKoreanNumerals}
                  className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                    koreanNumeralsEnabled
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  {koreanNumeralsEnabled ? 'Enabled ✓' : 'Enable'}
                </button>
              </div>
              <p className="text-sm text-gray-300">
                Ready to implement Sino-Korean numerals in your training? This can potentially make training more effective by engaging multiple cognitive pathways.
              </p>
              <button
                onClick={() => setShowKoreanReference(!showKoreanReference)}
                className="text-blue-400 hover:text-blue-300 text-sm underline"
              >
                {showKoreanReference ? '▼ Hide Reference' : '▶ Click to Learn More'}
              </button>

              {showKoreanReference && (
                <div className="mt-4 p-4 bg-black/30 rounded-lg space-y-3">
                  <p className="text-sm text-gray-300 mb-3">Sino-Korean numerals are used in formal contexts and share roots with Chinese numerals:</p>
                  <div className="grid grid-cols-3 gap-3 text-center" style={{fontFamily: 'Noto Sans KR, Malgun Gothic, sans-serif'}}>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>일</div>
                      <div className="text-sm text-gray-400">1 (il)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>이</div>
                      <div className="text-sm text-gray-400">2 (i)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-blue-400 mb-1" style={{fontFamily: 'inherit'}}>삼</div>
                      <div className="text-sm text-gray-400">3 (sam)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>사</div>
                      <div className="text-sm text-gray-400">4 (sa)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>오</div>
                      <div className="text-sm text-gray-400">5 (o)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-green-400 mb-1" style={{fontFamily: 'inherit'}}>육</div>
                      <div className="text-sm text-gray-400">6 (yuk)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>칠</div>
                      <div className="text-sm text-gray-400">7 (chil)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>팔</div>
                      <div className="text-sm text-gray-400">8 (pal)</div>
                    </div>
                    <div className="bg-black/30 p-3 rounded-lg">
                      <div className="text-3xl font-bold text-purple-400 mb-1" style={{fontFamily: 'inherit'}}>구</div>
                      <div className="text-sm text-gray-400">9 (gu)</div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-900/40 border border-blue-700 rounded-lg">
                    <p className="text-xs text-blue-200" style={{fontFamily: 'Noto Sans KR, Malgun Gothic, sans-serif'}}>
                      <strong>Tip:</strong> Odd numbers: 일삼오칠구 | Even numbers: 이사육팔
                    </p>
                  </div>
                  <button
                    onClick={toggleKoreanNumerals}
                    className={`w-full px-4 py-2 rounded-lg font-bold transition-colors ${
                      koreanNumeralsEnabled
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {koreanNumeralsEnabled ? 'Enabled ✓' : 'Enable Sino-Korean Numerals'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Sound Settings</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-medium">Sound Effects</p>
                <p className="text-sm text-gray-400">Play feedback sounds during gameplay</p>
              </div>
              <button
                onClick={toggleSound}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  soundEnabled ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    soundEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Auto Continue</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium">Enable Auto Continue</p>
                  <p className="text-sm text-gray-400">Automatically advance to next trial after delay</p>
                </div>
                <button
                  onClick={toggleAutoContinue}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    autoContinueEnabled ? 'bg-green-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                      autoContinueEnabled ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {autoContinueEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Delay: {autoContinueDelay} second{autoContinueDelay !== 1 ? 's' : ''}</label>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={autoContinueDelay}
                    onChange={(e) => updateAutoContinueDelay(e.target.value)}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>1s</span>
                    <span>10s</span>
                    <span>20s</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Works in both Adaptive and Manual modes</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Training Goal</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex-1">
                  <p className="text-lg font-medium">Daily Training Goal: {trainingGoalMinutes} minutes</p>
                  <p className="text-sm text-gray-400">Set your daily training time target (0-500 minutes)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={trainingGoalMinutes}
                    onChange={(e) => {
                      const value = Math.max(0, Math.min(500, parseInt(e.target.value) || 0));
                      setTrainingGoalMinutes(value);
                      saveTrainingGoal(value);
                    }}
                    className="w-20 px-3 py-2 bg-gray-700 text-white rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">min</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                value={trainingGoalMinutes}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  setTrainingGoalMinutes(value);
                  saveTrainingGoal(value);
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0 min</span>
                <span>250 min</span>
                <span>500 min</span>
              </div>
              {totalTrainingMinutes > 0 && (
                <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <p className="text-sm text-blue-300">
                    <strong>Total Training Time:</strong> {totalTrainingMinutes} minutes
                  </p>
                  {trainingGoalMinutes > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (totalSessionMinutes / trainingGoalMinutes) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Today: {totalSessionMinutes}m {totalSessionSeconds}s / {trainingGoalMinutes} minutes ({Math.round((totalSessionMinutes / trainingGoalMinutes) * 100)}%)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Experimental Mode</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-medium">Enable Experimental Features</p>
                <p className="text-sm text-gray-400">Use all relation types at all levels (non-standard)</p>
              </div>
              <button
                onClick={toggleExperimentalMode}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  experimentalMode ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    experimentalMode ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {!experimentalMode && (
              <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                <p className="text-sm text-blue-300">
                  <strong>Standard Adaptive Mode (4-Level Posner Task):</strong>
                </p>
                <div className="text-xs text-blue-200 mt-2 space-y-1">
                  <p><strong>Level 1:</strong> Same Format (1-2, III-IV, 五-六) - Physical property</p>
                  <p><strong>Level 2:</strong> Same Meaning (2-二-II) - Semantic property</p>
                  <p><strong>Level 3:</strong> Both Odd/Even - Same Format (1-3, 二-四) - Conceptual</p>
                  <p><strong>Level 4:</strong> Both Odd/Even - Mixed Format (1-三, 2-IV) - Conceptual</p>
                </div>
                <p className="text-xs text-blue-200 mt-2">
                  • Uses numbers 1-9 in Arabic, Chinese (一~九), and Roman numerals (I-IX)
                </p>
                <p className="text-xs text-blue-200">
                  • Difficulty increases through time pressure only (2000ms → 87.5ms)
                </p>
              </div>
            )}
            {experimentalMode && (
              <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <p className="text-sm text-yellow-300">
                  <strong>Experimental Mode Active:</strong> All relation types available at all levels
                </p>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">How to Train</h2>
            <p className="text-gray-300">
              You will be shown a possible relationship, then two words. Decide if the words match the relationship before time runs out!
            </p>

            <div className="space-y-2 mt-4">
              <h3 className="text-xl font-semibold">Relationships:</h3>
              {Object.entries(relationTypes).map(([key, desc]) => (
                <div key={key} className="text-sm text-gray-400">
                  • {desc}
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="text-xl font-semibold">Controls:</h3>
              <p className="text-sm text-gray-400">• Press SPACE to start each task</p>
              <p className="text-sm text-gray-400">• Press J if the relationship matches (during timer only)</p>
              <p className="text-sm text-gray-400">• Press F if it doesn't match (during timer only)</p>
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="text-xl font-semibold">Feedback:</h3>
              <p className="text-sm text-green-400">• Green = Correct</p>
              <p className="text-sm text-red-400">• Red = Wrong</p>
              <p className="text-sm text-gray-400">• Gray = Timeout (no answer)</p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Select Mode</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => startGame('manual')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 px-4 rounded-lg text-lg"
              >
                Manual Mode
              </button>
              <button
                onClick={() => startGame('adaptive')}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-4 rounded-lg text-lg"
              >
                Adaptive Mode{experimentalMode && <span className="text-orange-300"> (Experimental)</span>}
                {savedAdaptiveLevel > 1 && (
                  <div className="text-sm mt-1 text-yellow-300">Continue from Level {savedAdaptiveLevel}</div>
                )}
              </button>
            </div>
            <div className="text-sm text-gray-400 space-y-2 mt-4">
              <p><strong>Manual Mode:</strong> Choose your own level (1-18) and number of tasks (10-60)</p>
              <p><strong>Adaptive Mode:</strong> Start at level 1, get 90% correct (29/32) to advance. Get 6 wrong and level decreases! Progress is saved automatically.</p>
            </div>
            <div className="mt-4 p-3 bg-green-900/40 border border-green-700 rounded-lg">
              <p className="text-sm text-green-200">
                <strong>💡 Recommendation:</strong> We highly recommend training with <strong>Standard Adaptive Mode</strong> since it uses the same task types as in the study.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-900 to-purple-900 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Manual Mode Settings</h2>
            <div>
              <label className="block text-sm font-medium mb-2">
                Level: {level} ({getTimeForLevel(level)}ms per task)
              </label>
              <input
                type="range"
                min="1"
                max="28"
                value={level}
                onChange={(e) => setLevel(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Number of Tasks: {numTasks}
              </label>
              <input
                type="range"
                min="10"
                max="60"
                value={numTasks}
                onChange={(e) => setNumTasks(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Match Percentage: {matchPercentage}% (matches) / {100 - matchPercentage}% (non-matches)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={matchPercentage}
                onChange={(e) => setMatchPercentage(parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-gray-400 mt-1">
                Controls the proportion of matching vs non-matching tasks. Standard adaptive mode always uses 50/50.
              </p>
            </div>

            <div className="mt-4">
              <label className="flex items-center space-x-3 cursor-pointer bg-indigo-800/50 p-3 rounded-lg hover:bg-indigo-800/70 transition-colors">
                <input
                  type="checkbox"
                  checked={showManualModeOptions}
                  onChange={(e) => setShowManualModeOptions(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="text-base font-medium">Enable Manual Mode Options (Select Specific Relationship Types)</span>
              </label>
            </div>

            {showManualModeOptions && (
              <div className="mt-4 p-4 bg-indigo-800/30 rounded-lg border border-indigo-600/50">
                <label className="block text-sm font-medium mb-3">
                  Relationship Types to Include:
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {Object.keys(relationTypes).map(key => (
                    <label key={key} className="flex items-start space-x-2 cursor-pointer hover:bg-indigo-700/30 p-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedRelationTypes[key]}
                        onChange={(e) => {
                          setSelectedRelationTypes(prev => ({
                            ...prev,
                            [key]: e.target.checked
                          }));
                        }}
                        className="w-4 h-4 cursor-pointer mt-1 flex-shrink-0"
                      />
                      <span className="text-sm leading-tight">{relationTypes[key]}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      const allSelected = {};
                      Object.keys(relationTypes).forEach(key => {
                        allSelected[key] = true;
                      });
                      setSelectedRelationTypes(allSelected);
                    }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => {
                      const noneSelected = {};
                      Object.keys(relationTypes).forEach(key => {
                        noneSelected[key] = false;
                      });
                      setSelectedRelationTypes(noneSelected);
                    }}
                    className="text-xs bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {gameState === 'showRelation' && !feedback && (
        <div className="text-center space-y-8">
          <div className="text-sm text-gray-400">
            {mode === 'adaptive' && <div className="text-lg font-bold text-yellow-400 mb-2">Level {level}{experimentalMode && <span className="text-orange-300"> (Experimental)</span>}</div>}
            Task {currentTask + 1} / {numTasks}
          </div>
          <div className="text-3xl font-bold mb-8">
            Possible Relationship:
          </div>
          <div className="text-4xl font-bold text-blue-400 mb-12">
            {relationTypes[currentRelation]}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => {
                stopAllSounds();
                // Clear auto-continue timer
                if (autoContinueTimerRef.current) {
                  clearTimeout(autoContinueTimerRef.current);
                  autoContinueTimerRef.current = null;
                  console.log('⏱️ Auto-continue timer cleared on menu return');
                }
                // Clear level transition timer
                if (levelTransitionTimerRef.current) {
                  clearTimeout(levelTransitionTimerRef.current);
                  levelTransitionTimerRef.current = null;
                  console.log('⏱️ Level transition timer cleared on menu return');
                }
                // Clear timeout timer (for word display timeout)
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                  console.log('⏱️ Timeout timer cleared on menu return');
                }
                // Save progress before returning to menu
                if (mode === 'adaptive') {
                  console.log(`🔴 BACK TO MENU clicked - Current state:`);
                  console.log(`🔴 Mode: ${mode}`);
                  console.log(`🔴 Level: ${level}`);
                  console.log(`🔴 Score: ${score}`);
                  console.log(`🔴 GameState: ${gameState}`);
                  console.log(`🔴 This represents: ${Math.round((score / 32) * 100)}% completion`);
                  console.log(`💾 Saving progress before returning to menu: Level ${level}, Score ${score}`);
                  saveProgress(level, score);
                }
                setUsedPairs(new Set()); // Clear used pairs when returning to menu
                console.log('🔄 Returned to menu - used pairs cleared');
                setGameState('menu');
              }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-lg order-2 sm:order-1"
            >
              <span className="block sm:inline">Back to Menu</span>
              <span className="hidden sm:inline text-sm text-gray-300 ml-2">(Press Esc)</span>
            </button>
            <button
              onClick={handleSpacePress}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-12 rounded-lg text-2xl active:bg-green-800 touch-manipulation order-1 sm:order-2"
            >
              <span className="block sm:inline">Continue</span>
              <span className="hidden sm:inline text-lg text-green-200 ml-2">(Press Space)</span>
            </button>
          </div>
        </div>
      )}

      {gameState === 'showWords' && !feedback && (
        <div className="text-center space-y-8">
          <div className="text-sm text-gray-400">
            {mode === 'adaptive' && <div className="text-lg font-bold text-yellow-400 mb-2">Level {level}{experimentalMode && <span className="text-orange-300"> (Experimental)</span>}</div>}
            Task {currentTask + 1} / {numTasks}
          </div>
          <div className="text-6xl font-bold space-x-8" style={{fontFamily: 'Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, STHeiti, WenQuanYi Micro Hei, Noto Sans SC, sans-serif'}}>
            <span className={getNumberColor(currentWords[0])} style={{fontFamily: 'inherit'}}>{currentWords[0]}</span>
            <span className="text-gray-500">-</span>
            <span className={getNumberColor(currentWords[1])} style={{fontFamily: 'inherit'}}>{currentWords[1]}</span>
          </div>
          <div className="text-xl text-gray-400 mt-8">
            <div className="font-bold text-white mb-2">Answer NOW!</div>
            <div className="hidden md:block">J = Match | F = No Match</div>
          </div>
          <div className="flex gap-4 justify-center mt-6 px-4 w-full max-w-md mx-auto">
            <button
              onClick={() => handleResponse(false)}
              className="flex-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-8 px-6 rounded-lg text-2xl touch-manipulation"
            >
              No Match
              <div className="text-sm mt-1 opacity-75">Press F</div>
            </button>
            <button
              onClick={() => handleResponse(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-8 px-6 rounded-lg text-2xl touch-manipulation"
            >
              Match
              <div className="text-sm mt-1 opacity-75">Press J</div>
            </button>
          </div>
          <button
            onClick={() => {
              stopAllSounds();
              // Clear auto-continue timer
              if (autoContinueTimerRef.current) {
                clearTimeout(autoContinueTimerRef.current);
                autoContinueTimerRef.current = null;
                console.log('⏱️ Auto-continue timer cleared on menu return');
              }
              // Clear level transition timer
              if (levelTransitionTimerRef.current) {
                clearTimeout(levelTransitionTimerRef.current);
                levelTransitionTimerRef.current = null;
                console.log('⏱️ Level transition timer cleared on menu return');
              }
              // Clear timeout timer (for word display timeout)
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
                console.log('⏱️ Timeout timer cleared on menu return');
              }
              setGameState('menu');
            }}
            className="mt-4 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-lg"
          >
            Back to main menu
          </button>
        </div>
      )}

      {feedback && (
        <div className="text-center">
          <div className="text-8xl font-bold">
            {feedback === 'correct' && '✓'}
            {feedback === 'wrong' && '✗'}
            {feedback === 'timeout' && '⏱'}
          </div>
        </div>
      )}

      {gameState === 'levelUp' && (
        <div className="text-center space-y-8">
          <div className="text-8xl font-bold text-green-400">🎉</div>
          <h2 className="text-5xl font-bold text-green-400">Level Up!</h2>
          <div className="text-3xl text-white">
            Level {level} Complete
          </div>
          <div className="text-2xl text-gray-400">
            {score} / {numTasks} correct ({Math.round((score / numTasks) * 100)}%)
          </div>
          <div className="text-xl text-yellow-400">
            Advancing to Level {level + 1}...
          </div>
        </div>
      )}

      {gameState === 'perfectScore' && (
        <div className="text-center space-y-8">
          <div className="text-8xl font-bold text-yellow-400">⭐</div>
          <h2 className="text-5xl font-bold text-yellow-400">Perfect Score!</h2>
          <div className="text-3xl text-white">
            You got all correct!
          </div>
          <div className="text-2xl text-green-400 font-bold">
            Excellent job!
          </div>
          <div className="text-2xl text-gray-400">
            {score} / {numTasks} correct (100%)
          </div>
          <div className="text-xl text-yellow-400">
            Progressing to Level {level + 1}...
          </div>
        </div>
      )}

      {gameState === 'levelDown' && (
        <div className="text-center space-y-8">
          <div className="text-8xl font-bold text-red-400">⚠️</div>
          <h2 className="text-5xl font-bold text-red-400">Too Many Errors!</h2>
          <div className="text-3xl text-white">
            You made {wrongCount}/6 mistakes
          </div>
          <div className="text-2xl text-gray-400">
            (6 is the threshold)
          </div>
          <div className="text-2xl text-gray-400">
            Decreasing level to {Math.max(1, level - 1)}...
          </div>
        </div>
      )}

      {gameState === 'results' && !feedback && (
        <div className="text-center space-y-8">
          {mode === 'adaptive' ? (
            <>
              <h2 className="text-4xl font-bold">Level {level} - Failed to Progress</h2>
              <div className="text-6xl font-bold text-red-400">
                {Math.round((score / numTasks) * 100)}%
              </div>
              <div className="text-2xl text-gray-400">
                {score} / {numTasks} correct
              </div>
              <div className="text-xl text-gray-300">
                You need 90% (27/30) to advance to the next level
              </div>
              <button
                onClick={() => {
                  // Clear auto-continue timer
                  if (autoContinueTimerRef.current) {
                    clearTimeout(autoContinueTimerRef.current);
                    autoContinueTimerRef.current = null;
                    console.log('⏱️ Auto-continue timer cleared on menu return');
                  }
                  // Clear level transition timer
                  if (levelTransitionTimerRef.current) {
                    clearTimeout(levelTransitionTimerRef.current);
                    levelTransitionTimerRef.current = null;
                    console.log('⏱️ Level transition timer cleared on menu return');
                  }
                  // Clear timeout timer (for word display timeout)
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                    console.log('⏱️ Timeout timer cleared on menu return');
                  }
                  setGameState('menu');
                }}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg"
              >
                Back to main menu
              </button>
            </>
          ) : (
            <>
              <h2 className="text-4xl font-bold">Trial Complete!</h2>
              <div className="text-6xl font-bold text-green-400">
                {Math.round((score / numTasks) * 100)}%
              </div>
              <div className="text-2xl text-gray-400">
                {score} / {numTasks} correct
              </div>
              <div className="text-gray-500">
                Returning to menu in 5 seconds...
              </div>
              <button
                onClick={() => {
                  // Clear auto-continue timer
                  if (autoContinueTimerRef.current) {
                    clearTimeout(autoContinueTimerRef.current);
                    autoContinueTimerRef.current = null;
                    console.log('⏱️ Auto-continue timer cleared on menu return');
                  }
                  // Clear level transition timer
                  if (levelTransitionTimerRef.current) {
                    clearTimeout(levelTransitionTimerRef.current);
                    levelTransitionTimerRef.current = null;
                    console.log('⏱️ Level transition timer cleared on menu return');
                  }
                  // Clear timeout timer (for word display timeout)
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                    console.log('⏱️ Timeout timer cleared on menu return');
                  }
                  setGameState('menu');
                }}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-lg"
              >
                Back to main menu
              </button>
            </>
          )}
        </div>
      )}

      {/* Authentication Modal */}
      {showAuth && isSupabaseConfigured() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 gpu-accelerate">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full gpu-accelerate">
            <h2 className="text-3xl font-bold mb-6 text-center">
              {authMode === 'login' ? 'Login' : 'Sign Up'}
            </h2>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-12 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {authError && (
                <p className="text-red-400 text-sm">{authError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                {authMode === 'login' ? 'Login' : 'Sign Up'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  setAuthError('');
                  setShowPassword(false);
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg"
              >
                {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Login'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAuth(false);
                  setAuthError('');
                  setUsername('');
                  setPassword('');
                  setShowPassword(false);
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Leaderboard Modal */}
      {(() => {
        const shouldShow = showLeaderboard && isSupabaseConfigured();
        console.log('📊 Modal render check - showLeaderboard:', showLeaderboard, 'isConfigured:', isSupabaseConfigured(), 'shouldShow:', shouldShow);
        return shouldShow;
      })() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50 gpu-accelerate">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-8 max-w-5xl w-full max-h-[90vh] flex flex-col gpu-accelerate">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-center">Leaderboard</h2>
            <p className="text-center text-xs sm:text-sm text-gray-400 mb-1">Only Standard Adaptive Mode</p>
            {leaderboard.length > 0 && (
              <p className="text-center text-xs sm:text-sm text-green-400 mb-3 sm:mb-4">
                Showing all {leaderboard.length} player{leaderboard.length !== 1 ? 's' : ''} • Scroll to see more
              </p>
            )}
            {leaderboard.length === 0 && <div className="mb-3 sm:mb-4"></div>}

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 px-1 smooth-scroll">
              <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-center text-gray-400">No entries yet. Be the first!</p>
              ) : (
                <>
                  {/* Desktop header - hidden on mobile */}
                  <div className="hidden sm:grid gap-4 font-bold text-sm text-gray-400 px-4 py-2" style={{gridTemplateColumns: '60px 1fr 200px 120px 100px 120px'}}>
                    <div>Rank</div>
                    <div>Username</div>
                    <div>Highest Level</div>
                    <div>Total Time</div>
                    <div>Today</div>
                    <div className="text-right">Ranking</div>
                  </div>
                  {(() => {
                    console.log('═'.repeat(80));
                    console.log(`🎨 RENDER PHASE - About to call .map() on leaderboard array`);
                    console.log(`🎨 Leaderboard array length: ${leaderboard.length}`);
                    console.log(`🎨 Leaderboard array is: ${Array.isArray(leaderboard) ? 'ARRAY' : 'NOT AN ARRAY'}`);
                    console.log(`🎨 All usernames in array:`, leaderboard.map(e => e.username).join(', '));
                    console.log(`🎨 Calling .map() NOW - should iterate ${leaderboard.length} times`);
                    console.log('═'.repeat(80));
                    return null;
                  })()}
                  {leaderboard.map((entry, index) => {
                    console.log(`🎨 .map() iteration #${index + 1}/${leaderboard.length}: Rendering ${entry.username}`);

                    // Calculate percentile: percentage of players you're better than
                    const percentile = leaderboard.length > 1
                      ? Math.round(((leaderboard.length - index - 1) / leaderboard.length) * 100)
                      : 100;

                    // Calculate level completion percentage (out of 32 tasks in adaptive mode)
                    const bestScore = entry.best_score || 0;
                    const levelProgress = Math.round((bestScore / 32) * 100);

                    // Detailed logging for debugging
                    console.log(`📊 Leaderboard entry ${index + 1}:`);
                    console.log(`   Username: ${entry.username}`);
                    console.log(`   Highest Level: ${entry.highest_level}`);
                    console.log(`   Best Score (raw from DB): ${entry.best_score}`);
                    console.log(`   Best Score (after ||0): ${bestScore}`);
                    console.log(`   Calculation: ${bestScore}/32 = ${levelProgress}%`);
                    console.log(`   Percentile: ${getOrdinalSuffix(percentile)}`);

                    if (entry.best_score === null || entry.best_score === undefined) {
                      console.warn(`⚠️ WARNING: best_score is ${entry.best_score} for ${entry.username}!`);
                    }
                    if (levelProgress === 0 && entry.highest_level > 0) {
                      console.warn(`⚠️ WARNING: Level ${entry.highest_level} but 0% completion for ${entry.username}!`);
                    }

                    // Get styling based on rank
                    let rankStyle = '';
                    if (index === 0) {
                      // 1st place - Golden
                      rankStyle = 'bg-gradient-to-r from-yellow-900 to-yellow-800 border-2 border-yellow-500 shadow-lg';
                    } else if (index === 1) {
                      // 2nd place - Silver
                      rankStyle = 'bg-gradient-to-r from-gray-400 to-gray-500 border-2 border-gray-300 shadow-lg text-gray-900';
                    } else if (index === 2) {
                      // 3rd place - Bronze
                      rankStyle = 'bg-gradient-to-r from-orange-900 to-orange-800 border-2 border-orange-600 shadow-lg';
                    } else if (entry.user_id === user?.id) {
                      // Current user (not in top 3)
                      rankStyle = 'bg-blue-900';
                    } else {
                      // Others
                      rankStyle = 'bg-gray-700';
                    }

                    console.log(`🎨 ✅ Returning JSX for entry #${index + 1}: ${entry.username} with rank style: ${rankStyle}`);

                    return (
                      <div
                        key={entry.user_id}
                        className={`rounded-lg ${rankStyle} ${index === 0 ? 'first-place-glow' : ''}`}
                      >
                        {/* Desktop layout */}
                        <div className="hidden sm:grid gap-4 px-4 py-3" style={{gridTemplateColumns: '60px 1fr 200px 120px 100px 120px'}}>
                          <div className="font-bold text-lg">
                            {index === 0 && '🥇'}
                            {index === 1 && '🥈'}
                            {index === 2 && '🥉'}
                            {index > 2 && `#${index + 1}`}
                          </div>
                          <div className="truncate font-medium flex items-center gap-2">
                            {entry.is_anonymous && <span title="Anonymous User">🕵️</span>}
                            {entry.username}
                          </div>
                          <div className="font-semibold">
                            <span className="text-white">Level {entry.highest_level}</span>
                            <span className="text-green-400 ml-2">- {levelProgress}% completed</span>
                          </div>
                          <div className="font-semibold text-blue-400">
                            {entry.total_training_minutes ? (
                              <>
                                {entry.total_training_minutes} min
                                <div className="text-xs text-gray-400 mt-1">
                                  {(entry.total_training_minutes / entry.highest_level).toFixed(1)} min/level
                                </div>
                              </>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </div>
                          <div className="font-semibold text-green-400">
                            {(() => {
                              // Calculate today's training time from training_sessions
                              if (!entry.training_sessions || entry.training_sessions.length === 0) {
                                return <span className="text-gray-500">-</span>;
                              }
                              const today = new Date();
                              const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                              const todaySession = entry.training_sessions.find(s => s.date === todayString);
                              return todaySession ? `${todaySession.minutes} min` : <span className="text-gray-500">0 min</span>;
                            })()}
                          </div>
                          <div className="font-semibold text-yellow-400 text-right whitespace-nowrap">{getOrdinalSuffix(percentile)} percentile</div>
                        </div>

                        {/* Mobile layout */}
                        <div className={`block sm:hidden ${index === 0 ? 'px-4 py-5' : 'px-3 py-3'} ${index === 0 ? 'space-y-3' : 'space-y-2'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${index === 0 ? 'text-4xl' : 'text-xl'}`}>
                                {index === 0 && '🥇'}
                                {index === 1 && '🥈'}
                                {index === 2 && '🥉'}
                                {index > 2 && `#${index + 1}`}
                              </span>
                              <span className={`font-medium ${index === 0 ? 'text-lg' : 'text-sm'} flex items-center gap-1`}>
                                {entry.is_anonymous && <span title="Anonymous User">🕵️</span>}
                                {entry.username}
                              </span>
                            </div>
                            <span className={`${index === 0 ? 'text-sm' : 'text-xs'} font-semibold text-yellow-400`}>{getOrdinalSuffix(percentile)} percentile</span>
                          </div>
                          <div className={`${index === 0 ? 'text-base' : 'text-sm'} font-semibold`}>
                            <span className="text-white">Level {entry.highest_level}</span>
                            <span className="text-green-400 ml-1">- {levelProgress}%</span>
                          </div>
                          {entry.total_training_minutes && (
                            <div className={`${index === 0 ? 'text-sm' : 'text-xs'} text-blue-400`}>
                              Total: {entry.total_training_minutes} min ({(entry.total_training_minutes / entry.highest_level).toFixed(1)} min/level)
                            </div>
                          )}
                          {(() => {
                            // Calculate today's training time from training_sessions
                            if (!entry.training_sessions || entry.training_sessions.length === 0) {
                              return null;
                            }
                            const today = new Date();
                            const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            const todaySession = entry.training_sessions.find(s => s.date === todayString);
                            if (!todaySession || todaySession.minutes === 0) return null;
                            return (
                              <div className={`${index === 0 ? 'text-sm' : 'text-xs'} text-green-400`}>
                                Today: {todaySession.minutes} min
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    console.log('═'.repeat(80));
                    console.log(`🎨 ✅ .map() COMPLETED - All ${leaderboard.length} entries processed`);
                    console.log(`🎨 React should now render ${leaderboard.length} leaderboard entry divs`);
                    console.log('═'.repeat(80));
                    return null;
                  })()}
                </>
              )}
              </div>
            </div>

            {/* Buttons - fixed at bottom */}
            <div className="flex gap-3 mt-4 flex-shrink-0">
              <button
                onClick={() => {
                  setShowBellCurve(true);
                  setShowLeaderboard(false);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                Bell Curve
              </button>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bell Curve Modal */}
      {showBellCurve && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50 gpu-accelerate"
          onClick={() => setShowBellCurve(false)}
        >
          <div
            className="bg-gray-800 rounded-lg p-4 sm:p-8 max-w-5xl w-full max-h-[90vh] flex flex-col gpu-accelerate"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-center">Player Distribution Analysis</h2>
            <p className="text-center text-sm text-gray-400 mb-6">Actual player data distribution with statistical markers</p>

            {/* Bell curve visualization */}
            <div className="flex-1 overflow-y-auto mb-6">
              {(() => {
                if (leaderboard.length === 0) {
                  return <p className="text-center text-gray-400">No data to display</p>;
                }

                // Calculate mean and standard deviation
                const levels = leaderboard.map(e => e.highest_level || 0);
                const n = levels.length;
                const mean = levels.reduce((sum, l) => sum + l, 0) / n;
                // Use sample variance (n-1) for unbiased estimation
                const variance = levels.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / (n > 1 ? n - 1 : n);
                const stdDev = Math.sqrt(variance);

                // Sort players by level and score (best first)
                const sortedPlayers = [...leaderboard].sort((a, b) => {
                  if (b.highest_level !== a.highest_level) return b.highest_level - a.highest_level;
                  return b.best_score - a.best_score;
                });

                const bestPlayer = sortedPlayers[0];

                // Adaptive range - use actual data range with padding
                const minDataLevel = Math.min(...levels);
                const maxDataLevel = Math.max(...levels);

                // Extend range to show full distribution tails (mean ± 4σ)
                // This ensures left and right tails are fully visible
                const theoreticalMin = mean - 4 * stdDev;
                const theoreticalMax = mean + 4 * stdDev;

                // Use the wider of: theoretical range or actual data range
                const minLevel = Math.floor(Math.min(theoreticalMin, minDataLevel - 2));
                const maxLevel = Math.ceil(Math.max(theoreticalMax, maxDataLevel + 2));
                const range = maxLevel - minLevel;

                // Create histogram from actual player data
                const levelCounts = {};
                for (let level = minLevel; level <= maxLevel; level++) {
                  levelCounts[level] = 0;
                }

                // Count players at each level (rounded to nearest integer)
                levels.forEach(level => {
                  const rounded = Math.round(level);
                  if (levelCounts[rounded] !== undefined) {
                    levelCounts[rounded]++;
                  }
                });

                // Apply Gaussian smoothing to the histogram for a smooth curve
                const smoothingWindow = Math.max(1, stdDev * 0.3); // Adaptive smoothing based on stdDev
                const gaussianWeight = (distance, sigma) => {
                  return Math.exp(-0.5 * Math.pow(distance / sigma, 2));
                };

                // Make graph wider to show full distribution - always wide enough for full curve
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                // Wide enough to show full range comfortably - at least 50px per level
                const minGraphWidth = Math.max((range + 1) * 50, isMobile ? 600 : 1200);
                const graphWidth = minGraphWidth;
                const graphHeight = isMobile ? 360 : 400; // Increased height for crisp labels
                const padding = isMobile ? 40 : 50;
                const chartWidth = graphWidth - 2 * padding;
                const chartHeight = graphHeight - 2 * padding;

                // Generate smoothed curve points from actual data
                const curvePoints = [];
                const step = range / 200; // More points for smoother curve
                for (let x = minLevel; x <= maxLevel; x += step) {
                  // Apply Gaussian kernel smoothing
                  let smoothedCount = 0;
                  let totalWeight = 0;

                  // Sum weighted counts from nearby levels
                  for (let level = minLevel; level <= maxLevel; level++) {
                    const distance = Math.abs(x - level);
                    const weight = gaussianWeight(distance, smoothingWindow);
                    smoothedCount += (levelCounts[level] || 0) * weight;
                    totalWeight += weight;
                  }

                  const y = totalWeight > 0 ? smoothedCount / totalWeight : 0;
                  curvePoints.push({ x, y });
                }

                // Normalize curve to graph height
                const maxY = Math.max(...curvePoints.map(p => p.y));
                const scaledPoints = curvePoints.map(p => {
                  const scaledX = padding + ((p.x - minLevel) / range) * chartWidth;
                  const scaledY = graphHeight - padding - (p.y / maxY) * chartHeight;
                  return { x: scaledX, y: scaledY };
                });

                // Generate TRUE theoretical normal distribution curve for comparison
                const normalDistribution = (x, mu, sigma) => {
                  // Standard normal distribution formula: (1 / (σ√(2π))) * e^(-(x-μ)²/(2σ²))
                  const coefficient = 1 / (sigma * Math.sqrt(2 * Math.PI));
                  const exponent = -Math.pow(x - mu, 2) / (2 * Math.pow(sigma, 2));
                  return coefficient * Math.exp(exponent);
                };

                // Generate theoretical normal curve points
                const theoreticalPoints = [];
                for (let x = minLevel; x <= maxLevel; x += step) {
                  const y = normalDistribution(x, mean, stdDev);
                  theoreticalPoints.push({ x, y });
                }

                // Normalize theoretical curve to match the visual scale of actual data
                const maxTheoreticalY = Math.max(...theoreticalPoints.map(p => p.y));
                const scaledTheoreticalPoints = theoreticalPoints.map(p => {
                  const scaledX = padding + ((p.x - minLevel) / range) * chartWidth;
                  // Scale to match the height of actual data curve
                  const scaledY = graphHeight - padding - (p.y / maxTheoreticalY) * chartHeight;
                  return { x: scaledX, y: scaledY };
                });

                // Create SVG path for actual data curve outline
                const pathData = scaledPoints.map((p, i) =>
                  `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
                ).join(' ');

                // Create SVG path for theoretical normal curve
                const theoreticalPathData = scaledTheoreticalPoints.map((p, i) =>
                  `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
                ).join(' ');

                // Create filled path (close the shape at the bottom)
                const filledPathData = `M ${padding} ${graphHeight - padding} ` +
                  scaledPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
                  ` L ${graphWidth - padding} ${graphHeight - padding} Z`;

                // Calculate standard deviation positions
                const sdMarkers = [
                  { value: mean - 3 * stdDev, label: '-3σ', percent: '0.1%' },
                  { value: mean - 2 * stdDev, label: '-2σ', percent: '2.1%' },
                  { value: mean - 1 * stdDev, label: '-1σ', percent: '13.6%' },
                  { value: mean, label: 'μ', percent: '34.1%' },
                  { value: mean + 1 * stdDev, label: '+1σ', percent: '34.1%' },
                  { value: mean + 2 * stdDev, label: '+2σ', percent: '13.6%' },
                  { value: mean + 3 * stdDev, label: '+3σ', percent: '2.1%' }
                ].filter(m => m.value >= minLevel && m.value <= maxLevel);

                return (
                  <div className="space-y-4">
                    {/* Stats summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-700 p-4 rounded-lg">
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-blue-400">{leaderboard.length}</div>
                        <div className="text-xs sm:text-sm text-gray-400">Sample Size (n)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-yellow-400">{mean.toFixed(2)}</div>
                        <div className="text-xs sm:text-sm text-gray-400">Mean (μ)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-green-400">{stdDev.toFixed(2)}</div>
                        <div className="text-xs sm:text-sm text-gray-400">Std Dev (σ)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-purple-400">{maxDataLevel}</div>
                        <div className="text-xs sm:text-sm text-gray-400">Highest Level Reached</div>
                      </div>
                    </div>

                    {/* Actual Data Distribution Graph */}
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="text-center text-lg font-bold mb-4">Player Distribution Analysis</h3>
                      <p className="text-center text-xs text-gray-400 mb-3">Comparing actual player data vs theoretical normal distribution</p>
                      {isMobile && (
                        <p className="text-center text-xs text-gray-400 mb-2">← Scroll horizontally to see full curve →</p>
                      )}
                      <div className="overflow-x-auto overflow-y-hidden pb-12 -mx-2 px-2">
                        <svg width={graphWidth} height={graphHeight} className="mx-auto block" style={{shapeRendering: 'geometricPrecision'}}>
                            {/* Gradient definitions */}
                            <defs>
                            <linearGradient id="bellGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#f87171', stopOpacity: 0.85}} />
                              <stop offset="50%" style={{stopColor: '#fb923c', stopOpacity: 0.5}} />
                              <stop offset="100%" style={{stopColor: '#fcd34d', stopOpacity: 0.2}} />
                            </linearGradient>
                            <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#8b5cf6', stopOpacity: 0.8}} />
                              <stop offset="100%" style={{stopColor: '#a78bfa', stopOpacity: 0.5}} />
                            </linearGradient>
                            <linearGradient id="userBarGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#3b82f6', stopOpacity: 0.9}} />
                              <stop offset="100%" style={{stopColor: '#60a5fa', stopOpacity: 0.6}} />
                            </linearGradient>
                            <linearGradient id="bestPlayerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#fbbf24', stopOpacity: 1}} />
                              <stop offset="50%" style={{stopColor: '#f59e0b', stopOpacity: 0.9}} />
                              <stop offset="100%" style={{stopColor: '#d97706', stopOpacity: 0.8}} />
                            </linearGradient>
                            <filter id="bestPlayerGlow">
                              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                              <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                              </feMerge>
                            </filter>
                            <filter id="curveShadow">
                              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3"/>
                            </filter>
                          </defs>

                          {/* Grid lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => (
                            <line
                              key={i}
                              x1={padding}
                              y1={graphHeight - padding - chartHeight * fraction}
                              x2={graphWidth - padding}
                              y2={graphHeight - padding - chartHeight * fraction}
                              stroke="#374151"
                              strokeWidth="1"
                              strokeOpacity="0.5"
                            />
                          ))}

                          {/* Filled normal distribution curve */}
                          <path
                            d={filledPathData}
                            fill="url(#bellGradient)"
                            fillOpacity="0.9"
                            stroke="#fb923c"
                            strokeWidth="0.5"
                            strokeOpacity="0.6"
                          />

                          {/* Standard deviation markers */}
                          {sdMarkers.map((marker, i) => {
                            const x = padding + ((marker.value - minLevel) / range) * chartWidth;
                            const isUserPosition = user && Math.abs(marker.value - (leaderboard.find(e => e.user_id === user.id)?.highest_level || 0)) < 0.5;
                            return (
                              <g key={i}>
                                <line
                                  x1={x}
                                  y1={padding}
                                  x2={x}
                                  y2={graphHeight - padding}
                                  stroke={marker.label === 'μ' ? '#fbbf24' : '#6b7280'}
                                  strokeWidth={marker.label === 'μ' ? '3' : '2'}
                                  strokeDasharray={marker.label === 'μ' ? '0' : '5,5'}
                                  strokeOpacity={marker.label === 'μ' ? '1' : '0.6'}
                                />
                                <text
                                  x={x}
                                  y={graphHeight - padding + 20}
                                  textAnchor="middle"
                                  fill={marker.label === 'μ' ? '#fbbf24' : '#9ca3af'}
                                  fontSize={isMobile ? '10' : '12'}
                                  fontWeight="bold"
                                >
                                  {marker.label}
                                </text>
                                <text
                                  x={x}
                                  y={graphHeight - padding + (isMobile ? 32 : 35)}
                                  textAnchor="middle"
                                  fill="#9ca3af"
                                  fontSize={isMobile ? '8' : '10'}
                                >
                                  L{marker.value.toFixed(1)}
                                </text>
                              </g>
                            );
                          })}

                          {/* Individual player columns */}
                          {sortedPlayers.map((player, index) => {
                            const playerLevel = player.highest_level || 0;
                            if (playerLevel < minLevel || playerLevel > maxLevel) return null;

                            // Calculate x position based on level
                            const x = padding + ((playerLevel - minLevel) / range) * chartWidth;

                            // Calculate column width (VERY thin columns for individual players)
                            // Maximum 4px wide, minimum 1.5px for visibility
                            const columnWidth = Math.min(Math.max(chartWidth / (leaderboard.length * 3), 1.5), 4);

                            // Calculate height based on position (taller for better players)
                            const maxBarHeight = chartHeight * 0.8;
                            const minBarHeight = chartHeight * 0.2;
                            const heightPercentile = (sortedPlayers.length - index) / sortedPlayers.length;
                            const barHeight = minBarHeight + (maxBarHeight - minBarHeight) * heightPercentile;

                            // Determine if this is the best player, current user, or other
                            const isBestPlayer = player.user_id === bestPlayer.user_id;
                            const isCurrentUser = user && player.user_id === user.id;

                            // Offset columns slightly to spread them out at same level
                            const playersAtLevel = sortedPlayers.filter(p => p.highest_level === playerLevel);
                            const indexAtLevel = playersAtLevel.findIndex(p => p.user_id === player.user_id);
                            const offsetX = (indexAtLevel - playersAtLevel.length / 2) * columnWidth * 1.2;

                            return (
                              <g key={player.user_id}>
                                <rect
                                  x={x + offsetX - columnWidth / 2}
                                  y={graphHeight - padding - barHeight}
                                  width={columnWidth}
                                  height={barHeight}
                                  fill={isBestPlayer ? 'url(#bestPlayerGradient)' : (isCurrentUser ? 'url(#userBarGradient)' : 'url(#barGradient)')}
                                  stroke={isBestPlayer ? '#fbbf24' : (isCurrentUser ? '#3b82f6' : '#8b5cf6')}
                                  strokeWidth={isBestPlayer ? '2' : '1'}
                                  filter={isBestPlayer ? 'url(#bestPlayerGlow)' : 'none'}
                                  opacity={isBestPlayer ? 1 : 0.85}
                                />
                                {isBestPlayer && (
                                  <text
                                    x={x + offsetX}
                                    y={graphHeight - padding - barHeight - 5}
                                    textAnchor="middle"
                                    fill="#fbbf24"
                                    fontSize="14"
                                    fontWeight="bold"
                                  >
                                    👑
                                  </text>
                                )}
                              </g>
                            );
                          })}

                          {/* Actual data distribution curve (smoothed histogram) */}
                          <path
                            d={pathData}
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#curveShadow)"
                            style={{vectorEffect: 'non-scaling-stroke'}}
                          />

                          {/* Theoretical normal distribution curve for comparison */}
                          <path
                            d={theoreticalPathData}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="8,4"
                            opacity="0.9"
                            filter="url(#curveShadow)"
                            style={{vectorEffect: 'non-scaling-stroke'}}
                          />

                          {/* Axes */}
                          <line
                            x1={padding}
                            y1={graphHeight - padding}
                            x2={graphWidth - padding}
                            y2={graphHeight - padding}
                            stroke="#9ca3af"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <line
                            x1={padding}
                            y1={padding}
                            x2={padding}
                            y2={graphHeight - padding}
                            stroke="#9ca3af"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />

                          {/* X-axis label */}
                          <text
                            x={graphWidth / 2}
                            y={graphHeight - 5}
                            textAnchor="middle"
                            fill="#9ca3af"
                            fontSize="12"
                          >
                            Level Achieved
                          </text>
                        </svg>
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-4 text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-4 rounded" style={{background: 'linear-gradient(to bottom, rgba(239, 68, 68, 0.7), rgba(251, 191, 36, 0.1))'}}></div>
                          <span className="text-gray-300">Filled Area</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-0.5 bg-red-600 rounded"></div>
                          <span className="text-gray-300">Actual Data</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-0.5 bg-green-500 rounded" style={{backgroundImage: 'repeating-linear-gradient(90deg, #10b981, #10b981 4px, transparent 4px, transparent 8px)'}}></div>
                          <span className="text-gray-300">Normal Curve</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-6 rounded" style={{background: 'linear-gradient(to bottom, #fbbf24, #d97706)', boxShadow: '0 0 8px rgba(251, 191, 36, 0.6)'}}></div>
                          <span className="text-gray-300">👑 Best Player</span>
                        </div>
                        {user && (
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-6 rounded bg-blue-500 opacity-80 border border-blue-400"></div>
                            <span className="text-gray-300">You</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-6 rounded bg-purple-500 opacity-70 border border-purple-400"></div>
                          <span className="text-gray-300">Other Players</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-0.5 bg-yellow-500"></div>
                          <span className="text-gray-300">Mean (μ)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-400"></div>
                          <span className="text-gray-300">±σ</span>
                        </div>
                      </div>
                    </div>

                    {/* Percentile information */}
                    <div className="bg-gray-700 p-4 rounded-lg text-xs text-gray-300">
                      <h4 className="font-bold mb-2 text-center">Standard Deviation Ranges</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>μ ± 1σ: <span className="text-green-400">68.2%</span></div>
                        <div>μ ± 2σ: <span className="text-yellow-400">95.4%</span></div>
                        <div>μ ± 3σ: <span className="text-red-400">99.7%</span></div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBellCurve(false);
                  setShowLeaderboard(true);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                Back to Leaderboard
              </button>
              <button
                onClick={() => setShowBellCurve(false)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Us / Contact Modal */}
      {showAboutUs && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50 gpu-accelerate"
          onClick={() => setShowAboutUs(false)}
        >
          <div
            className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-lg p-6 sm:p-8 max-w-2xl w-full gpu-accelerate"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-4 text-center">About Us</h2>
            <p className="text-gray-200 text-base sm:text-lg leading-relaxed mb-6 text-center">
              We are a team of like-minded people who share the same goal of helping people to increase their intelligence.
            </p>

            <div className="bg-black bg-opacity-30 p-6 rounded-lg space-y-4">
              <h3 className="text-xl font-semibold text-blue-400 text-center">Contact Us</h3>
              <p className="text-gray-300 text-sm sm:text-base text-center">
                Have questions or feedback? We'd love to hear from you!
              </p>
              <div className="flex justify-center">
                <a
                  href="mailto:stimlus44@gmail.com"
                  className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  stimlus44@gmail.com
                </a>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowAboutUs(false)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CognitiveTaskGame;
