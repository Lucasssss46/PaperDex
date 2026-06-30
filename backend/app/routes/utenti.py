from beanie.operators import Or
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from app.models import UserCreate, User 
from jose import jwt

load_dotenv()

router = APIRouter()

@router.post("/users")
async def subscribe(data: UserCreate):
    # Factory Method
    new_user = User.toDocument(data)
    
    # Salvataggio
    await new_user.insert()
    
    return {"message": f"Utente {new_user.name} creato con successo!"}



@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # 1. Trova l'utente
    user = await User.find_one(Or(User.email == form_data.username, User.name == form_data.username))
    
    # 2. Verifica utente e password
    if not user or not user.verify_password(form_data.password):
      raise HTTPException(status_code=400, detail="Email o password errati")
    
    # 3. Crea il Token (semplificato)
    to_encode = {"sub": user.email}
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    
    token = jwt.encode(to_encode, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))
    
    return {"access_token": token, "token_type": "bearer"}