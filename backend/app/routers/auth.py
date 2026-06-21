from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.student import Student

router = APIRouter(prefix="/auth", tags=["auth"])

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

ACCESS_TTL = timedelta(hours=24)
ALGORITHM = "HS256"


def _hash(password: str) -> str:
    return _pwd.hash(password)


def _verify(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def _make_token(student_id: str) -> str:
    expire = datetime.now(timezone.utc) + ACCESS_TTL
    return jwt.encode(
        {"sub": student_id, "exp": expire}, settings.SECRET_KEY, algorithm=ALGORITHM
    )


class RegisterRequest(BaseModel):
    email: str
    password: str
    school_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> dict:
    existing = await db.execute(select(Student).where(Student.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    student = Student(
        email=body.email,
        password_hash=_hash(body.password),
        school_id=body.school_id,
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return {"access_token": _make_token(str(student.id))}


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)
) -> dict:
    result = await db.execute(select(Student).where(Student.email == form.username))
    student = result.scalar_one_or_none()
    if not student or not student.password_hash or not _verify(form.password, student.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": _make_token(str(student.id))}


@router.post("/refresh", response_model=TokenResponse)
async def refresh(token: str = Depends(_oauth2)) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        student_id: str = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return {"access_token": _make_token(student_id)}
