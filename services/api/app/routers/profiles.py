"""Endpoints del perfil del usuario autenticado (solo el propio)."""
from fastapi import APIRouter, Depends, HTTPException

from app.auth_models import Profile, ProfileUpdate
from app.deps import get_current_user
from app.services.profiles import get_profile_by_user_id, update_profile

router = APIRouter(prefix="/profiles", tags=["profiles"])

PROFILE_NOT_FOUND = "Perfil no encontrado"


@router.get("/me", response_model=Profile)
def read_my_profile(current_user: dict = Depends(get_current_user)):
    profile = get_profile_by_user_id(current_user["id"])
    if profile is None:
        raise HTTPException(status_code=404, detail=PROFILE_NOT_FOUND)
    return Profile(**profile)


@router.put("/me", response_model=Profile)
def edit_my_profile(payload: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    profile = update_profile(current_user["id"], payload)
    if profile is None:
        raise HTTPException(status_code=404, detail=PROFILE_NOT_FOUND)
    return Profile(**profile)
