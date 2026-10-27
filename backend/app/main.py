from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from backend.app.database import init_db
from backend.app.routes.utenti import router as utenti_router
from backend.app.routes.inviti import router as inviti_router
from backend.app.routes.keywords import router as keywords_router
from backend.app.routes.ricerca import router as ricerca_router
from backend.app.routes.ricerche import router as ricerche_router

# Definisci il context manager per il ciclo di vita
@asynccontextmanager
async def lifespan(app: FastAPI):
    # avvio
    await init_db()
    print("Database connesso!")
    
    yield
    
    # chiusura
    print("App in chiusura, pulizia in corso...")

app = FastAPI(lifespan=lifespan)

# Origine del server di sviluppo Vite: senza CORS il browser blocca le
# chiamate del frontend all'API (origini diverse: 5173 vs 8000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Di default il browser nasconde a fetch() ogni header di risposta che
    # non sia nella lista "safe" del CORS: Content-Disposition non c'è, e
    # senza questa riga il frontend non potrebbe leggere il nome file
    # suggerito dal backend per un export scaricato (vedi /ricerche/{id}/export).
    expose_headers=["Content-Disposition"],
)

app.include_router(utenti_router, prefix="/api")
app.include_router(inviti_router, prefix="/api")
app.include_router(keywords_router, prefix="/api")
app.include_router(ricerca_router, prefix="/api")
app.include_router(ricerche_router, prefix="/api")

# File caricati dagli utenti (per ora solo le immagini profilo). Sotto /api
# per restare dietro allo stesso prefisso di tutto il resto dell'API.
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)