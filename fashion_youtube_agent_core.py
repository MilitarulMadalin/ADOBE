import os
import requests
from dotenv import load_dotenv, find_dotenv
import google.generativeai as genai
from google.generativeai import protos

# Auto-load a .env file if present in this directory or any parent directory.
# This allows local `.env` files (project root or subfolder) to provide
# `GOOGLE_API_KEY` and `YOUTUBE_API_KEY` without exporting them manually.
load_dotenv(find_dotenv())
from typing import Dict, Any

# ================== CONFIG ==================

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("Cheia GOOGLE_API_KEY nu este setată!")

genai.configure(api_key=GEMINI_API_KEY)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
if not YOUTUBE_API_KEY:
    raise ValueError("Cheia YOUTUBE_API_KEY nu este setată!")

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
REQUEST_TIMEOUT = 10

# ================== TOOL ==================

def _offline_fallback(style: str, reason: str) -> Dict[str, Any]:
    """
    Returnează date mock astfel încât agentul să poată funcționa
    atunci când nu avem acces la API-ul YouTube (de ex. offline / sandbox).
    """
    sample_videos = [
        {
            "video_id": "mock1",
            "title": f"{style.title()} capsule wardrobe lookbook",
            "channel": "Fashion Lab",
            "url": "https://www.youtube.com/watch?v=mock1",
            "view_count": 125000,
            "published_at": "2024-02-10T00:00:00Z",
        },
        {
            "video_id": "mock2",
            "title": f"{style.title()} essentials & styling tips",
            "channel": "Style Notes",
            "url": "https://www.youtube.com/watch?v=mock2",
            "view_count": 82000,
            "published_at": "2024-01-15T00:00:00Z",
        },
        {
            "video_id": "mock3",
            "title": f"Top 5 {style} outfit ideas for 2024",
            "channel": "Urban Vogue",
            "url": "https://www.youtube.com/watch?v=mock3",
            "view_count": 54000,
            "published_at": "2023-12-05T00:00:00Z",
        },
    ]

    return {
        "style": style,
        "videos": sample_videos,
        "note": f"Date mock (nu am putut accesa API-ul YouTube: {reason})",
    }


def get_fashion_youtube_trends(
    style: str,
    max_results: int = 8,
    region_code: str = "US",
) -> Dict[str, Any]:

    print(f"[TOOL] get_fashion_youtube_trends(style={style})")

    query = f"{style} fashion outfit ideas"

    try:
        max_results_int = max(1, int(max_results))
    except (TypeError, ValueError):
        max_results_int = 5

    search_params = {
        "key": YOUTUBE_API_KEY,
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": max_results_int,
        "regionCode": region_code,
        "safeSearch": "moderate",
        "order": "relevance",
    }

    try:
        search_resp = requests.get(
            YOUTUBE_SEARCH_URL, params=search_params, timeout=REQUEST_TIMEOUT
        )
        search_resp.raise_for_status()
        items = search_resp.json().get("items", [])
    except requests.RequestException as exc:
        print(f"[WARN] Nu putem interoga YouTube Search API: {exc}")
        return _offline_fallback(style, "eroare conexiune search")

    if not items:
        return _offline_fallback(style, "nu am găsit rezultate")

    video_ids = [item["id"]["videoId"] for item in items]

    videos_params = {
        "key": YOUTUBE_API_KEY,
        "part": "statistics",
        "id": ",".join(video_ids),
    }

    try:
        videos_resp = requests.get(
            YOUTUBE_VIDEOS_URL, params=videos_params, timeout=REQUEST_TIMEOUT
        )
        videos_resp.raise_for_status()
        videos_data = videos_resp.json()
    except requests.RequestException as exc:
        print(f"[WARN] Nu putem interoga YouTube Videos API: {exc}")
        return _offline_fallback(style, "eroare conexiune detalii video")

    stats_by_id = {
        item["id"]: item.get("statistics", {}) for item in videos_data.get("items", [])
    }

    results = []
    for item in items:
        vid = item["id"]["videoId"]
        snippet = item["snippet"]
        stats = stats_by_id.get(vid, {})

        view_count_raw = stats.get("viewCount", 0)
        try:
            view_count = int(view_count_raw or 0)
        except (TypeError, ValueError):
            view_count = 0

        results.append({
            "video_id": vid,
            "title": snippet.get("title"),
            "channel": snippet.get("channelTitle"),
            "url": f"https://www.youtube.com/watch?v={vid}",
            "view_count": view_count,
            "published_at": snippet.get("publishedAt"),
        })

    results.sort(key=lambda v: v["view_count"], reverse=True)

    return {
        "style": style,
        "videos": results,
        "note": "videouri găsite"
    }


# ================== AGENT CONFIG ==================

SYSTEM_PROMPT = """
Ești AI “Fashion & YouTube Trend Assistant”.
Folosești tool-ul get_fashion_youtube_trends pentru:
- a aduna videouri YouTube relevante
- a identifica trenduri
- a recomanda outfituri
- a da linkuri pentru redare

Răspuns structurat:
1) Rezumat trend
2) Idei de outfit-uri
3) Videouri recomandate: Titlu + Canal + Link + Popularitate
"""

tools_list = [
    get_fashion_youtube_trends
]

model = genai.GenerativeModel(
    model_name="models/gemini-2.5-flash",
    tools=tools_list,
    system_instruction=SYSTEM_PROMPT,
)


# ================== CORE RUNNER ==================

def run_fashion_agent(user_message: str) -> str:

    chat = model.start_chat()
    response = chat.send_message(user_message)

    parts = response.candidates[0].content.parts
    part = parts[0]

    while getattr(part, "function_call", None):
        func = part.function_call
        args = dict(func.args)

        print(f"[AGENT] Gemini cere apelarea: {func.name}(**{args})")

        result = get_fashion_youtube_trends(**args)

        response = chat.send_message(
            content=[
                protos.Part(
                    function_response=protos.FunctionResponse(
                        name=func.name,
                        response={"result": result},
                    )
                )
            ]
        )

        parts = response.candidates[0].content.parts
        part = parts[0]

    return part.text