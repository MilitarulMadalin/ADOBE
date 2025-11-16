#!/usr/bin/env python3
"""Generate a fresh STYLX newsletter using the latest Stats.md table."""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent
STATS_PATH = PROJECT_ROOT / "Stats.md"
NEWSLETTER_PATH = PROJECT_ROOT / "Newsletter.md"
DEFAULT_MODEL = "gemini-2.5-flash"
GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1/models/{model}:generateContent?key={key}"
)

load_dotenv(PROJECT_ROOT / ".env")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    print("ERROR: GOOGLE_API_KEY missing. Add it to .env or the environment.")
    sys.exit(1)

if not STATS_PATH.exists():
    print(f"ERROR: Stats file not found at {STATS_PATH}.")
    sys.exit(1)

stats_markdown = STATS_PATH.read_text(encoding="utf-8").strip()
if not stats_markdown:
    print("ERROR: Stats.md is empty. Run view_trends.py first.")
    sys.exit(1)

def build_prompt(table_markdown: str) -> str:
    return "\n\n".join(
        [
            "Ai următoarele date despre trendurile actuale din fashion:",
            table_markdown,
            (
                "Compune în limba română un newsletter premium intitulat \"STYLX Fashion Pulse\". "
                "Include o introducere scurtă, 3-4 insight-uri bullet, un plan de acțiune "
                "(bullet numerotate) și un îndemn final. Folosește cifrele exacte din tabel, "
                "păstrând un ton profesionist și orientat spre modă."
            ),
            "Nu menționa în text sursa datelor sau faptul că provin dintr-un fișier.",
            "Nu folosi cuvântul 'copilot' în conținut sau semnături.",
        ]
    )

def call_gemini(prompt: str, model: str = DEFAULT_MODEL) -> str:
    endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=model, key=GOOGLE_API_KEY)
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "You are STYLX, un consultant dedicat exclusiv modei și stylingului."},
                    {"text": prompt},
                ],
            }
        ]
    }

    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read().decode("utf-8")

    try:
        result = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON response: {exc}\n{body}") from exc

    parts = (
        result.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "\n".join(part.get("text", "").strip() for part in parts if part.get("text"))
    if not text:
        raise RuntimeError(f"Gemini response missing content: {result}")
    return text


def main() -> None:
    prompt = build_prompt(stats_markdown)
    print("Generating newsletter via Gemini...", end=" ")
    try:
        generated_text = call_gemini(prompt)
    except Exception as exc:  # noqa: BLE001 – surface exact failure reason
        print("FAILED")
        print(exc)
        sys.exit(1)

    today = datetime.now().strftime("%d %B %Y")
    header = f"## STYLX Fashion Pulse — {today}\n\n"
    newsletter_body = generated_text.strip()
    NEWSLETTER_PATH.write_text(header + newsletter_body + "\n", encoding="utf-8")
    print("DONE")
    print(f"Newsletter updated at {NEWSLETTER_PATH}")


if __name__ == "__main__":
    main()
