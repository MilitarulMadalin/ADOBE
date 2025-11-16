# 🔥 Fashion Trends Detection Pipeline

Pipeline complet pentru detectarea trendurilor emergente din videouri YouTube fashion.

## 📋 Cerințe

```powershell
pip install -r requirements.txt
pip install google-api-python-client
```

## 🔑 Setup API Keys

Creează un fișier `.env` în acest folder:

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
GOOGLE_API_KEY=your_gemini_api_key_here
```

## 🚀 Workflow Complet

### Pas 1: Colectează videouri YouTube

Caută videouri fashion pe YouTube și salvează în baza de date:

```powershell
# Exemplu: caută 50 videouri per query
python youtube_to_sqlite.py --queries "fashion haul 2025" "streetwear style" "minimalist fashion" --max 50 --db youtube_videos.db

# SAU folosind un fișier cu queries (un query pe linie)
python youtube_to_sqlite.py --queries-file queries.txt --db youtube_videos.db --max 30
```

### Pas 2: Detectează trenduri emergente

Analizează videurile cu AI și detectează trendurile emergente:

```powershell
# Rulare standard (ultimele 7 zile, min 3 videouri, 10k-500k views)
python detect_emerging_trends.py --db youtube_videos.db

# Personalizat: ultimele 10 zile, min 5 videouri
python detect_emerging_trends.py --db youtube_videos.db --days 10 --min-videos 5 --min-views 15000 --max-views 1000000
```

**Parametri:**
- `--db`: calea către baza de date (default: `youtube_videos.db`)
- `--days`: fereastra de timp pentru "emerging" (default: 7 zile)
- `--min-videos`: număr minim de videouri care menționează trendul (default: 3)
- `--min-views`: total views minim (default: 10,000)
- `--max-views`: total views maxim (default: 500,000)

### Pas 3: Vizualizează rezultatele

Afișează trendurile detectate:

```powershell
# Afișează top 20 trenduri (default)
python view_trends.py --db youtube_videos.db

# Afișează top 10
python view_trends.py --db youtube_videos.db --top 10

# Export JSON
python view_trends.py --db youtube_videos.db --json > trends.json

# Detalii despre un trend specific
python view_trends.py --db youtube_videos.db --trend "clean girl aesthetic"
```

## 📊 Algoritm de Scoring

Pentru fiecare trend detectat:

1. **Grupare:** Normalizare (lowercase, fără emoji) și grupare după `trend_name`
2. **Metrici:**
   - `num_videos`: câte videouri îl menționează
   - `total_views`: suma views de la toate videurile
   - `avg_views`: medie views
   - `first_seen_at`: prima apariție (publish_date)
   - `last_seen_at`: ultima apariție

3. **Score:**
   ```
   score = num_videos × log(1 + total_views) / zile_de_când_a_apărut
   ```

4. **Filtre "emerging":**
   - `num_videos ≥ 3`
   - `10,000 ≤ total_views ≤ 500,000` (nu virale uriașe)
   - `first_seen_at` în ultimele 7-10 zile

## 🗄️ Structura Bazei de Date

### Tabel `videos`
```sql
video_id TEXT PRIMARY KEY
title TEXT
description TEXT
channel TEXT
url TEXT
publish_date TEXT
view_count INTEGER
like_count INTEGER
tags TEXT (JSON)
inserted_at TEXT
```

### Tabel `trends`
```sql
name TEXT PRIMARY KEY
score REAL
num_videos INTEGER
total_views INTEGER
avg_views REAL
first_seen_at TEXT
last_seen_at TEXT
detected_at TEXT
```

## 🛠️ Verificare date în SQLite

```powershell
# Deschide baza de date
sqlite3 youtube_videos.db

# În consola SQLite:
.tables                          # listă tabele
SELECT COUNT(*) FROM videos;     # număr videouri
SELECT COUNT(*) FROM trends;     # număr trenduri
SELECT * FROM trends ORDER BY score DESC LIMIT 5;  # top 5 trenduri
.quit                            # ieșire
```

## 📝 Exemple de Queries

Creează `queries.txt` cu:
```
fashion haul 2025
streetwear outfit ideas
clean girl aesthetic
minimalist wardrobe
Y2K fashion comeback
cottagecore style
dark academia outfits
```

Apoi rulează:
```powershell
python youtube_to_sqlite.py --queries-file queries.txt --max 40 --db youtube_videos.db
python detect_emerging_trends.py --db youtube_videos.db --days 10
python view_trends.py --db youtube_videos.db --top 15
```

## 🎯 Exemplu Complet

```powershell
# 1. Colectează date
python youtube_to_sqlite.py --queries "fashion trends 2025" "outfit inspiration" --max 100 --db fashion.db

# 2. Detectează trenduri
python detect_emerging_trends.py --db fashion.db --days 7 --min-videos 3

# 3. Vezi rezultate
python view_trends.py --db fashion.db --top 10
```

## ⚡ Tips

- Pentru videouri mai recente, folosește `--region RO` și `--lang ro` în `youtube_to_sqlite.py`
- Crește `--max-views` dacă vrei să incluzi trenduri mai virale
- Scade `--days` la 3-5 pentru trenduri foarte fresh
- Rulează `detect_emerging_trends.py` periodic (zilnic) pentru a actualiza trendurile

## 🐛 Troubleshooting

**Error: "GOOGLE_API_KEY not found"**
→ Creează fișierul `.env` cu cheia Gemini API

**Error: "YOUTUBE_API_KEY not found"**
→ Adaugă cheia YouTube API în `.env`

**No trends found**
→ Verifică că ai videouri în DB: `python view_trends.py --db youtube_videos.db`
→ Relaxează filtrele: `--min-videos 2 --max-views 1000000`

**AI extraction fails**
→ Verifică quota Gemini API (limită gratuită: 15 requests/min)
→ Scriptul face pauze automate la erori
