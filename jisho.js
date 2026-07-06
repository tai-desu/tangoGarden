/**
 * jisho.js
 * --------
 * Looks up a word's reading + part of speech via Jisho's unofficial API
 * (JMdict data): https://jisho.org/api/v1/search/words?keyword=...
 *
 * Jisho sends no Access-Control-Allow-Origin header, so browsers must go
 * through a CORS proxy. Public proxies are individually unreliable — the
 * old version depended on exactly one (corsproxy.io) and died whenever it
 * did. This version tries several proxies in order, each with its own
 * timeout, and only gives up (→ manual entry) if all of them fail.
 */

const JISHO_ENDPOINT = 'https://jisho.org/api/v1/search/words?keyword=';

const CORS_PROXIES = [
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)
];

const LOOKUP_TIMEOUT_MS = 8000;

/** True if the string is only hiragana/katakana (no lookup needed). */
function isKanaOnly(s) {
  return /^[\u3041-\u309F\u30A0-\u30FF\u30FCー〜]+$/.test(s);
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { method: 'GET', signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Looks up `query` and returns:
 *   { word, readings: [...], partOfSpeech, isCommon }
 * Throws an Error with a user-presentable Japanese message on failure.
 */
async function lookupWord(query) {
  // Kana-only words are their own reading — no network needed.
  if (isKanaOnly(query)) {
    return { word: query, readings: [query], partOfSpeech: '—', isCommon: false };
  }

  // Offline dictionary first (dict.js — 25k common JMdict words).
  // Instant, works with no network at all.
  if (typeof TANGO_DICT !== 'undefined' && TANGO_DICT[query]) {
    const [readingsRaw, pos] = TANGO_DICT[query].split(';');
    return {
      word: query,
      readings: readingsRaw.split('|'),
      partOfSpeech: pos || '—',
      isCommon: true
    };
  }

  const target = JISHO_ENDPOINT + encodeURIComponent(query);

  for (const wrap of CORS_PROXIES) {
    let json;
    try {
      const response = await fetchWithTimeout(wrap(target), LOOKUP_TIMEOUT_MS);
      if (!response.ok) continue;
      json = await response.json();
    } catch (e) {
      continue; // network / timeout / parse problem → try the next proxy
    }

    if (!json || !Array.isArray(json.data)) continue; // proxy mangled it

    if (json.data.length === 0) {
      // Valid answer from Jisho: the word genuinely isn't in the dictionary.
      throw new Error('この単語は見つかりませんでした。手動で入力してください。');
    }

    const normalized = normalizeEntry(json, query);
    if (normalized) return normalized;
    throw new Error('読み方が見つかりませんでした。手動で入力してください。');
  }

  throw new Error('オンライン辞書に接続できませんでした。手動で入力してください。');
}

function normalizeEntry(json, query) {
  const exactMatch = json.data.find(entry =>
    Array.isArray(entry.japanese) &&
    entry.japanese.some(j => j.word === query)
  );
  const entry = exactMatch || json.data[0];

  if (!entry.japanese || entry.japanese.length === 0) return null;

  const matchingForms = entry.japanese.filter(j => j.word === query || !j.word);
  const readingSet = new Set();
  (matchingForms.length ? matchingForms : entry.japanese).forEach(j => {
    if (j.reading) readingSet.add(j.reading);
  });

  if (readingSet.size === 0) return null;

  const partOfSpeech = (entry.senses && entry.senses[0] && entry.senses[0].parts_of_speech)
    ? translatePos(entry.senses[0].parts_of_speech[0])
    : '—';

  return {
    word: query,
    readings: Array.from(readingSet),
    partOfSpeech,
    isCommon: !!entry.is_common
  };
}

/** Translate Jisho's English part-of-speech labels to Japanese terms. */
function translatePos(posEnglish) {
  const map = {
    'Noun': '名詞',
    'Na-adjective': '形容動詞',
    'I-adjective': '形容詞',
    'Ichidan verb': '動詞（一段）',
    'Godan verb': '動詞（五段）',
    'Suru verb': '動詞（する）',
    'Adverb': '副詞',
    'Expression': '表現',
    'Conjunction': '接続詞',
    'Particle': '助詞',
    'Pronoun': '代名詞',
    'Counter': '助数詞',
    'Prefix': '接頭辞',
    'Suffix': '接尾辞'
  };
  for (const key in map) {
    if (posEnglish && posEnglish.indexOf(key) === 0) return map[key];
  }
  return posEnglish || '—';
}
