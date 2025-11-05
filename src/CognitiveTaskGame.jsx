import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play } from 'lucide-react';

const CognitiveTaskGame = () => {
  const celebrationAudioRef = useRef(null);
  const correctAudioRef = useRef(null);
  const incorrectAudioRef = useRef(null);
  const timeoutRef = useRef(null);
  const [gameState, setGameState] = useState('menu');
  const [mode, setMode] = useState(null); // 'manual' or 'adaptive'
  const [level, setLevel] = useState(1);
  const [savedAdaptiveLevel, setSavedAdaptiveLevel] = useState(1);
  const [highestLevel, setHighestLevel] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
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

  const getTimeForLevel = (lvl) => {
    if (lvl >= 10) return Math.max(100, 350 - (lvl - 10) * 50);
    if (lvl >= 8) return 500 - (lvl - 7) * 50;
    return 2000 - (lvl - 1) * 250;
  };

  // Load progress from localStorage on mount
  useEffect(() => {
    const savedLevel = localStorage.getItem('adaptivePosnerLevel');
    const savedHighest = localStorage.getItem('adaptivePosnerHighest');
    const savedSound = localStorage.getItem('adaptivePosnerSound');

    if (savedLevel) {
      const levelNum = parseInt(savedLevel);
      setSavedAdaptiveLevel(levelNum);
      setLevel(levelNum);
    }

    if (savedHighest) {
      setHighestLevel(parseInt(savedHighest));
    }

    if (savedSound !== null) {
      setSoundEnabled(savedSound === 'true');
    }
  }, []);

  // Toggle sound setting
  const toggleSound = () => {
    const newSoundState = !soundEnabled;
    setSoundEnabled(newSoundState);
    localStorage.setItem('adaptivePosnerSound', String(newSoundState));
  };

  // Play celebration sound on perfect score
  useEffect(() => {
    if (gameState === 'perfectScore' && soundEnabled && celebrationAudioRef.current) {
      celebrationAudioRef.current.play().catch(error => {
        console.log('Audio playback failed:', error);
      });
    }
  }, [gameState, soundEnabled]);

  // Save progress to localStorage
  const saveProgress = useCallback((newLevel) => {
    localStorage.setItem('adaptivePosnerLevel', String(newLevel));
    setSavedAdaptiveLevel(newLevel);

    // Update highest level if needed
    if (newLevel > highestLevel) {
      localStorage.setItem('adaptivePosnerHighest', String(newLevel));
      setHighestLevel(newLevel);
    }
  }, [highestLevel]);

  // Reset progress
  const resetProgress = () => {
    localStorage.removeItem('adaptivePosnerLevel');
    localStorage.removeItem('adaptivePosnerHighest');
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
      ['material', 'wood'], ['fabric', 'cotton'], ['shape', 'circle'], ['number', 'seven'], ['letter', 'A']
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
      ['wild', 'tame'], ['raw', 'cooked'], ['alive', 'dead'], ['birth', 'death'], ['create', 'destroy']
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
      ['peach', 'apricot'], ['cream', 'eggshell'], ['ebony', 'jet'], ['frost', 'ice'], ['storm', 'slate']
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
    return pairs[Math.floor(Math.random() * pairs.length)];
  };

  const startGame = (selectedMode) => {
    setMode(selectedMode);
    if (selectedMode === 'adaptive') {
      setLevel(savedAdaptiveLevel);
      setNumTasks(30);
    }
    setScore(0);
    setWrongCount(0);
    setCurrentTask(0);
    setTaskHistory([]);
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
      setLevel(prev => {
        const newLevel = Math.max(1, prev - 1);
        saveProgress(newLevel);
        return newLevel;
      });
      setScore(0);
      setWrongCount(0);
      setCurrentTask(0);
      setTaskHistory([]);
      prepareNextTask();
    }, 2000);
  }, [saveProgress]);

  const handleGameEnd = useCallback(() => {
    if (mode === 'adaptive') {
      // Check if 6 or more mistakes were made
      if (wrongCount >= 6) {
        handleLevelDecrease();
        return;
      }

      const percentage = (score / numTasks) * 100;
      if (percentage >= 90) {
        // Check if perfect score (100%)
        if (score === numTasks) {
          setGameState('perfectScore');
        } else {
          setGameState('levelUp');
        }
        // Progress to next level
        setTimeout(() => {
          setLevel(prev => {
            const newLevel = prev + 1;
            saveProgress(newLevel);
            return newLevel;
          });
          setScore(0);
          setWrongCount(0);
          setCurrentTask(0);
          setTaskHistory([]);
          prepareNextTask();
        }, 3000);
      } else {
        // Failed to progress
        setGameState('results');
      }
    } else {
      // Manual mode - just show results
      setGameState('results');
      setTimeout(() => {
        setGameState('menu');
      }, 5000);
    }
  }, [mode, score, numTasks, saveProgress, wrongCount, handleLevelDecrease]);

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
      setScore(prev => prev + 1);
    } else {
      // Track wrong count in adaptive mode
      if (mode === 'adaptive') {
        setWrongCount(prev => prev + 1);
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

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape' && gameState !== 'menu') {
        e.preventDefault();
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
  }, [gameState, handleSpacePress, handleResponse, userAnswered]);

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

      {gameState === 'menu' && (
        <div className="max-w-2xl w-full space-y-6">
          <h1 className="text-4xl font-bold text-center mb-8">Adaptive Posner</h1>

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
            <h2 className="text-2xl font-semibold mb-4">How to Play</h2>
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
              <p><strong>Manual Mode:</strong> Choose your own level (1-20) and number of tasks (10-60)</p>
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
                max="20"
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
          <button
            onClick={handleSpacePress}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 px-12 rounded-lg text-2xl active:bg-green-800 touch-manipulation"
          >
            Continue
          </button>
          <button
            onClick={() => setGameState('menu')}
            className="mt-4 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-lg"
          >
            Back to main menu
          </button>
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
            onClick={() => setGameState('menu')}
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
            6 Wrong Answers
          </div>
          <div className="text-2xl text-gray-400">
            Level {level} → Level {Math.max(1, level - 1)}
          </div>
          <div className="text-xl text-yellow-400">
            {level > 1 ? 'Decreasing difficulty...' : 'Restarting at Level 1...'}
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
    </div>
  );
};

export default CognitiveTaskGame;
