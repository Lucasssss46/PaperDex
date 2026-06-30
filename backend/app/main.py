from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.database import init_db
from app.routes.utenti import router as utenti_router

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

app.include_router(utenti_router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)