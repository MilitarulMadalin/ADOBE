# STYLX — Fashion Trend Agent

**Adobe Innovate4AI · Hackathon Project**

A lightweight, research-driven prototype that detects emerging fashion trends from video platforms and generates personalized, actionable recommendations for consumers and brands. Built during Adobe Innovate4AI, *STYLX* helps users avoid impulse buys tied to short-lived hype and discover styles that match their taste and long-term wardrobe goals.

## Problem Statement

Fashion moves fast. Every day new styles appear across social media and video platforms — many are temporary hypes, others become lasting trends. Consumers often:

* Buy items that go out of style within months.
* Struggle to distinguish short-term hype from lasting trends.
* Receive generic product suggestions that don't reflect their personal style.

STYLX aims to reduce these friction points by identifying trends early, evaluating their staying power, and delivering personalized outfit suggestions and shopping recommendations.

## Key Concepts & Value Proposition

* **Early Trend Detection**: Monitor video platforms at scale to surface trends before they become mainstream.
* **Signal vs Noise**: Use heuristics and LLM/ML scoring to separate ephemeral viral content from signals with potential longevity.
* **Personalized Recommendations**: Match trending items to user style profiles, wardrobes, and purchase history — reducing wasteful purchases.
* **Actionable Alerts**: Customizable notifications (email/web) when a watched trend shows signs of wider adoption.

## Features

* Data collection from multiple platforms (YouTube prototype + future platform integrations)
* Video transcript extraction and keyword / visual-cue parsing
* Trend detection logic with emerging-trend scoring
* LLM-based enrichment (Gemini) for semantic understanding and suggestion generation
* Outfit suggestion engine that combines existing wardrobe items with trending pieces
* User-configurable alerting (email)
* Extensible architecture for brand integrations and e‑commerce recommendations

## Architecture

The diagram above shows the core flow: user idea → define niche → configure APIs → YouTube scraper agent → raw data storage → trend detection → LLM/ML processing (Gemini) → recommendations & alerts.

**Components**

* **Scraper Agent**: Collects video metadata, captions/transcripts, comments, timestamps, and thumbnails.
* **Storage**: Time-series optimized DB for trend signals + document DB for transcripts and enriched metadata.
* **Trend Detector**: Signal processing and rule-based heuristics to cluster and score emerging patterns.
* **LLM/ML Layer**: Uses LLMs (Gemini) for context, paraphrase clustering, and to generate natural-language suggestions.
* **API & Frontend**: Lightweight endpoints for user management, alert configuration, and delivering outfit suggestions.

## How It Works (concise)

1. **Define niche/channels** — pick fashion verticals (e.g., streetwear, sustainable fashion).
2. **Collect data** — scrape video metadata and transcripts periodically.
3. **Preprocess** — normalize text, extract entities, detect visual cues from thumbnails.
4. **Detect trends** — compute momentum, diversity of sources, cross-platform signals, and longevity score.
5. **Enrich & Recommend** — LLM infers style attributes and maps them to user profiles; outfit suggestions are generated.
6. **Alert & Action** — user gets an email when a tracked trend reaches a configured threshold.

## Roadmap

* Integrate data from more platforms (Instagram, TikTok, Pinterest).
* Send personalized email alerts when a selected trend is about to become popular.
* Generate outfit suggestions based on a user’s existing wardrobe and current trends.
* Recommend purchases for new garments tailored to the user’s style and trend evolution.
* Improve success rate by using accurate video transcriptions and multimodal signals (vision + text).

## Tech Stack

* Scrapers: Python (requests/Playwright) or Go
* DB: PostgreSQL + TimescaleDB / MongoDB for documents
* ML / LLM: Google Gemini (via API) for semantic enrichment; lightweight ML for scoring
* Infrastructure: Docker, CI/CD, serverless functions for scrapers and alerts
* Frontend: React + Tailwind for quick prototyping
