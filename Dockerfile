# ---- STAGE 1: Build environment ----
FROM python:3.10-slim

# Setăm workdir
WORKDIR /app

# Copiem requirements
COPY requirements.txt .

# Instalăm dependențele
RUN pip install --no-cache-dir -r requirements.txt

# Copiem restul codului
COPY . .

# Expunem portul FastAPI
EXPOSE 8000

# Comanda de start pentru server
CMD ["uvicorn", "fashion_youtube_api:app", "--host", "0.0.0.0", "--port", "8000"]