from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])

# POST /auth/register  — create account with email + password
# POST /auth/login     — issue JWT access + refresh tokens
# POST /auth/refresh   — rotate refresh token
# POST /auth/logout    — revoke refresh token
