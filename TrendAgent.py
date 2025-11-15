"""
agent_trend.py

Un exemplu simplu de:
- AGENT AI (Trend & Purchase Intelligence Agent)
- model predefinit OpenAI (GPT-4.1)
- tool calling (modelul apelează funcții Python)
"""

from openai import OpenAI
import json
import os

# ================== CONFIG ==================

# !!! setează-ți cheia de API înainte de rulare:
# export OPENAI_API_KEY="CHEIA_TA"
client = OpenAI(api_key=os.getenv("sk-proj-hqUFtfqq3LAri4j4gWSQhqvN1ZmDCG9JV9JT_glXxrMif-S_aXQ1lceUeDWLY8Gm_\
ATjVvKKYDT3BlbkFJLhUAKM0RtcH12P2xujBhsjKCSh_gQ461GmAWzsYGjTpI8ZLhmkHF_YJ_J01Zj9QRjpop7_XUgA"))

# ================== TOOL-URI (FUNCȚII PYTHON) ==================

def get_social_trends(topic: str, timeframe: str = "7d"):
    """
    MOCK: În realitate, aici ai conecta:
    - API TikTok / YouTube / Instagram / X
    - sau BAZA TA DE DATE cu trenduri

    Returnăm ceva hardcodat doar ca exemplu.
    """
    print(f"[TOOL] get_social_trends(topic={topic}, timeframe={timeframe})")

    return {
        "topic": topic,
        "timeframe": timeframe,
        "growth_percent": 47.3,
        "sentiment": "pozitiv",
        "status": "exploding",
        "top_examples": [
            {
                "title": "Streetwear oversized hoodie + cargo pants",
                "platform": "TikTok",
                "engagement": "high",
            },
            {
                "title": "Sneakers minimalisti albi + outfit casual",
                "platform": "Instagram",
                "engagement": "medium-high",
            },
        ],
    }


def analyze_price_psychology(product_name: str):
    """
    MOCK: Aici ai analiza:
    - istoric preț
    - discount-uri false
    - prețuri de ancorare etc.
    """
    print(f"[TOOL] analyze_price_psychology(product_name={product_name})")

    return {
        "product": product_name,
        "is_overpriced": False,
        "psychological_tricks": [
            "preț terminat în .99",
            "preț comparat cu un model mai scump în pagină",
        ],
        "recommendation": "preț ok, poate fi cumpărat dacă este în buget",
    }


def send_trend_report_email(user_email: str, subject: str, html_content: str):
    """
    MOCK: În viața reală ai folosi:
    - SendGrid / Mailgun / SMTP

    Aici doar printăm ca demo.
    """
    print(f"[TOOL] send_trend_report_email(to={user_email}, subject={subject})")
    print("=== EMAIL CONTENT START ===")
    print(html_content)
    print("=== EMAIL CONTENT END ===")

    return {"status": "sent_mock", "to": user_email, "subject": subject}


# ================== DESCRIERE TOOL-URI PENTRU LLM ==================

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_social_trends",
            "description": "Returnează trenduri de pe social media pentru un anumit topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "Subiectul/trendul de analizat, ex: 'streetwear', 'sneakers', 'smartphones'.",
                    },
                    "timeframe": {
                        "type": "string",
                        "description": "Interval de timp, ex: '24h', '7d', '30d'.",
                        "default": "7d",
                    },
                },
                "required": ["topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_price_psychology",
            "description": "Analiză psihologică de preț pentru un produs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {
                        "type": "string",
                        "description": "Numele produsului sau descrierea lui.",
                    }
                },
                "required": ["product_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_trend_report_email",
            "description": "Trimite un raport pe email utilizatorului.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "subject": {"type": "string"},
                    "html_content": {"type": "string"},
                },
                "required": ["user_email", "subject", "html_content"],
            },
        },
    },
]

# ================== SYSTEM PROMPT (ROLUL AGENTULUI) ==================

SYSTEM_PROMPT = """
Ești AI “Personal Trend & Purchase Intelligence Agent”.

Rolul tău:
- Analizezi trenduri de pe social media folosind tool-urile disponibile.
- Evaluezi psihologia prețului și momentul de cumpărare.
- Generezi rapoarte clare, structurate, pentru utilizator.
- Poți trimite rapoarte prin email folosind tool-ul dedicat.

Când ai nevoie de date reale, folosește funcțiile (tool-urile).
Răspunde structurat și explică pe scurt de ce ai luat o decizie.
"""


# ================== DISPECER PENTRU TOOL-CALLS ==================

def call_tool(tool_call):
    """
    Primește un tool_call din răspunsul LLM și apelează funcția Python corespunzătoare.
    """
    function_name = tool_call.function.name
    arguments = json.loads(tool_call.function.arguments or "{}")

    if function_name == "get_social_trends":
        return get_social_trends(**arguments)
    elif function_name == "analyze_price_psychology":
        return analyze_price_psychology(**arguments)
    elif function_name == "send_trend_report_email":
        return send_trend_report_email(**arguments)
    else:
        raise ValueError(f"Tool necunoscut: {function_name}")


# ================== LOOP SIMPLU AGENT ==================

def run_agent(user_message: str):
    """
    Rulează agentul:
    1. Trimite input-ul utilizatorului + system prompt + tools.
    2. Dacă modelul cere tool-uri, le apelăm și trimitem din nou rezultatele.
    3. Returnăm răspunsul final.
    """

    # Primul apel: modelul decide dacă are nevoie de tool-uri
    first_response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        tools=tools,
        tool_choice="auto",
    )

    message = first_response.choices[0].message

    # Dacă modelul nu vrea tool-uri, răspundem direct
    if not message.tool_calls:
        return message.content

    # Dacă modelul vrea tool-uri:
    tool_results_messages = []

    for tool_call in message.tool_calls:
        result = call_tool(tool_call)
        # pregătim mesaj de tip tool pentru al doilea apel
        tool_results_messages.append(
            {
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_call.function.name,
                "content": json.dumps(result, ensure_ascii=False),
            }
        )

    # Al doilea apel: modelul primește output-ul tool-urilor și generează răspunsul final
    second_response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
            {
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": message.tool_calls,
            },
            *tool_results_messages,
        ],
    )

    final_message = second_response.choices[0].message
    return final_message.content


# ================== DEMO ==================

if __name__ == "__main__":
    # Exemplu de query al utilizatorului:
    user_query = (
        "Analizează trendurile pentru moda streetwear și spune-mi dacă "
        "merită să cumpăr acum sneakers albi minimalisti. "
        "Dacă ai un raport clar, pregătește-l ca pentru email (fără să-l trimiți neapărat)."
    )

    answer = run_agent(user_query)
    print("\n=========== RĂSPUNS AGENT ===========\n")
    print(answer)
    print("\n=====================================\n")
