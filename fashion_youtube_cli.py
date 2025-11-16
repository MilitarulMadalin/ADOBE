import argparse
from fashion_youtube_agent_core import run_fashion_agent

def main():
    parser = argparse.ArgumentParser(
        description="Fashion & YouTube Trend Agent (CLI Version)"
    )
    parser.add_argument(
        "--style",
        type=str,
        required=True,
        help="Stilul vestimentar pentru analiză, ex: streetwear, minimalist, techwear"
    )

    args = parser.parse_args()
    style_query = (
        f"Analizează trendurile de fashion pentru stilul '{args.style}' "
        f"și dă-mi idei de outfit + videouri YouTube relevante."
    )

    print("🔍 Analizăm trendurile... așteaptă...\n")
    answer = run_fashion_agent(style_query)
    print("========== REZULTAT ==========\n")
    print(answer)
    print("\n===============================\n")

if __name__ == "__main__":
    main()