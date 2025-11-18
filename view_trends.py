#!/usr/bin/env python3
"""
Vizualizează trendurile emergente detectate din baza de date.

Usage:
    python view_trends.py --db youtube_videos.db
    python view_trends.py --db youtube_videos.db --top 10
    python view_trends.py --db youtube_videos.db --json

Implicit, rezultatele sunt afișate în format Markdown ușor de citit.
"""
import sqlite3
import argparse
import json
from typing import List, Dict

def _format_trends_as_markdown(trends: List[Dict], top: int) -> str:
    """Generează un tabel Markdown cu trendurile detectate."""
    header = "| Trend | Score | Avg Views/Clip |"
    separator = "| --- | ---: | ---: |"

    lines: List[str] = [
        f"## 🔥 Top {len(trends)} Emerging Fashion Trends\n",
        header,
        separator,
    ]

    for trend in trends:
        lines.append(
            "| {name} | {score:.2f} | {avg_views:,.0f} |".format(
                name=f"**{trend['name'].title()}**",
                score=trend["score"],
                avg_views=trend["avg_views"],
            )
        )

    return "\n".join(lines) + "\n"

def _format_trend_details_as_markdown(trend: Dict) -> str:
    """Generează detaliile unui trend în format Markdown."""
    lines = [
        f"## 🔍 Trend Details: **{trend['name'].title()}**\n",
        f"- **Score:** {trend['score']:.2f}",
        f"- **Videos:** {trend['num_videos']}",
        f"- **Total views:** {trend['total_views']:,}",
        f"- **Average views/video:** {trend['avg_views']:,.0f}",
        f"- **First seen:** {trend['first_seen_at'][:10]}",
        f"- **Last seen:** {trend['last_seen_at'][:10]}",
        f"- **Detected at:** {trend['detected_at'][:19]}",
        "",
    ]

    return "\n".join(lines)

def view_trends(db_path: str, top: int = 20, output_format: str = "markdown"):
    """Afișează trendurile emergente din baza de date."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Verifică dacă există tabelul trends
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trends'")
    if not cur.fetchone():
        print(f"ERROR: Table 'trends' not found in {db_path}")
        print("Run detect_emerging_trends.py first to detect trends.")
        conn.close()
        return
    
    # Citește trenduri sortate după score
    cur.execute(
        """
        SELECT name, score, num_videos, total_views, avg_views, 
               first_seen_at, last_seen_at, detected_at
        FROM trends
        ORDER BY score DESC
        LIMIT ?
        """,
        (top,),
    )
    
    trends = [dict(row) for row in cur.fetchall()]
    conn.close()
    
    if not trends:
        print("No emerging trends found in database.")
        print("Run detect_emerging_trends.py to detect trends from videos.")
        return
    
    if output_format == "json":
        print(json.dumps(trends, indent=2, ensure_ascii=False))
        return

    markdown_output = _format_trends_as_markdown(trends, top)
    print(markdown_output)

def view_trend_details(db_path: str, trend_name: str):
    """Afișează detalii despre un trend specific (videouri care îl menționează)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Verifică dacă trendul există
    cur.execute("SELECT * FROM trends WHERE name = ?", (trend_name.lower(),))
    trend = cur.fetchone()
    
    if not trend:
        print(f"Trend '{trend_name}' not found in database.")
        conn.close()
        return
    
    trend = dict(trend)
    
    print(_format_trend_details_as_markdown(trend))

    conn.close()

def parse_args():
    p = argparse.ArgumentParser(description="View emerging fashion trends from database")
    p.add_argument("--db", default="youtube_videos.db", help="SQLite database path")
    p.add_argument("--top", type=int, default=20, help="Number of top trends to display (default: 20)")
    p.add_argument("--json", action="store_true", help="Output as JSON instead of table")
    p.add_argument("--trend", help="Show details for specific trend name")
    return p.parse_args()

def main():
    args = parse_args()
    
    if args.trend:
        view_trend_details(args.db, args.trend)
    else:
        output_format = "json" if args.json else "markdown"
        view_trends(args.db, args.top, output_format)

if __name__ == "__main__":
    main()
