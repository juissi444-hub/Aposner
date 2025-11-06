import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const CognitiveTaskGame = () => {
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
        margin: 2px; /* Prevent glow from being cut off */
        transform: scale(1.08); /* Make 1st place noticeably bigger */
        font-size: 1.1em; /* Slightly larger text */
      }
      /* Mobile-specific adjustments */
      @media (max-width: 640px) {
        .first-place-glow {
          margin: 4px; /* Extra margin on mobile to prevent overflow */
          transform: scale(1.06); /* Slightly less scale on mobile */
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
  const gameStateRef = useRef('menu'); // Ref to track current gameState for cleanup
  const [gameState, setGameState] = useState('menu');
  const [mode, setMode] = useState(null); // 'manual' or 'adaptive'
  const [level, setLevel] = useState(1);
  const [savedAdaptiveLevel, setSavedAdaptiveLevel] = useState(1);
  const [highestLevel, setHighestLevel] = useState(1);
  const [selectedRelationTypes, setSelectedRelationTypes] = useState({
    'whole-part': true,
    'antonym': true,
    'same-color': true,
    'followup-numerical': true,
    'physical-numerical': true,
    'meaning': true,
    'same-time': true
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoContinueEnabled, setAutoContinueEnabled] = useState(false);
  const [autoContinueDelay, setAutoContinueDelay] = useState(3); // 1-20 seconds
  const [numTasks, setNumTasks] = useState(20);
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
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);

  const getTimeForLevel = (lvl) => {
    // Levels 1-5: 2000ms down to 1000ms (decreasing by 250ms per level)
    if (lvl <= 5) return 2000 - (lvl - 1) * 250;

    // Levels 6-15: 750ms down to 300ms (decreasing by 50ms per level)
    if (lvl <= 15) {
      return 750 - (lvl - 6) * 50;
    }

    // Levels 16-19: 275ms down to 200ms (decreasing by 25ms per level)
    if (lvl <= 19) {
      return 275 - (lvl - 16) * 25;
    }

    // Levels 20-26: 187.5ms down to 112.5ms (decreasing by 12.5ms per level)
    if (lvl <= 26) {
      return 187.5 - (lvl - 20) * 12.5;
    }

    // Level 27+: Final level at 100ms
    return 100;
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

    console.log('📦 localStorage values:', {
      savedLevel,
      savedHighest,
      savedSound,
      savedAutoContinue,
      savedAutoContinueDelay
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

    console.log('✅ localStorage load complete');
  }, []);

  // Separate effect for authentication
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    console.log('🔄 Auth effect initializing...');
    let mounted = true;

    // Function to restore session with retry logic (for mobile reliability)
    const restoreSession = async (retryCount = 0) => {
      try {
        console.log(`🔍 Attempting to restore session (attempt ${retryCount + 1})...`);
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('❌ Error getting session:', error);
          // Retry up to 3 times with exponential backoff
          if (retryCount < 3 && mounted) {
            const delay = Math.pow(2, retryCount) * 100; // 100ms, 200ms, 400ms
            console.log(`⏱️ Retrying in ${delay}ms...`);
            setTimeout(() => restoreSession(retryCount + 1), delay);
          }
          return;
        }

        if (!mounted) return;

        if (session?.user) {
          console.log('✅ Session restored for user:', session.user.email);
          console.log('✅ User ID:', session.user.id);
          setUser(session.user);
          setShowAuth(false);
          loadUserProgress(session.user.id);
        } else {
          console.log('❌ No active session found');
          setUser(null);
        }
      } catch (error) {
        console.error('❌ Exception restoring session:', error);
        if (retryCount < 3 && mounted) {
          setTimeout(() => restoreSession(retryCount + 1), Math.pow(2, retryCount) * 100);
        }
      }
    };

    // Immediately try to restore session
    restoreSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);

      if (!mounted) return;

      if (event === 'INITIAL_SESSION') {
        console.log('📱 INITIAL_SESSION event - session being restored');
      }

      if (session?.user) {
        console.log('✅ User session active:', session.user.email);
        setUser(session.user);
        setShowAuth(false);
        loadUserProgress(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        setUser(null);
      }
    });

    return () => {
      console.log('🔌 Cleaning up auth effect');
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Only run once on mount

  // Toggle sound setting
  const toggleSound = () => {
    const newSoundState = !soundEnabled;
    setSoundEnabled(newSoundState);
    localStorage.setItem('adaptivePosnerSound', String(newSoundState));
  };

  // Toggle auto-continue setting
  const toggleAutoContinue = () => {
    const newState = !autoContinueEnabled;
    setAutoContinueEnabled(newState);
    localStorage.setItem('adaptivePosnerAutoContinue', String(newState));
  };

  // Update auto-continue delay
  const updateAutoContinueDelay = (delay) => {
    const delayNum = parseInt(delay);
    if (delayNum >= 1 && delayNum <= 20) {
      setAutoContinueDelay(delayNum);
      localStorage.setItem('adaptivePosnerAutoContinueDelay', String(delayNum));
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
          const { error: insertError } = await supabase
            .from('leaderboard')
            .insert([
              {
                user_id: data.user.id,
                username: username,
                highest_level: 0,
                best_score: 0
              }
            ]);
          if (insertError) {
            console.error('❌ Failed to create leaderboard entry:', insertError);
            throw insertError;
          }
          console.log('✅ Leaderboard entry created - starting at level 0');
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

  const handleLogout = async () => {
    if (!isSupabaseConfigured()) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  // Load user progress from Supabase
  const loadUserProgress = useCallback(async (userId) => {
    if (!isSupabaseConfigured()) return;

    try {
      console.log('═'.repeat(80));
      console.log('📥 Loading user progress from server for user:', userId);

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

      // Try to load from leaderboard table (best achievements)
      try {
        const { data: leaderboardData, error: leaderboardError } = await supabase
          .from('leaderboard')
          .select('highest_level, best_score')
          .eq('user_id', userId)
          .single();

        if (leaderboardError && leaderboardError.code !== 'PGRST116') {
          console.warn('⚠️ leaderboard table query failed:', leaderboardError.message);
        } else if (leaderboardData) {
          serverHighestLevel = Math.max(serverHighestLevel, leaderboardData.highest_level || 0);
          serverBestScore = leaderboardData.best_score || 0;
          console.log('📥 Loaded from leaderboard:', { serverHighestLevel, serverBestScore });
        }
      } catch (err) {
        console.warn('⚠️ Error loading leaderboard:', err.message);
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

  // Leaderboard functions with retry logic for mobile reliability
  const loadLeaderboard = useCallback(async (retryCount = 0) => {
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase not configured - cannot load leaderboard');
      if (retryCount === 0) {
        alert('Supabase is not configured. Please check your environment variables.');
      }
      return;
    }

    try {
      console.log('═'.repeat(80));
      console.log(`📊 LOADING LEADERBOARD FROM DATABASE (attempt ${retryCount + 1})...`);
      console.log('📊 User logged in:', !!user, user?.email);
      console.log('📊 User ID:', user?.id);

      // Try with average_answer_time first, fall back if column doesn't exist
      let data, error, count;
      try {
        console.log('📊 Building query: SELECT * FROM leaderboard ORDER BY highest_level DESC, best_score DESC, average_answer_time ASC');
        const result = await supabase
          .from('leaderboard')
          .select('*', { count: 'exact' })
          .order('highest_level', { ascending: false })
          .order('best_score', { ascending: false })
          .order('average_answer_time', { ascending: true, nullsFirst: false });
        data = result.data;
        error = result.error;
        count = result.count;
      } catch (err) {
        // If average_answer_time column doesn't exist, try without it
        console.warn('⚠️ Query with average_answer_time failed, trying without it...');
        const result = await supabase
          .from('leaderboard')
          .select('*', { count: 'exact' })
          .order('highest_level', { ascending: false })
          .order('best_score', { ascending: false });
        data = result.data;
        error = result.error;
        count = result.count;
      }

      console.log('📊 Query executed');
      console.log('📊 Count returned:', count);
      console.log('📊 Data length:', data?.length);

      if (error) {
        console.error('❌ Leaderboard query error:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', error.details);
        console.error('❌ Error hint:', error.hint);
        console.error('❌ RLS may be blocking access - check Supabase policies');

        // Retry up to 3 times with exponential backoff (for mobile reliability)
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 200; // 200ms, 400ms, 800ms
          console.log(`⏱️ Retrying leaderboard load in ${delay}ms...`);
          setTimeout(() => loadLeaderboard(retryCount + 1), delay);
          return;
        }
        throw error;
      }

      console.log('✅ Leaderboard query successful');
      console.log(`✅ Returned ${data?.length || 0} entries from database`);
      console.log('✅ NO LIMIT applied to query - should return ALL users');

      if (!data || data.length === 0) {
        console.warn('⚠️ No leaderboard entries found - check if users have played in Adaptive mode');
      } else {
        console.log('📊 Full leaderboard data from database (ALL ENTRIES):');
        data.forEach((entry, i) => {
          console.log(`   Entry ${i+1}: username=${entry.username}, highest_level=${entry.highest_level}, best_score=${entry.best_score}, user_id=${entry.user_id}`);
        });
        console.log('📊 Complete data (JSON):', JSON.stringify(data, null, 2));
        console.log(`📊 Total entries to display: ${data.length}`);

        // Warning if only a few entries are returned
        if (data.length <= 3) {
          console.warn('⚠️⚠️⚠️ WARNING: Only ' + data.length + ' entries returned!');
          console.warn('⚠️ If you expect more users in the database:');
          console.warn('⚠️ 1. Check Supabase Table Editor to see total row count');
          console.warn('⚠️ 2. Check RLS policies in Supabase (Table → leaderboard → RLS)');
          console.warn('⚠️ 3. Run verify-leaderboard-data.sql in Supabase SQL Editor');
          console.warn('⚠️ 4. Ensure "Allow public read access to leaderboard" policy exists');
        }
      }

      setLeaderboard(data || []);
      console.log(`📊 Leaderboard state updated with ${data?.length || 0} entries`);
      console.log('═'.repeat(80));
    } catch (error) {
      console.error('❌ Error loading leaderboard:', error);
      // Don't show alert on mobile - it blocks the UI
      // Only log to console for debugging
      if (retryCount >= 3) {
        console.error('❌ Failed to load leaderboard after 3 retries');
        console.error('❌ Error:', error.message);
        // Show a non-blocking error state instead of alert
        setLeaderboard([]);
      }
    }
  }, [user]);

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

    console.log(`📝 Saving to leaderboard: Level ${validLevel}, Score ${validScore}`);

    try {
      console.log(`📝 ✅ All checks passed - proceeding with leaderboard update`);
      console.log(`📝 User:`, username);
      console.log(`📝 User ID:`, userId);
      console.log(`📝 Is Anonymous:`, isAnonymous);

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
        is_anonymous: isAnonymous,
        updated_at: new Date().toISOString()
      };

      // Only include average_answer_time if we have valid data
      if (averageAnswerTime !== null) {
        dataToSave.average_answer_time = averageAnswerTime;
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

        // For anonymous users, just log the error but don't block gameplay
        if (!isAnonymous) {
          alert(`Failed to save to leaderboard: ${updateError.message}\n\nCheck browser console for details.`);
          throw updateError;
        } else {
          console.warn('⚠️ Anonymous user save failed - check SQL policies. Anonymous users need proper RLS configuration.');
          console.warn('⚠️ Run the SQL commands provided to enable anonymous user support.');
          // Don't throw for anonymous users - let them continue playing
          return;
        }
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

  // Save user progress to server
  const saveProgressToServer = useCallback(async (currentLevel, currentHighest, currentScore) => {
    if (!isSupabaseConfigured() || !user) {
      console.log('⚠️ Skipping server progress save - not configured or not logged in');
      return;
    }

    try {
      console.log('💾 Saving progress to server:', { currentLevel, currentHighest, currentScore });

      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: user.id,
          current_level: currentLevel,
          highest_level: currentHighest,
          current_score: currentScore,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        console.warn('⚠️ Could not save progress to server (user_progress table may not exist yet):', error.message);
        console.warn('⚠️ Progress is still saved in localStorage');
      } else {
        console.log('✅ Progress saved to server successfully');
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
    console.log(`💾 Percentage this represents: ${Math.round((currentScore / 30) * 100)}%`);

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

  const relationTypes = {
    'whole-part': 'Whole-Part (fish-pike, world-France)',
    'antonym': 'Antonym/Opposite (dark-light, cold-warm)',
    'same-color': 'Same Color (grass-emerald, paper-snow)',
    'followup-numerical': 'Sequential Numbers (3-4, 24-25)',
    'physical-numerical': 'Sequential Number Forms (one-two, II-III, 3-4)',
    'meaning': 'Same Meaning Numbers (2-two, V-5, five-5)',
    'same-time': 'Same Time (🕐-1:00, 3:30-half past three)'
  };

  const wordPairs = {
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
      ['algorithm', 'sorting'], ['algorithm', 'searching'], ['algorithm', 'encryption'], ['algorithm', 'compression'], ['algorithm', 'hashing']
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
      ['dwarf', 'giant'], ['dwell', 'depart'], ['dwindle', 'flourish'], ['dynamic', 'static'], ['eager', 'reluctant']
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
      // Extended Roman numerals (100-500 only)
      ['C', 'CI'], ['CI', 'CII'], ['CII', 'CIII'], ['CX', 'CXI'], ['CXX', 'CXXI'],
      ['CL', 'CLI'], ['CC', 'CCI'], ['CCL', 'CCLI'], ['CCC', 'CCCI'], ['CD', 'CDI'],
      ['D', 'DI'], ['100', '101'], ['150', '151'],
      ['200', '201'], ['250', '251'], ['300', '301'], ['400', '401'], ['450', '451'],
      // Large number sequences
      ['one hundred', 'one hundred one'], ['two hundred', 'two hundred one'],
      ['three hundred', 'three hundred one'], ['four hundred', 'four hundred one'],
      ['five hundred', 'five hundred one']
    ],
    'meaning': [
      // Digit to word
      ['1', 'one'], ['2', 'two'], ['3', 'three'], ['4', 'four'], ['5', 'five'],
      ['6', 'six'], ['7', 'seven'], ['8', 'eight'], ['9', 'nine'], ['10', 'ten'],
      ['11', 'eleven'], ['12', 'twelve'], ['13', 'thirteen'], ['14', 'fourteen'], ['15', 'fifteen'],
      ['16', 'sixteen'], ['17', 'seventeen'], ['18', 'eighteen'], ['19', 'nineteen'], ['20', 'twenty'],
      ['21', 'twenty-one'], ['22', 'twenty-two'], ['23', 'twenty-three'], ['24', 'twenty-four'], ['25', 'twenty-five'],
      ['26', 'twenty-six'], ['27', 'twenty-seven'], ['28', 'twenty-eight'], ['29', 'twenty-nine'], ['30', 'thirty'],
      ['31', 'thirty-one'], ['32', 'thirty-two'], ['33', 'thirty-three'], ['40', 'forty'], ['50', 'fifty'],
      // Word to Roman
      ['one', 'I'], ['two', 'II'], ['three', 'III'], ['four', 'IV'], ['five', 'V'],
      ['six', 'VI'], ['seven', 'VII'], ['eight', 'VIII'], ['nine', 'IX'], ['ten', 'X'],
      ['eleven', 'XI'], ['twelve', 'XII'], ['thirteen', 'XIII'], ['fourteen', 'XIV'], ['fifteen', 'XV'],
      ['sixteen', 'XVI'], ['seventeen', 'XVII'], ['eighteen', 'XVIII'], ['nineteen', 'XIX'], ['twenty', 'XX'],
      ['twenty-one', 'XXI'], ['twenty-two', 'XXII'], ['twenty-three', 'XXIII'], ['twenty-four', 'XXIV'], ['twenty-five', 'XXV'],
      ['twenty-six', 'XXVI'], ['twenty-seven', 'XXVII'], ['twenty-eight', 'XXVIII'], ['twenty-nine', 'XXIX'], ['thirty', 'XXX'],
      // Roman to digit
      ['I', '1'], ['II', '2'], ['III', '3'], ['IV', '4'], ['V', '5'],
      ['VI', '6'], ['VII', '7'], ['VIII', '8'], ['IX', '9'], ['X', '10'],
      ['XI', '11'], ['XII', '12'], ['XIII', '13'], ['XIV', '14'], ['XV', '15'],
      ['XVI', '16'], ['XVII', '17'], ['XVIII', '18'], ['XIX', '19'], ['XX', '20'],
      ['XXI', '21'], ['XXII', '22'], ['XXIII', '23'], ['XXIV', '24'], ['XXV', '25'],
      ['XXVI', '26'], ['XXVII', '27'], ['XXVIII', '28'], ['XXIX', '29'], ['XXX', '30'],
      ['XL', '40'], ['L', '50'], ['LX', '60'], ['LXX', '70'], ['LXXX', '80'], ['XC', '90'], ['C', '100'],
      // More combinations
      ['forty', 'XL'], ['fifty', 'L'], ['sixty', 'LX'], ['seventy', 'LXX'], ['eighty', 'LXXX'],
      ['ninety', 'XC'], ['hundred', 'C'], ['100', 'hundred'], ['60', 'sixty'], ['70', 'seventy'],
      ['80', 'eighty'], ['90', 'ninety'],
      // Extended Roman numerals (100-500)
      ['C', '100'], ['CI', '101'], ['CX', '110'], ['CXX', '120'], ['CL', '150'], ['CC', '200'],
      ['CCL', '250'], ['CCC', '300'], ['CD', '400'], ['D', '500'],
      ['one hundred', 'C'], ['one hundred ten', 'CX'], ['one hundred fifty', 'CL'],
      ['two hundred', 'CC'], ['two hundred fifty', 'CCL'], ['three hundred', 'CCC'],
      ['four hundred', 'CD'], ['five hundred', 'D'],
      ['110', 'one hundred ten'], ['120', 'one hundred twenty'], ['150', 'one hundred fifty'],
      ['200', 'two hundred'], ['250', 'two hundred fifty'], ['300', 'three hundred'],
      ['400', 'four hundred'], ['500', 'five hundred']
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
        ['look', 'gaze'], ['touch', 'feel'], ['smell', 'sniff'], ['taste', 'savor'], ['think', 'ponder']
      ];
      return nonAntonyms[Math.floor(Math.random() * nonAntonyms.length)];
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
        const vals = [500, 400, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['D', 'CD', 'C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
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
        (n) => numberToRoman(n)
      ];

      const num = Math.floor(Math.random() * 498) + 1; // 1-498
      const offset = Math.floor(Math.random() * 3) + 2; // Skip by 2, 3, or 4
      const nextNum = Math.min(num + offset, 500); // Cap at 500

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
        const vals = [500, 400, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        const syms = ['D', 'CD', 'C', 'XC', 'LXXX', 'LXX', 'LX', 'L', 'XL', 'XXX', 'XX', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'];
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
        (n) => numberToRoman(n)
      ];

      let num1 = Math.floor(Math.random() * 500) + 1; // 1-500
      let num2 = Math.floor(Math.random() * 500) + 1; // 1-500
      while (num1 === num2) {
        num2 = Math.floor(Math.random() * 500) + 1;
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
    const pairs = wordPairs[relationType];

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

  const startGame = (selectedMode) => {
    console.log('🎮 Starting new game session');
    setMode(selectedMode);
    if (selectedMode === 'adaptive') {
      setLevel(savedAdaptiveLevel);
      setNumTasks(30);
    }
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
    const relationKeys = Object.keys(relationTypes);

    // In manual mode, filter to only selected relationship types
    let availableRelations = relationKeys;
    if (mode === 'manual') {
      availableRelations = relationKeys.filter(key => selectedRelationTypes[key]);

      // If no relations are selected, fall back to all relations
      if (availableRelations.length === 0) {
        console.warn('⚠️ No relationship types selected, using all types');
        availableRelations = relationKeys;
      }
    }

    const selectedRelation = availableRelations[Math.floor(Math.random() * availableRelations.length)];
    setCurrentRelation(selectedRelation);
    setGameState('showRelation');
    setUserAnswered(false);
  };

  const handleLevelDecrease = useCallback(() => {
    setGameState('levelDown');
    setTimeout(() => {
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
      console.log('🔄 Level decreased - used pairs cleared');
      prepareNextTask();
    }, 2000);
  }, [saveProgress, stopAllSounds, score, level]);

  const handleGameEnd = useCallback(() => {
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
      // EXPLICIT: 90% of 30 = 27. Score >= 27 MUST advance to next level
      const requiredScore = 27; // Hardcoded to ensure 27/30 (90%) always advances
      console.log(`📊 Level completion check: ${score}/${numTasks} = ${percentage.toFixed(1)}%`);
      console.log(`📊 Level up threshold: EXACTLY 27 or more (90%+)`);
      console.log(`📊 Required score: ${requiredScore}`);
      console.log(`📊 Actual score: ${score}`);
      console.log(`📊 Will level up: ${score >= 27}`);

      if (score >= 27) {
        console.log(`✅✅✅ SCORE IS ${score} >= 27 - LEVELING UP NOW!`);
      } else {
        console.log(`❌❌❌ SCORE IS ${score} < 27 - NOT LEVELING UP`);
      }

      // CRITICAL: Score of 27 or more (90%+) MUST progress to next level
      if (score >= 27) {
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
        setTimeout(() => {
          stopAllSounds();
          const currentScore = score;
          setLevel(prev => {
            const newLevel = prev + 1;
            console.log(`✅ Level ${prev} completed with score ${currentScore}/${numTasks}, advancing to level ${newLevel}`);
            // IMPORTANT: Save the NEW level we're advancing to, not the old one
            saveProgress(newLevel, currentScore);
            console.log(`💾 Saved progress: Level ${newLevel} with score ${currentScore}`);
            return newLevel;
          });
          setScore(0);
          setWrongCount(0);
          setCurrentTask(0);
          setTaskHistory([]);
          setUsedPairs(new Set()); // Clear used pairs for new level
          console.log('🔄 New level - used pairs cleared');
          prepareNextTask();
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
      setTimeout(() => {
        setGameState('menu');
      }, 5000);
    }
  }, [mode, score, numTasks, saveProgress, wrongCount, handleLevelDecrease, stopAllSounds, level]);

  const handleSpacePress = useCallback(() => {
    if (gameState === 'showRelation') {
      const willBeActual = Math.random() < 0.5;
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
  }, [gameState, currentRelation, level, currentTask, numTasks, currentWords, userAnswered, handleGameEnd, mode, wrongCount, handleLevelDecrease]);

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
        // Save current progress before returning to menu
        if (mode === 'adaptive' && gameState !== 'results' && gameState !== 'levelUp' && gameState !== 'levelDown' && gameState !== 'perfectScore') {
          console.log(`🔴 ESC PRESSED - Current state:`);
          console.log(`🔴 Mode: ${mode}`);
          console.log(`🔴 Level: ${level}`);
          console.log(`🔴 Score: ${score}`);
          console.log(`🔴 GameState: ${gameState}`);
          console.log(`🔴 This represents: ${Math.round((score / 30) * 100)}% completion`);
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
        if (e.key === 'j') {
          handleResponse(true);
        } else if (e.key === 'f') {
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
    return 'bg-gray-900';
  };

  return (
    <div className={`min-h-screen ${feedback ? getFeedbackColor() : 'bg-gray-900'} text-white flex items-center justify-center p-4 transition-colors duration-200`}>
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
          <p className="text-center text-gray-400 italic text-sm mb-8">
            In memoriam of those 44 unfortunate ones who were brutally exiled from Noetica...
          </p>

          {isSupabaseConfigured() && (
            <div className="bg-gray-800 p-4 rounded-lg flex justify-between items-center">
              {user ? (
                <>
                  <div>
                    <p className="text-sm text-gray-400">Logged in as</p>
                    <p className="font-bold text-green-400">{user.user_metadata?.username || user.email}</p>
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={async () => {
                        console.log('═'.repeat(80));
                        console.log('🎯🎯🎯 LEADERBOARD BUTTON CLICKED 🎯🎯🎯');
                        console.log('📊 Supabase configured:', isSupabaseConfigured());
                        console.log('📊 User:', user?.email);
                        console.log('📊 User ID:', user?.id);
                        console.log('📊 Current showLeaderboard state BEFORE setState:', showLeaderboard);

                        setShowLeaderboard(true);

                        console.log('📊 setShowLeaderboard(true) CALLED');
                        console.log('📊 About to load leaderboard data...');

                        try {
                          await loadLeaderboard();
                          console.log('✅ Leaderboard data loaded successfully');
                        } catch (error) {
                          console.error('❌ Error loading leaderboard:', error);
                        }

                        console.log('═'.repeat(80));
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
                    >
                      Leaderboard
                    </button>
                    <button
                      onClick={handleLogout}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
                    >
                      Logout
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-300">Sign in to track your scores on the leaderboard!</p>
                  <button
                    onClick={() => setShowAuth(true)}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
                  >
                    Login / Sign Up
                  </button>
                </>
              )}
            </div>
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

          <div className="bg-gray-800 p-6 rounded-lg space-y-4">
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

          <div className="bg-gray-800 p-6 rounded-lg space-y-4">
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

          <div className="bg-gray-800 p-6 rounded-lg space-y-4">
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

          <div className="bg-gray-800 p-6 rounded-lg space-y-4">
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
                Adaptive Mode
                {savedAdaptiveLevel > 1 && (
                  <div className="text-sm mt-1 text-yellow-300">Continue from Level {savedAdaptiveLevel}</div>
                )}
              </button>
            </div>
            <div className="text-sm text-gray-400 space-y-2 mt-4">
              <p><strong>Manual Mode:</strong> Choose your own level (1-18) and number of tasks (10-60)</p>
              <p><strong>Adaptive Mode:</strong> Start at level 1, get 90% correct (27/30) to advance. Get 6 wrong and level decreases! Progress is saved automatically.</p>
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold mb-4">Manual Mode Settings</h2>
            <div>
              <label className="block text-sm font-medium mb-2">
                Level: {level} ({getTimeForLevel(level)}ms per task)
              </label>
              <input
                type="range"
                min="1"
                max="18"
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
              <label className="block text-sm font-medium mb-3">
                Relationship Types to Include:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.keys(relationTypes).map(key => (
                  <label key={key} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRelationTypes[key]}
                      onChange={(e) => {
                        setSelectedRelationTypes(prev => ({
                          ...prev,
                          [key]: e.target.checked
                        }));
                      }}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm">{relationTypes[key]}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    const allSelected = {};
                    Object.keys(relationTypes).forEach(key => {
                      allSelected[key] = true;
                    });
                    setSelectedRelationTypes(allSelected);
                  }}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded"
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
                  className="text-xs bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded"
                >
                  Deselect All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === 'showRelation' && !feedback && (
        <div className="text-center space-y-8">
          <div className="text-sm text-gray-400">
            {mode === 'adaptive' && <div className="text-lg font-bold text-yellow-400 mb-2">Level {level}</div>}
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
                // Save progress before returning to menu
                if (mode === 'adaptive') {
                  console.log(`🔴 BACK TO MENU clicked - Current state:`);
                  console.log(`🔴 Mode: ${mode}`);
                  console.log(`🔴 Level: ${level}`);
                  console.log(`🔴 Score: ${score}`);
                  console.log(`🔴 GameState: ${gameState}`);
                  console.log(`🔴 This represents: ${Math.round((score / 30) * 100)}% completion`);
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
            {mode === 'adaptive' && <div className="text-lg font-bold text-yellow-400 mb-2">Level {level}</div>}
            Task {currentTask + 1} / {numTasks}
          </div>
          <div className="text-6xl font-bold space-x-8">
            <span className="text-yellow-400">{currentWords[0]}</span>
            <span className="text-gray-500">-</span>
            <span className="text-yellow-400">{currentWords[1]}</span>
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
            You got 6 incorrect.
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
                onClick={() => setGameState('menu')}
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
                onClick={() => setGameState('menu')}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-8 max-w-5xl w-full max-h-[90vh] flex flex-col">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-center">Leaderboard</h2>
            <p className="text-center text-xs sm:text-sm text-gray-400 mb-1">Adaptive Mode Only</p>
            {leaderboard.length > 0 && (
              <p className="text-center text-xs sm:text-sm text-green-400 mb-3 sm:mb-4">
                Showing all {leaderboard.length} player{leaderboard.length !== 1 ? 's' : ''} • Scroll to see more
              </p>
            )}
            {leaderboard.length === 0 && <div className="mb-3 sm:mb-4"></div>}

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2 px-1">
              <div className="space-y-2">
              {leaderboard.length === 0 ? (
                <p className="text-center text-gray-400">No entries yet. Be the first!</p>
              ) : (
                <>
                  {/* Desktop header - hidden on mobile */}
                  <div className="hidden sm:grid gap-4 font-bold text-sm text-gray-400 px-4 py-2" style={{gridTemplateColumns: '60px 1fr 200px 120px'}}>
                    <div>Rank</div>
                    <div>Username</div>
                    <div>Highest Level</div>
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

                    // Calculate level completion percentage (out of 30 tasks in adaptive mode)
                    const bestScore = entry.best_score || 0;
                    const levelProgress = Math.round((bestScore / 30) * 100);

                    // Detailed logging for debugging
                    console.log(`📊 Leaderboard entry ${index + 1}:`);
                    console.log(`   Username: ${entry.username}`);
                    console.log(`   Highest Level: ${entry.highest_level}`);
                    console.log(`   Best Score (raw from DB): ${entry.best_score}`);
                    console.log(`   Best Score (after ||0): ${bestScore}`);
                    console.log(`   Calculation: ${bestScore}/30 = ${levelProgress}%`);
                    console.log(`   Percentile: ${percentile}th`);

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
                        <div className="hidden sm:grid gap-4 px-4 py-3" style={{gridTemplateColumns: '60px 1fr 200px 120px'}}>
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
                          <div className="font-semibold text-yellow-400 text-right whitespace-nowrap">{percentile}th percentile</div>
                        </div>

                        {/* Mobile layout */}
                        <div className="block sm:hidden px-3 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xl">
                                {index === 0 && '🥇'}
                                {index === 1 && '🥈'}
                                {index === 2 && '🥉'}
                                {index > 2 && `#${index + 1}`}
                              </span>
                              <span className="font-medium text-sm flex items-center gap-1">
                                {entry.is_anonymous && <span title="Anonymous User">🕵️</span>}
                                {entry.username}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-yellow-400">{percentile}th percentile</span>
                          </div>
                          <div className="text-sm font-semibold">
                            <span className="text-white">Level {entry.highest_level}</span>
                            <span className="text-green-400 ml-1">- {levelProgress}%</span>
                          </div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-4 sm:p-8 max-w-5xl w-full max-h-[90vh] flex flex-col">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-center">Player Distribution Analysis</h2>
            <p className="text-center text-sm text-gray-400 mb-6">Normal distribution curve with standard deviation markers (IQ-style)</p>

            {/* Bell curve visualization */}
            <div className="flex-1 overflow-y-auto mb-6">
              {(() => {
                if (leaderboard.length === 0) {
                  return <p className="text-center text-gray-400">No data to display</p>;
                }

                // Calculate mean and standard deviation
                const levels = leaderboard.map(e => e.highest_level || 0);
                const mean = levels.reduce((sum, l) => sum + l, 0) / levels.length;
                const variance = levels.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / levels.length;
                const stdDev = Math.sqrt(variance);

                // Sort players by level and score (best first)
                const sortedPlayers = [...leaderboard].sort((a, b) => {
                  if (b.highest_level !== a.highest_level) return b.highest_level - a.highest_level;
                  return b.best_score - a.best_score;
                });

                const bestPlayer = sortedPlayers[0];

                // Adaptive range - ALWAYS show full bell curve with both tails
                const minDataLevel = Math.min(...levels);
                const maxDataLevel = Math.max(...levels);

                // Calculate theoretical bell curve range (mean ± 3.5 standard deviations for full tails)
                const theoreticalMin = mean - 3.5 * stdDev;
                const theoreticalMax = mean + 3.5 * stdDev;

                // ALWAYS show the FULL theoretical range, not just data range
                // This guarantees both tails are visible
                const minLevel = Math.max(1, Math.floor(theoreticalMin));
                const maxLevel = Math.min(27, Math.ceil(theoreticalMax));
                const range = maxLevel - minLevel;

                // Generate normal distribution curve points
                const normalDistribution = (x, mu, sigma) => {
                  return (1 / (sigma * Math.sqrt(2 * Math.PI))) *
                         Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
                };

                // Make graph wider to show full distribution - always wide enough for full curve
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
                // Wide enough to show full range comfortably - at least 50px per level
                const minGraphWidth = Math.max((range + 1) * 50, isMobile ? 600 : 1200);
                const graphWidth = minGraphWidth;
                const graphHeight = isMobile ? 250 : 350;
                const padding = isMobile ? 30 : 50;
                const chartWidth = graphWidth - 2 * padding;
                const chartHeight = graphHeight - 2 * padding;

                // Generate curve points (more points for smoother curve)
                const curvePoints = [];
                const step = range / 200; // More points for smoother curve
                for (let x = minLevel; x <= maxLevel; x += step) {
                  const y = normalDistribution(x, mean, stdDev);
                  curvePoints.push({ x, y });
                }

                // Normalize curve to graph height
                const maxY = Math.max(...curvePoints.map(p => p.y));
                const scaledPoints = curvePoints.map(p => {
                  const scaledX = padding + ((p.x - minLevel) / range) * chartWidth;
                  const scaledY = graphHeight - padding - (p.y / maxY) * chartHeight;
                  return { x: scaledX, y: scaledY };
                });

                // Create SVG path for curve outline
                const pathData = scaledPoints.map((p, i) =>
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
                        <div className="text-xl sm:text-2xl font-bold text-purple-400">{maxLevel}</div>
                        <div className="text-xs sm:text-sm text-gray-400">Highest Level Reached</div>
                      </div>
                    </div>

                    {/* Normal Distribution Graph */}
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="text-center text-lg font-bold mb-4">Normal Distribution Curve</h3>
                      <div className="overflow-x-auto overflow-y-hidden pb-4">
                        <div className="flex justify-center" style={{minWidth: '100%'}}>
                          <svg width={graphWidth} height={graphHeight} className="overflow-visible">
                            {/* Gradient definitions */}
                            <defs>
                            <linearGradient id="bellGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{stopColor: '#ef4444', stopOpacity: 0.7}} />
                              <stop offset="50%" style={{stopColor: '#f97316', stopOpacity: 0.4}} />
                              <stop offset="100%" style={{stopColor: '#fbbf24', stopOpacity: 0.1}} />
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
                            fillOpacity="0.8"
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

                          {/* Normal distribution curve outline */}
                          <path
                            d={pathData}
                            fill="none"
                            stroke="#dc2626"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Axes */}
                          <line
                            x1={padding}
                            y1={graphHeight - padding}
                            x2={graphWidth - padding}
                            y2={graphHeight - padding}
                            stroke="#9ca3af"
                            strokeWidth="2"
                          />
                          <line
                            x1={padding}
                            y1={padding}
                            x2={padding}
                            y2={graphHeight - padding}
                            stroke="#9ca3af"
                            strokeWidth="2"
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
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-4 text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-4 rounded" style={{background: 'linear-gradient(to bottom, rgba(239, 68, 68, 0.7), rgba(251, 191, 36, 0.1))'}}></div>
                          <span className="text-gray-300">Bell Curve</span>
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
    </div>
  );
};

export default CognitiveTaskGame;
