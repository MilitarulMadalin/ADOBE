#!/usr/bin/env python3
"""
Detectează trenduri emergente din videouri YouTube salvate în baza de date.

Algoritm:
1. Citește toate videouri din tabelul `videos`
2. Extrage trenduri din fiecare video folosind Gemini AI
3. Grupează după trend_name normalizat (lowercase, fără emoji)
4. Calculează metrici: num_videos, total_views, avg_views, first_seen_at, last_seen_at
5. Score = num_videos * log(1 + total_views) / zile_de_când_a_apărut
6. Filtrează "emerging": num_videos >= 3, total_views între 10k-500k, first_seen_at în ultimele 7-10 zile
7. Salvează în tabelul `trends`

Usage:
  python detect_emerging_trends.py --db youtube_videos.db --days 7 --min-videos 3
"""
import os
import re
import sqlite3
import argparse
import datetime
import json
import math
from typing import List, Dict, Any
from collections import defaultdict

from dotenv import load_dotenv, find_dotenv
import google.generativeai as genai

load_dotenv(find_dotenv())

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    raise SystemExit("ERROR: set GOOGLE_API_KEY environment variable (or add to .env)")

genai.configure(api_key=GEMINI_API_KEY)


def normalize_trend_name(name: str) -> str:
    """Normalizează numele trendului: lowercase, fără emoji, spații extra."""
    # Elimină emoji folosind regex (básic, acoperă majoritatea emoji-urilor Unicode)
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE,
    )
    cleaned = emoji_pattern.sub("", name)
    cleaned = cleaned.lower().strip()
    cleaned = re.sub(r"\s+", " ", cleaned)  # spații multiple -> unul singur
    return cleaned


def init_trends_table(conn: sqlite3.Connection):
    """Creează tabelul trends dacă nu există."""
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trends (
            name TEXT PRIMARY KEY,
            score REAL,
            num_videos INTEGER,
            total_views INTEGER,
            avg_views REAL,
            first_seen_at TEXT,
            last_seen_at TEXT,
            detected_at TEXT
        )
        """
    )
    conn.commit()


def extract_trends_from_video(video: Dict[str, Any], model: genai.GenerativeModel) -> List[str]:
    """
    Folosește Gemini AI pentru a extrage trenduri din titlu + descriere video.
    Returnează listă de trend names.
    """
    title = video.get("title") or ""
    description = video.get("description") or ""
    tags_json = video.get("tags") or "[]"
    try:
        tags = json.loads(tags_json)
    except:
        tags = []

    prompt = f"""Analizează acest video YouTube din domeniul fashion/lifestyle și extrage trendurile sau stilurile menționate.

Titlu: {title}
Descriere: {description[:500]}
Tags: {', '.join(tags[:10])}

Returnează DOAR o listă JSON cu 1-5 trenduri identificate (nume scurte, fără descrieri).
Exemplu format răspuns: ["clean girl aesthetic", "oversized blazer trend", "minimalist fashion"]

Dacă nu găsești trenduri clare, returnează o listă goală: []
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Extrage JSON din răspuns (poate fi înconjurat de ```json ... ```)
        json_match = re.search(r'\[.*\]', text, re.DOTALL)
        if json_match:
            trends = json.loads(json_match.group(0))
            if isinstance(trends, list):
                return [str(t).strip() for t in trends if t]
        return []
    except Exception as e:
        print(f"  [WARN] Failed to extract trends for video {video.get('video_id')}: {e}")
        return []


def calculate_days_since(date_str: str, now: datetime.datetime) -> float:
    """Calculează diferența în zile între date_str (ISO format) și now."""
    try:
        dt = datetime.datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        delta = now - dt
        return max(delta.total_seconds() / 86400, 0.1)  # min 0.1 zile pentru evitarea diviziunii cu 0
    except:
        return 1.0


