#!/usr/bin/env python3
"""Search YouTube and save video metadata to a SQLite database.

Usage examples:
  python3 youtube_to_sqlite.py --queries "fashion haul" "streetwear 2025" --max 50
  python3 youtube_to_sqlite.py --queries-file queries.txt --db ./data/videos.db

The script reads `YOUTUBE_API_KEY` from the environment or a .env file.
"""
import os
import sqlite3
import argparse
import datetime
import json
from typing import List

from dotenv import load_dotenv, find_dotenv
import googleapiclient.discovery
import googleapiclient.errors

# load .env if present
load_dotenv(find_dotenv())

API_KEY = os.environ.get("YOUTUBE_API_KEY")
if not API_KEY:
    raise SystemExit("ERROR: set YOUTUBE_API_KEY environment variable (or add to .env)")


def init_db(db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS videos (
            video_id TEXT PRIMARY KEY,
            title TEXT,
            description TEXT,
            channel TEXT,
            url TEXT,
            publish_date TEXT,
            view_count INTEGER,
            like_count INTEGER,
            tags TEXT,
            inserted_at TEXT
        )
        """
    )
    conn.commit()
    return conn


def upsert_video(conn: sqlite3.Connection, v: dict):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO videos (video_id, title, description, channel, url, publish_date, view_count, like_count, tags, inserted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
            title=excluded.title,
            description=excluded.description,
            channel=excluded.channel,
            url=excluded.url,
            publish_date=excluded.publish_date,
            view_count=excluded.view_count,
            like_count=excluded.like_count,
            tags=excluded.tags,
            inserted_at=excluded.inserted_at
        """,
        (
            v.get("video_id"),
            v.get("title"),
            v.get("description"),
            v.get("channel"),
            v.get("url"),
            v.get("published_at"),
            v.get("view_count") or 0,
            v.get("like_count") or 0,
            json.dumps(v.get("tags") or []),
            datetime.datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()


def fetch_video_details(youtube, video_ids: List[str]) -> List[dict]:
    """Return list of video detail dicts for the given ids (uses part=snippet,statistics)."""
    results = []
    if not video_ids:
        return results

    # API allows up to 50 ids per call
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        try:
            resp = (
                youtube.videos()
                .list(part="snippet,statistics", id=",".join(batch))
                .execute()
            )
        except googleapiclient.errors.HttpError as e:
            print(f"Videos API error: {e}")
            continue

        items = resp.get("items", [])
        for item in items:
            vid = item.get("id")
            snippet = item.get("snippet", {})
            stats = item.get("statistics", {})
            results.append(
                {
                    "video_id": vid,
                    "title": snippet.get("title"),
                    "description": snippet.get("description"),
                    "channel": snippet.get("channelTitle"),
                    "url": f"https://www.youtube.com/watch?v={vid}",
                    "published_at": snippet.get("publishedAt"),
                    "view_count": int(stats.get("viewCount", 0) or 0),
                    "like_count": int(stats.get("likeCount", 0) or 0),
                    "tags": snippet.get("tags", []),
                }
            )

    return results


def search_query(youtube, query: str, max_results: int = 20, region: str = None, relevance_language: str = None) -> List[str]:
    """Search and return list of video IDs for a query (up to max_results)."""
    video_ids = []
    next_page_token = None
    fetched = 0
    while fetched < max_results:
        try:
            req = youtube.search().list(
                part="id",
                q=query,
                type="video",
                maxResults=min(50, max_results - fetched),
            )
            if region:
                req.regionCode = region
            if relevance_language:
                req.relevanceLanguage = relevance_language
            if next_page_token:
                req.pageToken = next_page_token

            resp = req.execute()
        except googleapiclient.errors.HttpError as e:
            print(f"Search API error: {e}")
            break

        items = resp.get("items", [])
        for it in items:
            vid = it.get("id", {}).get("videoId")
            if vid:
                video_ids.append(vid)
                fetched += 1
                if fetched >= max_results:
                    break

        next_page_token = resp.get("nextPageToken")
        if not next_page_token:
            break

    return video_ids


def run(queries: List[str], channels: List[str], db_path: str, max_per_query: int, region: str = None, lang: str = None):
    youtube = googleapiclient.discovery.build("youtube", "v3", developerKey=API_KEY)
    conn = init_db(db_path)

    total = 0
    # Search by query strings
    for q in queries:
        print(f"Searching query: {q}")
        ids = search_query(youtube, q, max_results=max_per_query, region=region, relevance_language=lang)
        print(f"Found {len(ids)} video ids for query '{q}'")
        details = fetch_video_details(youtube, ids)
        for v in details:
            upsert_video(conn, v)
            total += 1

    # Search by channel (search endpoint supports channelId filter via 'channelId')
    for ch in channels:
        print(f"Searching channel: {ch}")
        # channel input could be ID or name; we assume ID. For names, user can create queries 'channel:Name' instead.
        try:
            req = youtube.search().list(part="id", channelId=ch, type="video", maxResults=min(50, max_per_query))
            resp = req.execute()
        except googleapiclient.errors.HttpError as e:
            print(f"Search API error for channel {ch}: {e}")
            continue
        ids = [it.get("id", {}).get("videoId") for it in resp.get("items", []) if it.get("id", {}).get("videoId")]
        details = fetch_video_details(youtube, ids)
        for v in details:
            upsert_video(conn, v)
            total += 1

    conn.close()
    print(f"Stored/updated {total} videos into {db_path}")


def parse_args():
    p = argparse.ArgumentParser(description="Search YouTube and store metadata in a SQLite DB")
    p.add_argument("--queries", "-q", nargs="*", default=[], help="Search queries (space separated)")
    p.add_argument("--queries-file", help="File with one query per line")
    p.add_argument("--channels", "-c", nargs="*", default=[], help="Channel IDs to fetch videos from")
    p.add_argument("--db", default="youtube_videos.db", help="SQLite DB path")
    p.add_argument("--max", type=int, default=20, help="Max videos per query")
    p.add_argument("--region", "-r", default=None, help="Region code (ISO 3166-1 alpha-2)")
    p.add_argument("--lang", "-l", default=None, help="Relevance language (e.g. 'ro')")
    return p.parse_args()


def main():
    args = parse_args()
    queries = list(args.queries or [])
    if args.queries_file:
        try:
            with open(args.queries_file, "r", encoding="utf-8") as f:
                queries += [line.strip() for line in f if line.strip()]
        except Exception as e:
            print(f"Failed to read queries file: {e}")

    if not queries and not args.channels:
        print("Nothing to do. Provide --queries or --channels")
        return

    run(queries=queries, channels=args.channels or [], db_path=args.db, max_per_query=args.max, region=args.region, lang=args.lang)


if __name__ == "__main__":
    main()
