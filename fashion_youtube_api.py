from fastapi import FastAPI
from pydantic import BaseModel
from fashion_youtube_agent_core import run_fashion_agent

app = FastAPI(
    title="Fashion & YouTube Trend Agent API",
    description="API pentru analiză fashion + videouri YouTube relevante",
    version="1.0.0",
)

@app.get("/")
async def root():
    return {
        "message": "Fashion & YouTube Trend Agent API este activ.",
        "usage": "Trimiteți POST la /analyze-fashion cu {'style': 'streetwear'}",
        "docs": "/docs"
    }

class FashionRequest(BaseModel):
    style: str

class FashionResponse(BaseModel):
    result: str

@app.post("/analyze-fashion", response_model=FashionResponse)
async def analyze_fashion(req: FashionRequest):
    query = (
        f"Analizează trendurile pentru stilul '{req.style}' "
        f"și generează idei de outfit + videouri YouTube."
    )
    result = run_fashion_agent(query)
    return FashionResponse(result=result)
