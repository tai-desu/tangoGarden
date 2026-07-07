/**
 * storage.js
 * ----------
 * Local data layer for 単語 (Tango). localStorage only for now;
 * loadData/saveData remain the seam for GitHub sync later.
 */

const STORAGE_KEY = 'tango_words_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { words: [], lastUpdated: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.words)) return { words: [], lastUpdated: null };
    parsed.words.forEach(w => {
      if (!Array.isArray(w.tags)) w.tags = [];
      if (typeof w.example !== 'string') w.example = '';
    });
    return parsed;
  } catch (e) {
    console.error('storage: failed to load, starting fresh', e);
    return { words: [], lastUpdated: null };
  }
}

function saveData(data) {
  data.lastUpdated = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (typeof scheduleAutoPush === 'function') scheduleAutoPush();
    return true;
  } catch (e) {
    console.error('storage: failed to save', e);
    return false;
  }
}

function makeId() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function addWord({ word, reading, partOfSpeech, tags, example }) {
  const data = loadData();
  const today = new Date().toISOString().slice(0, 10);

  const newWord = {
    id: makeId(),
    word,
    reading,
    partOfSpeech: partOfSpeech || '—',
    tags: Array.isArray(tags) ? tags : [],
    example: typeof example === 'string' ? example.trim() : '',
    dateAdded: today,
    appearances: 0,
    correct: 0,
    interval: 0,   // 0 = still in learning (see srs.js)
    ease: 2.5,
    lastSeen: null,
    nextDue: today,
    history: []
  };

  data.words.push(newWord);
  saveData(data);
  return newWord;
}

/** Edit a word's fields (word / reading / partOfSpeech / tags). */
function updateWord(id, fields) {
  const data = loadData();
  const w = data.words.find(x => x.id === id);
  if (!w) return null;
  if (typeof fields.word === 'string' && fields.word.trim()) w.word = fields.word.trim();
  if (typeof fields.reading === 'string' && fields.reading.trim()) w.reading = fields.reading.trim();
  if (typeof fields.partOfSpeech === 'string') w.partOfSpeech = fields.partOfSpeech;
  if (Array.isArray(fields.tags)) w.tags = fields.tags;
  if (typeof fields.example === 'string') w.example = fields.example.trim();
  saveData(data);
  return w;
}

/** All distinct tags in use, with counts, most used first. */
function getAllTags() {
  const counts = {};
  getAllWords().forEach(w => (w.tags || []).forEach(t => {
    counts[t] = (counts[t] || 0) + 1;
  }));
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map(t => ({ tag: t, count: counts[t] }));
}

/** Remove a word permanently. */
function deleteWord(id) {
  const data = loadData();
  const i = data.words.findIndex(x => x.id === id);
  if (i < 0) return false;
  data.words.splice(i, 1);
  saveData(data);
  return true;
}

/** Reset a word's learning progress back to "new". */
function resetWordProgress(id) {
  const data = loadData();
  const w = data.words.find(x => x.id === id);
  if (!w) return null;
  const today = new Date().toISOString().slice(0, 10);
  Object.assign(w, {
    appearances: 0, correct: 0, interval: 0, ease: 2.5,
    lastSeen: null, nextDue: today, history: []
  });
  saveData(data);
  return w;
}

function getAllWords() {
  return loadData().words;
}

function getRecentWords(limit = 5) {
  return getAllWords()
    .slice()
    .sort((a, b) => (b.dateAdded > a.dateAdded ? 1 : -1))
    .slice(0, limit);
}

function getWordsDueToday() {
  const today = new Date().toISOString().slice(0, 10);
  return getAllWords().filter(w => w.nextDue <= today);
}

/**
 * Persist one review. `again` counts as an appearance but not a correct;
 * `good`/`easy` count as correct; `hard` counts as seen-but-not-correct.
 */
function updateWordAfterRating(wordId, rating) {
  const data = loadData();
  const word = data.words.find(w => w.id === wordId);
  if (!word) return null;

  const today = new Date().toISOString().slice(0, 10);
  word.appearances += 1;
  word.lastSeen = today;
  word.history.push({ date: today, rating });
  if (rating === 'good' || rating === 'easy') word.correct += 1;

  applySrsUpdate(word, rating);

  saveData(data);
  return word;
}

function getStats() {
  const words = getAllWords();
  const total = words.length;
  if (total === 0) return { total: 0, mastered: 0, learning: 0, accuracy: 0 };

  let totalAppearances = 0;
  let totalCorrect = 0;
  let mastered = 0;

  words.forEach(w => {
    totalAppearances += w.appearances;
    totalCorrect += w.correct;
    if (w.appearances >= 5 && w.correct / w.appearances >= 0.8) mastered += 1;
  });

  const accuracy = totalAppearances > 0 ? Math.round((totalCorrect / totalAppearances) * 100) : 0;
  return { total, mastered, learning: total - mastered, accuracy };
}
