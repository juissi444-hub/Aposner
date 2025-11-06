import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const CognitiveTaskGame = () => {
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

  // Authentication and leaderboard states
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);

  const getTimeForLevel = (lvl) => {
    if (lvl >= 15) return Math.max(50, 150 - (lvl - 14) * 25);
    if (lvl >= 10) return 350 - (lvl - 10) * 50;
    if (lvl >= 8) return 500 - (lvl - 7) * 50;
    return 2000 - (lvl - 1) * 250;
  };

  // Keep gameStateRef in sync with gameState
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Load progress from localStorage on mount
  useEffect(() => {
    const savedLevel = localStorage.getItem('adaptivePosnerLevel');
    const savedHighest = localStorage.getItem('adaptivePosnerHighest');
    const savedSound = localStorage.getItem('adaptivePosnerSound');
    const savedAutoContinue = localStorage.getItem('adaptivePosnerAutoContinue');
    const savedAutoContinueDelay = localStorage.getItem('adaptivePosnerAutoContinueDelay');

    if (savedLevel) {
      const levelNum = parseInt(savedLevel);
      // Ensure level is at least 1
      if (levelNum <= 0) {
        console.warn('⚠️ Invalid saved level detected:', levelNum, '- resetting to 1');
        localStorage.setItem('adaptivePosnerLevel', '1');
        setSavedAdaptiveLevel(1);
        setLevel(1);
      } else {
        setSavedAdaptiveLevel(levelNum);
        setLevel(levelNum);
      }
    }

    if (savedHighest) {
      const highestNum = parseInt(savedHighest);
      // Ensure highest is at least 1
      if (highestNum <= 0) {
        console.warn('⚠️ Invalid saved highest level detected:', highestNum, '- resetting to 1');
        localStorage.setItem('adaptivePosnerHighest', '1');
        setHighestLevel(1);
      } else {
        setHighestLevel(highestNum);
      }
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
  }, []);

  // Separate effect for authentication
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    console.log('🔄 Auth effect initializing...');

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔍 Checking for existing session...');
      if (session?.user) {
        console.log('✅ Session found for user:', session.user.email);
        console.log('✅ User ID:', session.user.id);
        console.log('✅ User metadata:', session.user.user_metadata);
        setUser(session.user);
        setShowAuth(false);
        // Load user progress from Supabase
        loadUserProgress(session.user.id);
      } else {
        console.log('❌ No active session found');
        setUser(null);
        // If in adaptive mode and no session, prompt for login
        if (mode === 'adaptive') {
          console.log('🔐 Adaptive mode requires login - showing auth modal');
          setShowAuth(true);
        }
      }
    }).catch(error => {
      console.error('❌ Error getting session:', error);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      console.log('🔄 Session:', session);
      setUser(session?.user || null);
      if (session?.user) {
        console.log('✅ User logged in:', session.user.email);
        setShowAuth(false);
        loadUserProgress(session.user.id);
      } else {
        console.log('❌ User logged out');
        // If in adaptive mode, show auth modal
        if (mode === 'adaptive') {
          setShowAuth(true);
        }
      }
    });

    return () => {
      console.log('🔌 Unsubscribing from auth changes');
      subscription.unsubscribe();
    };
  }, []); // Remove mode dependency to prevent re-initialization

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
      console.log('Loading user progress for user:', userId);
      const { data, error } = await supabase
        .from('leaderboard')
        .select('highest_level, best_score')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user progress:', error);
        throw error;
      }

      if (data) {
        // Merge with localStorage - use the higher value for level
        const localLevel = parseInt(localStorage.getItem('adaptivePosnerLevel') || '1');
        const supabaseLevel = data.highest_level || 1;
        const maxLevel = Math.max(localLevel, supabaseLevel);

        // For best_score, also merge with localStorage
        const localBestScore = parseInt(localStorage.getItem('adaptivePosnerBestScore') || '0');
        const supabaseBestScore = data.best_score || 0;
        const maxBestScore = Math.max(localBestScore, supabaseBestScore);

        // Update both localStorage and state
        localStorage.setItem('adaptivePosnerLevel', String(maxLevel));
        localStorage.setItem('adaptivePosnerHighest', String(maxLevel));
        localStorage.setItem('adaptivePosnerBestScore', String(maxBestScore));
        setSavedAdaptiveLevel(maxLevel);
        setHighestLevel(maxLevel);
        setLevel(maxLevel);

        console.log(`✅ Loaded progress: Level (Local=${localLevel}, Supabase=${supabaseLevel}, Using=${maxLevel}), Score (Local=${localBestScore}, Supabase=${supabaseBestScore}, Using=${maxBestScore})`);
      } else {
        console.log('No progress data found for user, using defaults');
      }
    } catch (error) {
      console.error('Error loading user progress:', error);
    }
  }, []);

  // Leaderboard functions
  const loadLeaderboard = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase not configured - cannot load leaderboard');
      alert('Supabase is not configured. Please check your environment variables.');
      return;
    }

    try {
      console.log('═'.repeat(80));
      console.log('📊 LOADING LEADERBOARD FROM DATABASE...');
      console.log('📊 User logged in:', !!user, user?.email);
      console.log('📊 User ID:', user?.id);
      console.log('📊 Building query: SELECT * FROM leaderboard ORDER BY highest_level DESC, best_score DESC');

      const { data, error, count } = await supabase
        .from('leaderboard')
        .select('*', { count: 'exact' })
        .order('highest_level', { ascending: false })
        .order('best_score', { ascending: false });

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
      alert(`Failed to load leaderboard: ${error.message}\n\nCheck browser console for details.`);
    }
  }, [user]);

  const updateLeaderboard = useCallback(async (newLevel, newScore) => {
    console.log('═'.repeat(80));
    console.log('🔥🔥🔥 updateLeaderboard CALLED 🔥🔥🔥');
    console.log('🔥 newLevel:', newLevel);
    console.log('🔥 newScore:', newScore);
    console.log('🔥 isSupabaseConfigured():', isSupabaseConfigured());
    console.log('🔥 user:', user?.email);
    console.log('🔥 mode:', mode);

    if (!isSupabaseConfigured()) {
      console.error('❌ BLOCKED: Supabase not configured');
      alert('ERROR: Supabase is not configured. Check your .env file.');
      return;
    }

    if (!user) {
      console.error('❌ BLOCKED: No user logged in');
      alert('ERROR: You must be logged in to save to leaderboard. Please log in and try again.');
      return;
    }

    if (mode !== 'adaptive') {
      console.log('⚠️ BLOCKED: Not in adaptive mode (current mode:', mode, ')');
      return;
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
      console.log(`📝 User:`, user.user_metadata?.username || user.email);
      console.log(`📝 User ID:`, user.id);

      // Get current leaderboard entry
      const { data: currentData, error: fetchError } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', user.id)
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

      const dataToSave = {
        user_id: user.id,
        username: user.user_metadata?.username || user.email,
        highest_level: highestLevel,
        best_score: bestScore,
        updated_at: new Date().toISOString()
      };

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
        alert(`FAILED TO SAVE TO LEADERBOARD!\n\nError: ${updateError.message}\nCode: ${updateError.code}\n\nCheck RLS policies in Supabase!`);
        throw updateError;
      }

      console.log(`✅ Leaderboard updated successfully!`);
      console.log(`✅ Data saved to database:`, upsertData);
      console.log(`✅ SUCCESS: Entry saved with level ${highestLevel} and score ${bestScore}`);

      // Verify the save by querying back
      const { data: verifyData } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', user.id)
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
      alert(`CRITICAL ERROR: Failed to save to leaderboard!\n\n${error.message}\n\nCheck browser console for details.`);
    }
  }, [user, mode]);

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

    localStorage.setItem('adaptivePosnerLevel', String(newLevel));
    setSavedAdaptiveLevel(newLevel);

    // Update highest level if needed
    if (newLevel > highestLevel) {
      localStorage.setItem('adaptivePosnerHighest', String(newLevel));
      setHighestLevel(newLevel);
      console.log(`📈 New highest level: ${newLevel}`);
    }

    // Save best score to localStorage
    const currentBestScore = parseInt(localStorage.getItem('adaptivePosnerBestScore') || '0');
    if (currentScore > currentBestScore) {
      localStorage.setItem('adaptivePosnerBestScore', String(currentScore));
      console.log(`🎯 New best score saved: ${currentScore} (previous: ${currentBestScore})`);
    }

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

      updateLeaderboard(newLevel, currentScore);
    } else {
      console.log(`⚠️ Not calling updateLeaderboard - mode is ${mode}, not adaptive`);
    }
    console.log('═'.repeat(80));
  }, [highestLevel, mode, updateLeaderboard, user]);

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
    'physical-numerical': 'Number Forms (seven-two, XI-V, 7-4)',
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
      ['bedroom item', 'bed'], ['bedroom item', 'pillow'], ['bedroom item', 'blanket'], ['bedroom item', 'dresser'], ['bedroom item', 'closet']
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
      ['broad', 'narrow'], ['brutal', 'gentle'], ['bulky', 'compact'], ['burden', 'blessing'], ['busy', 'idle']
    ],
    'same-color': [
      ['sky', 'ocean'], ['grass', 'leaf'], ['sun', 'banana'], ['snow', 'cloud'], ['coal', 'night'],
      ['blood', 'rose'], ['orange', 'carrot'], ['grape', 'plum'], ['lime', 'mint'], ['cherry', 'tomato'],
      ['lemon', 'butter'], ['blueberry', 'sapphire'], ['strawberry', 'fire'], ['plum', 'eggplant'], ['pumpkin', 'tiger'],
      ['emerald', 'fern'], ['pearl', 'milk'], ['onyx', 'raven'], ['ruby', 'wine'], ['amber', 'honey'],
      ['turquoise', 'sea'], ['coral', 'salmon'], ['ivory', 'cream'], ['silver', 'moon'], ['gold', 'wheat'],
      ['bronze', 'penny'], ['charcoal', 'ash'], ['smoke', 'fog'], ['sand', 'beach'], ['rust', 'brick'],
      ['chocolate', 'dirt'], ['vanilla', 'paper'], ['caramel', 'tan'], ['mint', 'jade'], ['rose', 'flamingo'],
      ['lilac', 'violet'], ['indigo', 'navy'], ['cyan', 'aqua'], ['magenta', 'fuchsia'], ['scarlet', 'crimson'],
      ['olive', 'khaki'], ['maroon', 'burgundy'], ['teal', 'peacock'], ['mustard', 'dandelion'], ['sage', 'moss'],
      ['mauve', 'orchid'], ['taupe', 'mushroom'], ['sienna', 'terracotta'], ['cobalt', 'azure'], ['jade', 'viridian'],
      ['peach', 'apricot'], ['cream', 'eggshell'], ['ebony', 'jet'], ['frost', 'ice'], ['storm', 'slate'],
      // Additional same-color pairs
      ['forest', 'pine'], ['lavender', 'amethyst'], ['sunflower', 'gold'], ['tangerine', 'pumpkin'], ['lime', 'emerald'],
      ['berry', 'wine'], ['clay', 'brick'], ['dolphin', 'sky'], ['raven', 'coal'], ['wheat', 'straw'],
      ['copper', 'autumn'], ['mint', 'lime'], ['violet', 'lilac'], ['sapphire', 'ocean'], ['charcoal', 'smoke'],
      ['cherry', 'ruby'], ['peach', 'sunset'], ['lemon', 'sunflower'], ['plum', 'grape'], ['lime', 'frog'],
      ['graphite', 'storm'], ['cotton', 'snow'], ['caramel', 'bronze'], ['honey', 'gold'], ['salmon', 'coral'],
      ['forest', 'jade'], ['eggplant', 'plum'], ['burgundy', 'wine'], ['navy', 'midnight'], ['crimson', 'blood'],
      ['ivory', 'bone'], ['chocolate', 'coffee'], ['vanilla', 'cream'], ['strawberry', 'lipstick'], ['banana', 'canary'],
      ['blueberry', 'navy'], ['orange', 'sunset'], ['grape', 'amethyst'], ['kiwi', 'lime'], ['watermelon', 'pink'],
      ['avocado', 'olive'], ['mango', 'yellow'], ['papaya', 'orange'], ['coconut', 'white'], ['fig', 'purple']
    ],
    'followup-numerical': Array.from({length: 200}, (_, i) => [String(i), String(i + 1)]),
    'physical-numerical': [
      ['one', 'two'], ['two', 'three'], ['three', 'four'], ['four', 'five'], ['five', 'six'],
      ['six', 'seven'], ['seven', 'eight'], ['eight', 'nine'], ['nine', 'ten'], ['ten', 'eleven'],
      ['I', 'II'], ['II', 'III'], ['III', 'IV'], ['IV', 'V'], ['V', 'VI'],
      ['VI', 'VII'], ['VII', 'VIII'], ['VIII', 'IX'], ['IX', 'X'], ['X', 'XI'],
      ['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['5', '6'],
      ['6', '7'], ['7', '8'], ['8', '9'], ['9', '10'], ['10', '11'],
      ['eleven', 'twelve'], ['twelve', 'thirteen'], ['thirteen', 'fourteen'], ['fourteen', 'fifteen'], ['fifteen', 'sixteen'],
      ['XI', 'XII'], ['XII', 'XIII'], ['XIII', 'XIV'], ['XIV', 'XV'], ['XV', 'XVI'],
      ['11', '12'], ['12', '13'], ['13', '14'], ['14', '15'], ['15', '16'],
      ['sixteen', 'seventeen'], ['seventeen', 'eighteen'], ['eighteen', 'nineteen'], ['nineteen', 'twenty'], ['twenty', 'twenty-one'],
      ['XVI', 'XVII'], ['XVII', 'XVIII'], ['XVIII', 'XIX'], ['XIX', 'XX'], ['XX', 'XXI'],
      ['16', '17'], ['17', '18'], ['18', '19'], ['19', '20'], ['20', '21']
    ],
    'meaning': [
      ['1', 'one'], ['2', 'two'], ['3', 'three'], ['4', 'four'], ['5', 'five'],
      ['6', 'six'], ['7', 'seven'], ['8', 'eight'], ['9', 'nine'], ['10', 'ten'],
      ['one', 'I'], ['two', 'II'], ['three', 'III'], ['four', 'IV'], ['five', 'V'],
      ['six', 'VI'], ['seven', 'VII'], ['eight', 'VIII'], ['nine', 'IX'], ['ten', 'X'],
      ['I', '1'], ['II', '2'], ['III', '3'], ['IV', '4'], ['V', '5'],
      ['VI', '6'], ['VII', '7'], ['VIII', '8'], ['IX', '9'], ['X', '10'],
      ['11', 'eleven'], ['12', 'twelve'], ['13', 'thirteen'], ['14', 'fourteen'], ['15', 'fifteen'],
      ['16', 'sixteen'], ['17', 'seventeen'], ['18', 'eighteen'], ['19', 'nineteen'], ['20', 'twenty'],
      ['eleven', 'XI'], ['twelve', 'XII'], ['thirteen', 'XIII'], ['fourteen', 'XIV'], ['fifteen', 'XV'],
      ['XVI', '16'], ['XVII', '17'], ['XVIII', '18'], ['XIX', '19'], ['XX', '20'],
      ['21', 'twenty-one'], ['22', 'twenty-two'], ['23', 'twenty-three'], ['24', 'twenty-four'], ['25', 'twenty-five'],
      ['thirty', 'XXX'], ['forty', 'XL'], ['fifty', 'L'], ['XXV', '25'], ['XXVI', '26']
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
      ['1:45', 'quarter to two'], ['2:45', 'quarter to three'], ['3:45', 'quarter to four'], ['4:45', 'quarter to five'],
      ['5:45', 'quarter to six'], ['6:45', 'quarter to seven'], ['7:45', 'quarter to eight'], ['8:45', 'quarter to nine']
    ]
  };

  // Generate lookalike non-matching pairs for each relationship type
  const generateLookalike = (relationType) => {
    if (relationType === 'whole-part') {
      // For whole-part, use unrelated category-item pairs
      const categories = ['animal', 'tree', 'fish', 'bird', 'flower', 'vehicle', 'fruit', 'furniture', 'building', 'color'];
      const items = ['hammer', 'ocean', 'shirt', 'winter', 'jazz', 'sword', 'oil', 'painting', 'Buddhism', 'valley'];
      return [categories[Math.floor(Math.random() * categories.length)],
              items[Math.floor(Math.random() * items.length)]];
    } else if (relationType === 'antonym') {
      // For antonyms, use words that are related but not opposites
      const nonAntonyms = [
        ['hot', 'warm'], ['big', 'huge'], ['fast', 'quick'], ['light', 'bright'], ['happy', 'joyful'],
        ['cold', 'cool'], ['small', 'tiny'], ['slow', 'gradual'], ['dark', 'dim'], ['sad', 'unhappy'],
        ['strong', 'powerful'], ['loud', 'noisy'], ['soft', 'gentle'], ['clean', 'pure'], ['wet', 'damp']
      ];
      return nonAntonyms[Math.floor(Math.random() * nonAntonyms.length)];
    } else if (relationType === 'same-color') {
      // For same-color, use items with different colors
      const differentColors = [
        ['sky', 'grass'], ['sun', 'ocean'], ['snow', 'coal'], ['blood', 'sky'], ['lemon', 'grape'],
        ['orange', 'blueberry'], ['cherry', 'lime'], ['emerald', 'ruby'], ['pearl', 'coal'], ['gold', 'silver'],
        ['chocolate', 'vanilla'], ['rose', 'violet'], ['peach', 'mint'], ['coral', 'jade'], ['amber', 'sapphire']
      ];
      return differentColors[Math.floor(Math.random() * differentColors.length)];
    } else if (relationType === 'followup-numerical') {
      // For sequential, use numbers that are NOT sequential
      const num1 = Math.floor(Math.random() * 95);
      let num2 = Math.floor(Math.random() * 95);
      while (num2 === num1 + 1 || num2 === num1 - 1 || num2 === num1) {
        num2 = Math.floor(Math.random() * 95);
      }
      return [String(num1), String(num2)];
    } else if (relationType === 'physical-numerical') {
      // For physical numerical, use sequential numbers in different forms (looks similar but wrong)
      const formats = [
        (n) => String(n),
        (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
                'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
                'nineteen', 'twenty'][n] || String(n),
        (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'][n] || String(n)
      ];

      const num = Math.floor(Math.random() * 18) + 1;
      const offset = Math.random() < 0.5 ? 2 : 3; // Skip by 2 or 3
      const nextNum = num + offset;

      const format1 = formats[Math.floor(Math.random() * formats.length)];
      const format2 = formats[Math.floor(Math.random() * formats.length)];

      return [format1(num), format2(nextNum)];
    } else if (relationType === 'meaning') {
      // For meaning, use different numbers in different forms
      const formats = [
        (n) => String(n),
        (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
                'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
                'nineteen', 'twenty'][n] || String(n),
        (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'][n] || String(n)
      ];

      let num1 = Math.floor(Math.random() * 18) + 1;
      let num2 = Math.floor(Math.random() * 18) + 1;
      while (num1 === num2) {
        num2 = Math.floor(Math.random() * 18) + 1;
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

      // Pick two different time indices
      let idx1 = Math.floor(Math.random() * 12);
      let idx2 = Math.floor(Math.random() * 12);
      while (idx1 === idx2) {
        idx2 = Math.floor(Math.random() * 12);
      }

      // Randomly pick formats for both sides
      const allFormats = [
        [...clocks, ...clocksHalf],
        [...digitalHours, ...digitalHalf],
        [...verbalHours, ...verbalHalf]
      ];

      const format1Type = Math.floor(Math.random() * 3);
      const format2Type = Math.floor(Math.random() * 3);

      return [allFormats[format1Type][Math.floor(Math.random() * allFormats[format1Type].length)],
              allFormats[format2Type][Math.floor(Math.random() * allFormats[format2Type].length)]];
    }

    return ['error', 'error'];
  };

  const getRandomPair = (relationType) => {
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
    console.log('🔄 Used pairs cleared - all words/numbers available again');
    prepareNextTask();
  };

  const prepareNextTask = () => {
    const relationKeys = Object.keys(relationTypes);
    const selectedRelation = relationKeys[Math.floor(Math.random() * relationKeys.length)];
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
      console.log(`📊 Level completion check: ${score}/${numTasks} = ${percentage.toFixed(1)}%`);
      console.log(`📊 Level up threshold: 90% (27/30 or better)`);
      console.log(`📊 Calculation: ${score} / ${numTasks} * 100 = ${percentage}`);
      console.log(`📊 Is ${percentage} >= 90? ${percentage >= 90}`);

      if (score >= 27) {
        console.log(`✅✅✅ SCORE IS ${score} >= 27 - SHOULD LEVEL UP!`);
      } else {
        console.log(`❌❌❌ SCORE IS ${score} < 27 - CANNOT LEVEL UP`);
      }

      if (percentage >= 90) {
        console.log(`✅ LEVEL UP! Score ${score}/${numTasks} (${percentage.toFixed(1)}%) >= 90%`);
        // Check if perfect score (100%)
        if (score === numTasks) {
          console.log(`🎉 Perfect score! 30/30 = 100%`);
          setGameState('perfectScore');
        } else {
          console.log(`⬆️ Level up! Score ${score}/${numTasks} >= 27/30`);
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

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set timeout for no answer
      timeoutRef.current = setTimeout(() => {
        if (!userAnswered) {
          // Timeout - no answer given
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
  }, [gameState, isActualRelation, currentTask, numTasks, currentRelation, currentWords, userAnswered, handleGameEnd, mode, wrongCount, handleLevelDecrease, soundEnabled]);

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
      } else if (gameState === 'showWords' && !userAnswered) {
        if (e.key === 'j') {
          handleResponse(true);
        } else if (e.key === 'f') {
          handleResponse(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameState, handleSpacePress, handleResponse, userAnswered, stopAllSounds, saveProgress, level, score, mode]);

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
            <div className="bg-gradient-to-r from-blue-800 to-purple-800 p-6 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-yellow-400">Saved Progress</h2>
                  <p className="text-lg text-white mt-2">Current Level: <span className="font-bold text-green-400">{savedAdaptiveLevel}</span></p>
                  <p className="text-sm text-gray-300">Highest Level Reached: <span className="font-bold">{highestLevel}</span></p>
                </div>
                <button
                  onClick={resetProgress}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm"
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
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
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
                        className={`rounded-lg ${rankStyle}`}
                      >
                        {/* Desktop layout */}
                        <div className="hidden sm:grid gap-4 px-4 py-3" style={{gridTemplateColumns: '60px 1fr 200px 120px'}}>
                          <div className="font-bold text-lg">
                            {index === 0 && '🥇'}
                            {index === 1 && '🥈'}
                            {index === 2 && '🥉'}
                            {index > 2 && `#${index + 1}`}
                          </div>
                          <div className="truncate font-medium">{entry.username}</div>
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
                              <span className="font-medium text-sm">{entry.username}</span>
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

            {/* Close button - fixed at bottom */}
            <button
              onClick={() => setShowLeaderboard(false)}
              className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg flex-shrink-0"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CognitiveTaskGame;
