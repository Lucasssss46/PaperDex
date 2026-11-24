# Immagine del backend per il deploy di prova (Koyeb o simili). Il contesto
# di build è la radice del repository, perché il codice si importa come
# pacchetto `backend.app`. Il frontend non è qui: è un sito statico a parte.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend

# La piattaforma assegna la porta con PORT. --proxy-headers fa leggere a
# uvicorn X-Forwarded-Proto dal proxy della piattaforma: senza, request.base_url
# sarebbe http:// e l'URL delle immagini profilo verrebbe bloccato dal browser
# come contenuto misto su una pagina https.
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
