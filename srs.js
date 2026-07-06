/**
 * srs.js
 * ------
 * Spaced repetition scheduling, modeled on the SM-2 algorithm as used by
 * Anki — the most widely studied consumer implementation of spaced
 * repetition (Ebbinghaus forgetting curve → expanding review intervals).
 *
 * Four ratings:
 *   もう一度 (again) — you forgot. The card lapses: ease drops, the interval
 *                      resets to 0 and the card comes back LATER IN THE SAME
 *                      SESSION (the app re-queues it), then starts over at
 *                      1 day. This is the piece the old 3-button system was
 *                      missing — forgotten words could still drift away.
 *   難しい   (hard)  — recalled with real effort. Interval grows only ~1.2×
 *                      and ease drops slightly, so the word returns sooner
 *                      next time.
 *   覚えた   (good)  — recalled correctly. Interval × ease (starts at 2.5).
 *   簡単     (easy)  — instant recall. Interval × ease × 1.3, ease rises.
 *
 * New words (and lapsed words) "graduate" gently:
 *   good → next review in 1 day, easy → 4 days (Anki's defaults).
 * This fixes the old bug where a brand-new word rated 完璧 could jump
 * straight to a multi-day interval and effectively never come back while
 * it was still fragile in memory.
 *
 * A small random "fuzz" (±5%) is applied to intervals ≥ 3 days so reviews
 * don't all clump onto the same future day — same trick Anki uses.
 */

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const MAX_INTERVAL_DAYS = 365;

function clampEase(e) {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, e));
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fuzzInterval(days) {
  if (days < 3) return days;
  const fuzz = Math.round(days * 0.05 * (Math.random() * 2 - 1));
  return days + fuzz;
}

/**
 * Mutates `word` in place: updates interval, ease, nextDue.
 * (appearances / correct / history are handled by storage.js)
 */
function applySrsUpdate(word, rating) {
  // interval < 1 means "in learning": brand-new, or just lapsed via もう一度
  const learning = !word.interval || word.interval < 1;

  if (rating === 'again') {
    word.ease = clampEase((word.ease || 2.5) - 0.20);
    word.interval = 0;                 // back to learning
    word.nextDue = isoDaysFromNow(0);  // still due today; app re-queues it now
    return;
  }

  if (rating === 'hard') {
    word.ease = clampEase((word.ease || 2.5) - 0.15);
    word.interval = learning ? 1 : Math.max(word.interval + 1, Math.round(word.interval * 1.2));
  } else if (rating === 'good') {
    word.interval = learning ? 1 : Math.round(word.interval * word.ease);
  } else if (rating === 'easy') {
    word.ease = clampEase((word.ease || 2.5) + 0.15);
    word.interval = learning ? 4 : Math.round(word.interval * word.ease * 1.3);
  } else {
    console.error('srs: unknown rating', rating);
    return;
  }

  word.interval = Math.max(1, Math.min(MAX_INTERVAL_DAYS, fuzzInterval(word.interval)));
  word.nextDue = isoDaysFromNow(word.interval);
}

/**
 * Build today's study queue:
 *   1. every due/overdue review word (most overdue first) — never dropped
 *   2. up to `newLimit` brand-new words (oldest added first)
 */
function buildStudyQueue(allWords, newLimit = 8) {
  const today = new Date().toISOString().slice(0, 10);

  const due = allWords
    .filter(w => w.appearances > 0 && w.nextDue <= today)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1));

  const fresh = allWords
    .filter(w => w.appearances === 0)
    .sort((a, b) => (a.dateAdded < b.dateAdded ? -1 : 1))
    .slice(0, newLimit);

  return [...due, ...fresh];
}

/**
 * Memory strength of a word, for the 単語帳 insight view.
 * Thresholds follow Anki's research-backed conventions:
 *   - a card with an interval ≥ 21 days is "mature" — reliably in
 *     long-term memory if accuracy is also high
 *   - accuracy below ~50% means the word isn't sticking
 * Categories: 'new' 新規 / 'weak' 苦手 / 'learning' 学習中 / 'strong' 習得
 */
function wordStrength(w) {
  if (!w.appearances) return 'new';
  const acc = w.correct / w.appearances;
  if (w.interval < 1 || acc < 0.5) return 'weak';
  if (w.interval >= 21 && acc >= 0.8) return 'strong';
  return 'learning';
}

const STRENGTH_LABEL = { new: '新規', weak: '苦手', learning: '学習中', strong: '習得' };
const STRENGTH_ORDER = { weak: 0, learning: 1, new: 2, strong: 3 }; // for 苦手順 sort

/**
 * Garden growth stage — the visual form each word takes:
 *   種 seed (never studied) → 芽 sprout (young) → 蕾 bud (interval ≥ 7d)
 *   → 満開 bloom (mature: 21d+ & 80%+) ... しおれ wilt (weak / lapsed)
 */
function growthStage(w) {
  const s = wordStrength(w);
  if (s === 'new') return 'seed';
  if (s === 'weak') return 'wilt';
  if (s === 'strong') return 'bloom';
  return w.interval >= 7 ? 'bud' : 'sprout';
}

const STAGE_LABEL = { seed: '種', sprout: '芽', bud: '蕾', bloom: '満開', wilt: 'しおれ' };
const STAGE_SCORE = { seed: 0.2, sprout: 0.45, bud: 0.7, bloom: 1, wilt: 0.1 };

/** Garden vibrance 0–100: how alive the (filtered) garden is. */
function gardenVibrance(words) {
  if (!words.length) return 0;
  const sum = words.reduce((a, w) => a + STAGE_SCORE[growthStage(w)], 0);
  return Math.round((sum / words.length) * 100);
}
