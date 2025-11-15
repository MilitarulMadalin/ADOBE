"""
agent_trend_gemini.py

Exemplul tău, adaptat pentru Google Gemini.
- Folosește biblioteca `google-generativeai`.
- Folosește "automatic function calling" (mult mai simplu).
"""

import google.generativeai as genai
from google.generativeai import protos
import json
import os

# ================== CONFIG ==================

# !!! setează-ți cheia de API înainte de rulare:
# export GOOGLE_API_KEY="CHEIA_TA_GEMINI_DE_LA_AI_STUDIO"

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("Cheia GOOGLE_API_KEY nu este setată în variabilele de mediu!")

genai.configure(api_key=api_key)

# ================== TOOL-URI (FUNCȚII PYTHON) ==================
# (Acestea rămân EXACT la fel ca în codul tău original)

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
#
# Spre deosebire de OpenAI, NU mai este nevoie de lista JSON manuală.
# Vom da bibliotecii Gemini direct funcțiile Python.
#
tools_list = [
    get_social_trends, 
    analyze_price_psychology, 
    send_trend_report_email
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

# ================== INIȚIALIZARE MODEL GEMINI ==================

# Inițializăm modelul și îi dăm direct lista de funcții Python
# și instrucțiunile de sistem (system prompt).
model = genai.GenerativeModel(
    # LINIA CORECTĂ:
	model_name='models/gemini-2.5-flash',
    tools=tools_list,
    system_instruction=SYSTEM_PROMPT
)

# ================== LOOP SIMPLU AGENT (GEMINI) ==================

def _extract_relevant_part(response):
    """
    Returns either the function-call part or the first textual part.
    Gemini may return zero candidates (safety blocks) so we guard against that.
    """
    if not response.candidates:
        raise RuntimeError("Gemini nu a returnat niciun răspuns.")

    candidate = response.candidates[0]
    parts = getattr(candidate.content, "parts", None) or []
    if not parts:
        raise RuntimeError("Gemini nu conține părți procesabile.")

    for part in parts:
        if getattr(part, "function_call", None):
            return part
    return parts[0]


def run_agent_gemini(user_message: str):
    """
    Rulează agentul folosind un chat session cu Gemini.
    Gemini poate face "automatic function calling" dacă pornim
    un chat, dar pentru a demonstra logica ta de agent (pas cu pas),
    vom face bucla manuală.
    """
    
    # 1. Pornim un chat pentru a menține contextul
    chat = model.start_chat()
    
    # 2. Trimitem primul mesaj al utilizatorului
    response = chat.send_message(user_message)
    message_part = _extract_relevant_part(response)
    
    # 3. Bucla de "tool calling"
    # Cât timp modelul cere să apeleze funcții...
    while getattr(message_part, "function_call", None):
        function_call = message_part.function_call
        function_name = function_call.name
        args = dict(function_call.args)

        print(f"[TOOL] Gemini cere apelarea: {function_name}(**{args})")

        # Apelăm funcția Python corespunzătoare
        if function_name == "get_social_trends":
            result = get_social_trends(**args)
        elif function_name == "analyze_price_psychology":
            result = analyze_price_psychology(**args)
        elif function_name == "send_trend_report_email":
            result = send_trend_report_email(**args)
        else:
            raise ValueError(f"Tool necunoscut cerut de Gemini: {function_name}")

        # 4. Trimitem rezultatul funcției înapoi la Gemini
        response = chat.send_message(
            content=[
                # Folosim un "FunctionResponse" special
                protos.Part(
                    function_response=protos.FunctionResponse(
                        name=function_name,
                        response={"result": result} # Gemini așteaptă rezultatul într-un dict
                    )
                )
            ]
        )
        message_part = _extract_relevant_part(response)
        
    # 5. Modelul a terminat de apelat tool-uri și are un răspuns final (text)
    return message_part.text


# ================== DEMO ==================

if __name__ == "__main__":
    # Exemplu de query al utilizatorului (același ca al tău):
    user_query = (
        "Analizează trendurile pentru moda streetwear și spune-mi dacă "
        "merită să cumpăr acum sneakers albi minimalisti. "
        "Dacă ai un raport clar, pregătește-l ca pentru email (fără să-l trimiți neapărat)."
    )

    answer = run_agent_gemini(user_query)
    print("\n=========== RĂSPUNS AGENT (GEMINI) ===========\n")
    print(answer)
    print("\n==============================================\n")
