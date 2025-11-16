#!/usr/bin/env python3
"""
Calculează trenduri din videouri existente FĂRĂ AI - folosește doar tags și keywords din titluri.
Mult mai rapid, nu necesită API Gemini.

Usage:
  python3 calculate_trends_simple.py --db youtube_videos.db
"""
import sqlite3
import argparse
import datetime
import json
import math
import re
from typing import List, Dict
from collections import defaultdict


def normalize_trend_name(name: str) -> str:
    """Normalizează numele trendului: lowercase, fără emoji, spații extra."""
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "]+",
        flags=re.UNICODE,
    )
    cleaned = emoji_pattern.sub("", name)
    cleaned = cleaned.lower().strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def extract_keywords_from_video(video: Dict) -> List[str]:
    """Extrage keywords din tags și titlu (fără AI)."""
    keywords = []
    
    # Tags
    tags_json = video.get("tags") or "[]"
    try:
        tags = json.loads(tags_json)
        keywords.extend([normalize_trend_name(tag) for tag in tags if tag])
    except:
        pass
    
    # Keywords din titlu (2+ words phrases)
    title = video.get("title") or ""
    title_lower = title.lower()
    
    # Fashion keywords comune
    fashion_terms = [
        "fashion haul", "outfit ideas", "style guide", "lookbook", 
        "fashion trends", "streetwear", "minimalist fashion", "aesthetic",
        "wardrobe essentials", "capsule wardrobe", "outfit inspiration",
        "fashion week", "runway", "designer", "vintage fashion",
        "thrift haul", "sustainable fashion", "fast fashion",
        "y2k fashion", "grunge", "cottagecore", "dark academia",
        "clean girl", "mob wife", "quiet luxury", "old money",
        "oversized", "blazer", "wide leg", "cargo pants",
        "leather jacket", "trench coat", "denim", "maxi dress"
    ]
    
    for term in fashion_terms:
        if term in title_lower:
            keywords.append(normalize_trend_name(term))
    
    return list(set(keywords))  # unique


def calculate_days_since(date_str: str, now: datetime.datetime) -> float:
    """Calculează diferența în zile între date_str (ISO format) și now."""
    try:
        dt = datetime.datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        delta = now - dt
        return max(delta.total_seconds() / 86400, 0.1)
    except:
        return 1.0


def calculate_trends_simple(
    db_path: str,
    days_window: int = 7,
    min_videos: int = 3,
    min_views: int = 10000,
    max_views: int = 500000,
):
    """Calculează trenduri din videouri existente fără AI."""
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Creează tabelul trends
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
    
    print("📊 Calculating trends from existing videos (no AI needed)...\n")
    
    # 1. Citește toate videouri
    cur.execute("SELECT * FROM videos ORDER BY publish_date DESC")
    videos = [dict(row) for row in cur.fetchall()]
    print(f"✓ Found {len(videos)} videos in database")
    
    if not videos:
        print("No videos in database.")
        conn.close()
        return
    
    # 2. Extrage keywords din fiecare video
    print("✓ Extracting keywords from titles and tags...")
    video_trends = []
    
    for video in videos:
        keywords = extract_keywords_from_video(video)
        for keyword in keywords:
            if keyword and len(keyword) > 2:  # Skip very short keywords
                video_trends.append({
                    "video_id": video["video_id"],
                    "trend_name": keyword,
                    "publish_date": video["publish_date"],
                    "view_count": video.get("view_count") or 0,
                })
    
    print(f"✓ Extracted {len(video_trends)} trend mentions from videos\n")
    
    # 3. Grupează după trend_name
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
    
    print(f"🔥 Found {len(emerging)} EMERGING TRENDS (filtered)\n")
    print(f"{'='*100}\n")
    
    # 5. Salvează în DB
    cur.execute("DELETE FROM trends")
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
    
    # 6. Afișează top trenduri
    if emerging:
        print("🏆 TOP EMERGING TRENDS:\n")
        for i, trend in enumerate(emerging[:20], 1):
            print(f"{i:2d}. {trend['name'].upper()}")
            print(f"    ├─ Score: {trend['score']:.2f}")
            print(f"    ├─ Videos: {trend['num_videos']} | Total Views: {trend['total_views']:,} | Avg Views: {trend['avg_views']:,.0f}")
            print(f"    ├─ First seen: {trend['first_seen_at'][:10]} | Last seen: {trend['last_seen_at'][:10]}")
            print(f"    └─ Days since first: {trend['days_since']:.1f}\n")
    else:
        print("No emerging trends found with current filters.")
        print(f"Try relaxing filters: --min-videos 2 --max-views 10000000")
    
    print(f"\n{'='*100}")
    print(f"✓ Saved {len(emerging)} trends to database: {db_path}")


def parse_args():
    p = argparse.ArgumentParser(description="Calculate trends from videos WITHOUT AI (fast)")
    p.add_argument("--db", default="youtube_videos.db", help="SQLite database path")
    p.add_argument("--days", type=int, default=10, help="Days window for 'emerging' filter (default: 10)")
    p.add_argument("--min-videos", type=int, default=3, help="Minimum videos mentioning trend (default: 3)")
    p.add_argument("--min-views", type=int, default=10000, help="Minimum total views (default: 10000)")
    p.add_argument("--max-views", type=int, default=500000, help="Maximum total views (default: 500000)")
    return p.parse_args()


def main():
    args = parse_args()
    calculate_trends_simple(
        db_path=args.db,
        days_window=args.days,
        min_videos=args.min_videos,
        min_views=args.min_views,
        max_views=args.max_views,
    )


if __name__ == "__main__":
    main()