def detect_emerging_trends(
    db_path: str,
    days_window: int = 7,
    min_videos: int = 3,
    min_views: int = 10000,
    max_views: int = 500000,
):
    """Pipeline principal pentru detectarea trendurilor emergente."""
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    init_trends_table(conn)
    
    # 1. Citește toate videouri
    print("1. Fetching all videos from database...")
    cur.execute("SELECT * FROM videos ORDER BY publish_date DESC")
    videos = [dict(row) for row in cur.fetchall()]
    print(f"   Found {len(videos)} videos")
    
    if not videos:
        print("No videos in database. Run youtube_to_sqlite.py first.")
        conn.close()
        return
    
    # 2. Extrage trenduri cu AI
    print("2. Extracting trends using Gemini AI...")
    model = genai.GenerativeModel(
        model_name="models/gemini-2.0-flash-exp",
        generation_config={"temperature": 0.3, "max_output_tokens": 500},
    )
    
    video_trends = []  # listă de (video, trend_name_normalized, publish_date, views)
    
    for i, video in enumerate(videos):
        if i % 10 == 0:
            print(f"   Processing video {i+1}/{len(videos)}...")
        
        raw_trends = extract_trends_from_video(video, model)
        for trend in raw_trends:
            normalized = normalize_trend_name(trend)
            if normalized:
                video_trends.append({
                    "video_id": video["video_id"],
                    "trend_name": normalized,
                    "publish_date": video["publish_date"],
                    "view_count": video.get("view_count") or 0,
                })
    
    print(f"   Extracted {len(video_trends)} trend mentions")
    
    # 3. Grupează după trend_name
    print("3. Grouping trends and calculating metrics...")
    trend_groups = defaultdict(list)
    for vt in video_trends:
        trend_groups[vt["trend_name"]].append(vt)
    
    now = datetime.datetime.utcnow()
    trend_metrics = []
    
    for trend_name, occurrences in trend_groups.items():
        num_videos = len(occurrences)
        total_views = sum(occ["view_count"] for occ in occurrences)
        avg_views = total_views / num_videos if num_videos > 0 else 0
        
        dates = [occ["publish_date"] for occ in occurrences if occ["publish_date"]]
        if not dates:
            continue
        
        dates_sorted = sorted(dates)
        first_seen_at = dates_sorted[0]
        last_seen_at = dates_sorted[-1]
        
        days_since = calculate_days_since(first_seen_at, now)
        
        # Score = num_videos * log(1 + total_views) / zile
        score = (num_videos * math.log(1 + total_views)) / days_since
        
        trend_metrics.append({
            "name": trend_name,
            "score": score,
            "num_videos": num_videos,
            "total_views": total_views,
            "avg_views": avg_views,
            "first_seen_at": first_seen_at,
            "last_seen_at": last_seen_at,
            "days_since": days_since,
        })
    
    # 4. Filtrează emerging trends
    print("4. Filtering emerging trends...")
    emerging = []
    for tm in trend_metrics:
        if (
            tm["num_videos"] >= min_videos
            and min_views <= tm["total_views"] <= max_views
            and tm["days_since"] <= days_window
        ):
            emerging.append(tm)
    
    # Sortează după score descrescător
    emerging.sort(key=lambda x: x["score"], reverse=True)
    
    print(f"   Found {len(emerging)} emerging trends")
    
    # 5. Salvează în tabelul trends
    print("5. Saving to trends table...")
    cur.execute("DELETE FROM trends")  # Clear previous results
    
    detected_at = now.isoformat()
    for trend in emerging:
        cur.execute(
            """
            INSERT INTO trends (name, score, num_videos, total_views, avg_views, first_seen_at, last_seen_at, detected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                trend["name"],
                trend["score"],
                trend["num_videos"],
                trend["total_views"],
                trend["avg_views"],
                trend["first_seen_at"],
                trend["last_seen_at"],
                detected_at,
            ),
        )
    
    conn.commit()
    conn.close()
    
    print(f"\n✓ Saved {len(emerging)} emerging trends to database")
    print(f"  Database: {db_path}")
    print(f"  Table: trends")
    
    # Afișează top 5
    if emerging:
        print("\nTop 5 emerging trends:")
        for i, trend in enumerate(emerging[:5], 1):
            print(f"  {i}. {trend['name']}")
            print(f"     Score: {trend['score']:.2f} | Videos: {trend['num_videos']} | Views: {trend['total_views']:,}")
            print(f"     First seen: {trend['first_seen_at'][:10]} | Days ago: {trend['days_since']:.1f}")


def parse_args():
    p = argparse.ArgumentParser(description="Detect emerging fashion trends from YouTube videos")
    p.add_argument("--db", default="youtube_videos.db", help="SQLite database path")
    p.add_argument("--days", type=int, default=7, help="Days window for 'emerging' filter (default: 7)")
    p.add_argument("--min-videos", type=int, default=3, help="Minimum videos mentioning trend (default: 3)")
    p.add_argument("--min-views", type=int, default=10000, help="Minimum total views (default: 10000)")
    p.add_argument("--max-views", type=int, default=500000, help="Maximum total views (default: 500000)")
    return p.parse_args()


def main():
    args = parse_args()
    detect_emerging_trends(
        db_path=args.db,
        days_window=args.days,
        min_videos=args.min_videos,
        min_views=args.min_views,
        max_views=args.max_views,
    )


if __name__ == "__main__":
    main()
