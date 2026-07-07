# 言葉の庭 (Kotoba no Niwa)

A personal Japanese vocabulary garden. Every word you save is a seed;
reviews are watering; memory strength is growth stage. Built as a
static site — no server, no build step, no dependencies.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell: garden, watering (study), sowing (add), garden record |
| `style.css` | Mint/pine monoline botanical theme |
| `app.js` | Garden rendering, weather + fauna, study sessions, word list |
| `srs.js` | Spaced repetition (SM-2 / Anki-style) + growth stages |
| `storage.js` | localStorage data layer |
| `sync.js` | Backup: file export/import + GitHub Gist auto-sync |
| `weather.js` | Live Tokyo weather via Open-Meteo (free, no key) |
| `jisho.js` | Reading lookup: offline dict → Jisho API → manual entry |
| `dict.js` | Offline dictionary: 25,743 common JMdict words (~0.9 MB) |
| `sound.js` | Marimba tap sound (synthesized, no audio files) |

## Deploy

Upload all files to the root of your GitHub Pages repository
(replacing the old versions). `dict.js` and `sync.js` are new since
the original version — don't forget them.

## Backup setup (one time)

1. Create a GitHub token: Settings → Developer settings → Tokens
   (classic) → check only `gist` → generate.
2. In the app: 庭の記録 → バックアップと同期 → paste token →
   保存して今すぐ同期.
3. Repeat step 2 on each device with the same token. Data syncs
   automatically from then on (private Gist, newer side wins).

Also available: ファイルに保存 / ファイルから復元 for manual
file backups.

## Credits

- Dictionary data from [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html)
  © EDRDG, used under CC BY-SA 4.0 (via the jamdict-data package).
- Online lookup fallback: jisho.org unofficial API.
- Weather: [Open-Meteo](https://open-meteo.com/) free API .
