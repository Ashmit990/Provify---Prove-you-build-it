from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from app.core.database import supabase
from fastapi import Depends
from app.api.dependencies import get_current_user

router = APIRouter()


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/signup")
async def signup(req: SignUpRequest):
    try:
        response = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {
                "data": {"full_name": req.full_name}
            }
        })
        if response.user is None:
            raise HTTPException(status_code=400, detail="Signup failed")

        return {
            "message": "Account created successfully",
            "user_id": str(response.user.id),
            "email": response.user.email
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/signin")
async def signin(req: SignInRequest):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })
        if response.user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user_id": str(response.user.id),
            "email": response.user.email,
            "full_name": response.user.user_metadata.get("full_name", "")
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/signout")
async def signout(req: SignInRequest):
    try:
        supabase.auth.sign_out()
        return {"message": "Signed out successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/profile")
async def get_profile(current_user=Depends(get_current_user)):
    try:
        result = supabase.table("profiles").select("*").eq("id", current_user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/health")
async def auth_health():
    return