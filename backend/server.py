from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import random
import secrets
import hashlib
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from email_service import send_otp, send_password_reset, send_admin_decision, send_key_granted

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)

# ---------------- Config ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24
REFRESH_TOKEN_DAYS = 7

ALLOWED_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "iastate.edu").lower()
TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "America/Chicago"))
SERVER_DAILY_LIMIT = int(os.environ.get("SERVER_DAILY_LIMIT", "5"))
USER_DAILY_LIMIT = int(os.environ.get("USER_DAILY_LIMIT", "1"))
ADMIN_DAILY_LIMIT = int(os.environ.get("ADMIN_DAILY_LIMIT", "5"))
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@iastate.edu").lower()
OTP_TTL_MIN = int(os.environ.get("OTP_TTL_MIN", "10"))
RESET_TTL_MIN = int(os.environ.get("RESET_TTL_MIN", "60"))
CHAMPION_THRESHOLD = int(os.environ.get("PILLAR_THRESHOLD", os.environ.get("CHAMPION_THRESHOLD", "15")))
PILLAR_THRESHOLD = CHAMPION_THRESHOLD
APP_ENV = os.environ.get("APP_ENV", "dev").lower()
DEV_MODE = APP_ENV != "prod"

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="5P (Five Posts) API")
app.state.limiter = limiter


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."},
    )

app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("5p")


# ---------------- Time / Crypto ----------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_local() -> datetime:
    return datetime.now(TZ)


def today_key(dt: Optional[datetime] = None) -> str:
    dt = dt or now_local()
    return dt.astimezone(TZ).strftime("%Y-%m-%d")


def day_start_local(date_key: str) -> datetime:
    y, m, d = map(int, date_key.split("-"))
    return datetime(y, m, d, 0, 0, 0, tzinfo=TZ)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(uid: str, email: str) -> str:
    return jwt.encode(
        {"sub": uid, "email": email, "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_MINUTES), "type": "access"},
        get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    return jwt.encode(
        {"sub": uid, "exp": now_utc() + timedelta(days=REFRESH_TOKEN_DAYS), "type": "refresh"},
        get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                    max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                    max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "nickname": u.get("nickname") or u["email"].split("@")[0],
        "gate": u.get("gate", "invite"),
        "is_admin": u.get("is_admin", False),
        "status": u.get("status", "active"),
        "key_granted": u.get("key_granted", False),
        "created_at": u["created_at"],
    }


def derive_nickname(email: str) -> str:
    return email.split("@")[0][:24]


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def gen_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def gen_recommendation_code() -> str:
    return "5P-" + secrets.token_hex(4).upper()


# ---------------- Auth deps ----------------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        u = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not u:
            raise HTTPException(401, "User not found")
        u.pop("password_hash", None)
        return u
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


async def require_active(user: dict = Depends(get_current_user)) -> dict:
    if user.get("status") != "active":
        raise HTTPException(403, f"Account status: {user.get('status')}. Not yet active.")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "관리자 권한이 필요합니다.")
    return user


# ---------------- Anonymous Handle ----------------
def anon_handle(user_id: str, conv_id: str) -> str:
    h = hashlib.sha256(f"{conv_id}:{user_id}".encode()).hexdigest()[:4].upper()
    return f"ANON-{h}"


# ---------------- Models ----------------
class RegisterIsuIn(BaseModel):
    email: EmailStr  # must be @iastate.edu
    password: str = Field(min_length=6, max_length=128)


class RegisterInviteIn(BaseModel):
    email: EmailStr  # any domain
    password: str = Field(min_length=6, max_length=128)
    recommendation_code: str = Field(min_length=4, max_length=40)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class VerifyOtpIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


class PostIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=3000)


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=800)
    as_admin: bool = False


class MessageIn(BaseModel):
    recipient_id: str
    content: str = Field(min_length=1, max_length=2000)


class AdminBoostIn(BaseModel):
    boost: int = Field(ge=0, le=10000)


def email_allowed(email: str) -> bool:
    return email.lower().endswith(f"@{ALLOWED_DOMAIN}")


# ---------------- Recommendation Keys ----------------
async def consume_recommendation_code(code: str, used_by_id: str) -> dict:
    code = code.strip().upper()
    key = await db.recommendation_keys.find_one({"code": code}, {"_id": 0})
    if not key:
        raise HTTPException(400, "유효하지 않은 추천 키입니다.")
    if key.get("used"):
        raise HTTPException(400, "이미 사용된 추천 키입니다.")
    # owner must be active or admin
    owner = await db.users.find_one({"id": key["owner_id"]}, {"_id": 0})
    if not owner or (owner.get("status") != "active" and not owner.get("is_admin")):
        raise HTTPException(400, "추천인의 자격이 만료되었습니다.")
    await db.recommendation_keys.update_one(
        {"code": code, "used": False},
        {"$set": {"used": True, "used_by_id": used_by_id, "used_at": now_utc().isoformat()}},
    )
    return key


async def mint_key(owner_id: str, source: str = "pillar") -> dict:
    code = gen_recommendation_code()
    doc = {
        "code": code,
        "owner_id": owner_id,
        "used": False,
        "used_by_id": None,
        "used_at": None,
        "source": source,
        "created_at": now_utc().isoformat(),
    }
    await db.recommendation_keys.insert_one(dict(doc))
    return doc


# ---------------- Auth Endpoints ----------------
async def _issue_otp(uid: str, email: str):
    code = gen_otp()
    await db.email_otps.delete_many({"user_id": uid})
    await db.email_otps.insert_one({
        "user_id": uid,
        "code_hash": hash_otp(code),
        "expires_at": (now_utc() + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
        "attempts": 0,
        "created_at": now_utc().isoformat(),
    })
    await send_otp(email, code)
    if DEV_MODE:
        logger.info(f"OTP for {email} (dev): {code}")


async def _log_invite(invited: dict, recommender: Optional[dict], gate: str):
    await db.invite_logs.insert_one({
        "id": str(uuid.uuid4()),
        "invited_user_id": invited["id"],
        "invited_email": invited["email"],
        "invited_nickname": invited.get("nickname"),
        "gate": gate,
        "recommender_id": recommender["id"] if recommender else None,
        "recommender_email": recommender["email"] if recommender else None,
        "recommender_nickname": recommender.get("nickname") if recommender else None,
        "joined_at": now_utc().isoformat(),
    })


@api.post("/auth/register/isu")
@limiter.limit("5/minute")
async def register_isu(request: Request, body: RegisterIsuIn, response: Response):
    """Gate A — ISU email only, OTP verification, auto-active after OTP."""
    email = body.email.lower().strip()
    if not email_allowed(email):
        raise HTTPException(403, f"@{ALLOWED_DOMAIN} 이메일만 ISU 게이트로 가입할 수 있습니다. 일반 이메일은 초대장(추천 키) 게이트를 이용해주세요.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "이미 가입된 이메일입니다.")

    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": email, "nickname": derive_nickname(email),
        "password_hash": hash_password(body.password),
        "is_admin": False, "gate": "isu",
        "status": "pending_email", "email_verified_at": None,
        "key_granted": False, "recommended_by": None,
        "created_at": now_utc().isoformat(), "reviewed_at": None,
    }
    await db.users.insert_one(doc)
    await _issue_otp(uid, email)

    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"user": public_user(doc)}


@api.post("/auth/register/invite")
@limiter.limit("5/minute")
async def register_invite(request: Request, body: RegisterInviteIn, response: Response):
    """Gate B — Any email + recommendation key required. Skips OTP, goes to admin review."""
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "이미 가입된 이메일입니다.")

    uid = str(uuid.uuid4())
    key = await consume_recommendation_code(body.recommendation_code, uid)
    recommender = await db.users.find_one({"id": key["owner_id"]}, {"_id": 0})

    doc = {
        "id": uid, "email": email, "nickname": derive_nickname(email),
        "password_hash": hash_password(body.password),
        "is_admin": False, "gate": "invite",
        "status": "pending_review", "email_verified_at": None,
        "key_granted": False, "recommended_by": key["owner_id"],
        "created_at": now_utc().isoformat(), "reviewed_at": None,
    }
    await db.users.insert_one(doc)
    await _log_invite(doc, recommender, gate="invite")

    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"user": public_user(doc)}


@api.post("/auth/verify-otp")
async def verify_otp(body: VerifyOtpIn, user: dict = Depends(get_current_user)):
    if user.get("status") not in ("pending_email",):
        raise HTTPException(400, "이미 인증된 계정입니다.")
    rec = await db.email_otps.find_one({"user_id": user["id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "OTP가 발급되지 않았습니다. 재발송 해주세요.")
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        await db.email_otps.delete_many({"user_id": user["id"]})
        raise HTTPException(400, "OTP가 만료되었습니다. 재발송 해주세요.")
    if rec.get("attempts", 0) >= 5:
        raise HTTPException(429, "시도 횟수 초과. 재발송 해주세요.")
    if hash_otp(body.code.strip()) != rec["code_hash"]:
        await db.email_otps.update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "코드가 일치하지 않습니다.")

    await db.email_otps.delete_many({"user_id": user["id"]})
    # ISU gate auto-activates; invite gate requires admin review (but invite gate doesn't use OTP path)
    new_status = "active" if user.get("gate") == "isu" else "pending_review"
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"status": new_status, "email_verified_at": now_utc().isoformat(),
                  "reviewed_at": now_utc().isoformat() if new_status == "active" else None}},
    )
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if new_status == "active" and user.get("gate") == "isu":
        await _log_invite(fresh, None, gate="isu")
    return public_user(fresh)


@api.post("/auth/resend-otp")
async def resend_otp(user: dict = Depends(get_current_user)):
    if user.get("status") != "pending_email":
        raise HTTPException(400, "재발송할 수 없는 상태입니다.")
    code = gen_otp()
    await db.email_otps.delete_many({"user_id": user["id"]})
    await db.email_otps.insert_one({
        "user_id": user["id"],
        "code_hash": hash_otp(code),
        "expires_at": (now_utc() + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
        "attempts": 0,
        "created_at": now_utc().isoformat(),
    })
    await send_otp(user["email"], code)
    logger.info(f"OTP resend for {user['email']} (dev): {code}")
    return {"ok": True}


@api.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginIn, response: Response):
    email = body.email.lower().strip()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다.")
    set_auth_cookies(response, create_access_token(u["id"], u["email"]), create_refresh_token(u["id"]))
    return {"user": public_user(u)}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotIn):
    email = body.email.lower().strip()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    # silently succeed regardless to avoid enumeration
    if u:
        token = secrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "token": token,
            "user_id": u["id"],
            "expires_at": (now_utc() + timedelta(minutes=RESET_TTL_MIN)).isoformat(),
            "used": False,
            "created_at": now_utc().isoformat(),
        })
        await send_password_reset(email, token)
        logger.info(f"Password reset for {email} (dev token): {token}")
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    rec = await db.password_resets.find_one({"token": body.token, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "유효하지 않은 토큰입니다.")
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        raise HTTPException(400, "토큰이 만료되었습니다.")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_resets.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}


# ---------------- Daily State ----------------
async def get_or_create_daily_state(date_key: str) -> dict:
    state = await db.daily_state.find_one({"date_key": date_key}, {"_id": 0})
    if state:
        return state
    pillar_id = None
    yk = (datetime.strptime(date_key, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    yest_posts = await db.posts.find({"date_key": yk}, {"_id": 0}).to_list(50)
    if yest_posts:
        ranked = sorted(yest_posts, key=lambda p: total_likes_of(p), reverse=True)
        if ranked and total_likes_of(ranked[0]) > 0:
            pillar_id = ranked[0]["author_id"]
    start = day_start_local(date_key)
    offset = random.randint(0, 3599)
    unlock_at = start + timedelta(seconds=offset)
    state = {
        "date_key": date_key,
        "unlock_at": unlock_at.astimezone(timezone.utc).isoformat(),
        "pillar_id": pillar_id,
        "created_at": now_utc().isoformat(),
    }
    try:
        await db.daily_state.insert_one(dict(state))
    except Exception:
        existing = await db.daily_state.find_one({"date_key": date_key}, {"_id": 0})
        if existing:
            return existing
    return state


def total_likes_of(p: dict) -> int:
    return len(p.get("likes", [])) + int(p.get("boost_likes", 0) or 0)


async def server_post_count_today(date_key: str) -> int:
    return await db.posts.count_documents({"date_key": date_key})


async def user_posted_today(user_id: str, date_key: str) -> bool:
    return await db.posts.count_documents({"author_id": user_id, "date_key": date_key}) > 0


async def compute_status(user: dict) -> dict:
    dk = today_key()
    state = await get_or_create_daily_state(dk)
    server_count = await server_post_count_today(dk)
    is_admin = user.get("is_admin", False)
    is_pillar_today = state.get("pillar_id") == user["id"]
    user_done = await user_posted_today(user["id"], dk)
    n_utc = now_utc()
    unlock_at = datetime.fromisoformat(state["unlock_at"])
    if unlock_at.tzinfo is None:
        unlock_at = unlock_at.replace(tzinfo=timezone.utc)
    spectator = server_count >= SERVER_DAILY_LIMIT and not is_admin
    golden_hour_passed = n_utc >= unlock_at
    can_post_now = False
    block_reason = None
    if is_admin:
        admin_today = await db.posts.count_documents({"author_id": user["id"], "date_key": dk})
        can_post_now = admin_today < ADMIN_DAILY_LIMIT
        if not can_post_now:
            block_reason = "ADMIN_LIMIT"
    elif spectator:
        block_reason = "SERVER_FULL"
    elif user_done:
        block_reason = "USER_DONE"
    elif is_pillar_today:
        can_post_now = True
    elif not golden_hour_passed:
        block_reason = "GOLDEN_HOUR_LOCKED"
    else:
        can_post_now = True
    return {
        "today_key": dk,
        "now": n_utc.isoformat(),
        "unlock_at": unlock_at.isoformat(),
        "server_used": server_count,
        "server_limit": SERVER_DAILY_LIMIT,
        "available_slots": max(0, SERVER_DAILY_LIMIT - server_count),
        "user_posted_today": user_done,
        "is_admin": is_admin,
        "is_pillar": is_pillar_today,
        "is_champion": is_pillar_today,
        "spectator_mode": spectator,
        "can_post_now": can_post_now,
        "block_reason": block_reason,
        "admin_daily_limit": ADMIN_DAILY_LIMIT,
    }


@api.get("/status/today")
async def today_status(user: dict = Depends(require_active)):
    return await compute_status(user)


# ---------------- Posts ----------------
def serialize_post(p: dict, viewer: dict) -> dict:
    is_blinded = len(p.get("reports", [])) >= 3
    is_admin = viewer.get("is_admin", False)
    show_real = is_admin
    is_pillar_post = p.get("is_pillar", p.get("is_champion", False)) or total_likes_of(p) >= PILLAR_THRESHOLD
    return {
        "id": p["id"],
        "title": p["title"] if not is_blinded or is_admin else "블라인드 처리된 글",
        "content": p["content"] if not is_blinded or is_admin else "부적절한 내용으로 블라인드 처리되었습니다.",
        "blinded": is_blinded,
        "author_label": ("운영자" if p.get("author_is_admin") else f"#{p.get('slot', 0)}") if not show_real else p.get("author_email", "?"),
        "author_id": p.get("author_id") if is_admin else None,
        "is_mine": viewer["id"] == p.get("author_id"),
        "is_admin_post": p.get("author_is_admin", False),
        "slot": p.get("slot", 0),
        "date_key": p["date_key"],
        "like_count": total_likes_of(p),
        "real_like_count": len(p.get("likes", [])) if is_admin else None,
        "boost_likes": int(p.get("boost_likes", 0)) if is_admin else None,
        "liked_by_me": viewer["id"] in p.get("likes", []),
        "comment_count": p.get("comment_count", 0),
        "report_count": len(p.get("reports", [])) if is_admin else None,
        "is_pillar": is_pillar_post,
        "is_champion": is_pillar_post,
        "created_at": p["created_at"],
    }


async def maybe_promote_to_pillar(post_id: str):
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        return
    already = p.get("is_pillar") or p.get("is_champion")
    if not already and total_likes_of(p) >= PILLAR_THRESHOLD:
        await db.posts.update_one({"id": post_id}, {"$set": {"is_pillar": True, "pillar_at": now_utc().isoformat()}})
        author = await db.users.find_one({"id": p["author_id"]}, {"_id": 0})
        if author and not author.get("key_granted") and not author.get("is_admin"):
            key = await mint_key(author["id"], source="pillar")
            await db.users.update_one({"id": author["id"]}, {"$set": {"key_granted": True}})
            await send_key_granted(author["email"], key["code"])
            logger.info(f"Pillar key granted to {author['email']}: {key['code']}")


@api.post("/posts")
async def create_post(body: PostIn, user: dict = Depends(require_active)):
    s = await compute_status(user)
    if not s["can_post_now"]:
        msg = {
            "SERVER_FULL": "오늘의 기회는 모두 소진되었습니다.",
            "USER_DONE": "오늘은 이미 작성하셨습니다. 내일 다시 만나요.",
            "GOLDEN_HOUR_LOCKED": "Golden Hour를 기다려주세요.",
            "ADMIN_LIMIT": f"운영자는 하루 {ADMIN_DAILY_LIMIT}개까지 작성 가능합니다.",
        }.get(s["block_reason"], "지금은 작성할 수 없습니다.")
        raise HTTPException(423, msg)
    dk = today_key()
    server_count = await server_post_count_today(dk)
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "content": body.content.strip(),
        "author_id": user["id"],
        "author_email": user["email"],
        "author_is_admin": user.get("is_admin", False),
        "date_key": dk,
        "slot": server_count + 1,
        "likes": [],
        "boost_likes": 0,
        "reports": [],
        "comment_count": 0,
        "is_champion": False,
        "created_at": now_utc().isoformat(),
    }
    await db.posts.insert_one(doc)
    return serialize_post(doc, user)


@api.get("/posts")
async def list_posts(date_key: Optional[str] = None, user: dict = Depends(require_active)):
    q = {"is_pillar": {"$ne": True}, "is_champion": {"$ne": True}}
    if date_key:
        q["date_key"] = date_key
    cursor = db.posts.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cursor.to_list(200)
    return [serialize_post(p, user) for p in items]


@api.get("/pillars")
async def list_pillars(user: dict = Depends(require_active)):
    cursor = db.posts.find(
        {"$or": [{"is_pillar": True}, {"is_champion": True}, {"boost_likes": {"$gt": 0}}]}, {"_id": 0}
    ).sort([("pillar_at", -1), ("created_at", -1)]).limit(500)
    items = await cursor.to_list(500)
    items = [p for p in items if total_likes_of(p) >= PILLAR_THRESHOLD or p.get("is_pillar") or p.get("is_champion")]
    return [serialize_post(p, user) for p in items]


# Backwards-compat alias
@api.get("/champions")
async def list_champions_compat(user: dict = Depends(require_active)):
    return await list_pillars(user)


@api.get("/posts/{pid}")
async def get_post(pid: str, user: dict = Depends(require_active)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    return serialize_post(p, user)


@api.post("/posts/{pid}/like")
async def like(pid: str, user: dict = Depends(require_active)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user["id"] in p.get("likes", []):
        await db.posts.update_one({"id": pid}, {"$pull": {"likes": user["id"]}})
        liked = False
    else:
        await db.posts.update_one({"id": pid}, {"$addToSet": {"likes": user["id"]}})
        liked = True
    await maybe_promote_to_pillar(pid)
    fresh = await db.posts.find_one({"id": pid}, {"_id": 0})
    return {"liked": liked, "like_count": total_likes_of(fresh)}


@api.post("/posts/{pid}/report")
async def report_post(pid: str, user: dict = Depends(require_active)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user["id"] == p.get("author_id"):
        raise HTTPException(400, "자신의 글은 신고할 수 없습니다.")
    await db.posts.update_one({"id": pid}, {"$addToSet": {"reports": user["id"]}})
    fresh = await db.posts.find_one({"id": pid}, {"_id": 0})
    return {"reported": True, "report_count": len(fresh.get("reports", []))}


@api.delete("/posts/{pid}")
async def delete_post(pid: str, user: dict = Depends(require_active)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if not user.get("is_admin") and p["author_id"] != user["id"]:
        raise HTTPException(403, "권한이 없습니다.")
    await db.posts.delete_one({"id": pid})
    await db.comments.delete_many({"post_id": pid})
    return {"ok": True}


# ---------------- Comments ----------------
def serialize_comment(c: dict, viewer: dict, post: dict) -> dict:
    is_admin = viewer.get("is_admin", False)
    display_admin = c.get("display_as_admin", False) and c.get("author_is_admin", False)
    if is_admin:
        label = c.get("author_email", "?") + (" · ADMIN" if display_admin else "")
    elif display_admin:
        label = "운영자"
    elif c.get("author_id") == post.get("author_id"):
        label = "글쓴이"
    else:
        label = f"익명{c.get('comment_index', 0)}"
    return {
        "id": c["id"],
        "post_id": c["post_id"],
        "content": c["content"],
        "author_label": label,
        "author_id": c.get("author_id") if is_admin else None,
        "is_mine": viewer["id"] == c.get("author_id"),
        "display_as_admin": display_admin,
        "created_at": c["created_at"],
    }


@api.get("/posts/{pid}/comments")
async def list_comments(pid: str, user: dict = Depends(require_active)):
    post = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    cursor = db.comments.find({"post_id": pid}, {"_id": 0}).sort("created_at", 1)
    items = await cursor.to_list(500)
    return [serialize_comment(c, user, post) for c in items]


@api.post("/posts/{pid}/comments")
async def create_comment(pid: str, body: CommentIn, user: dict = Depends(require_active)):
    post = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if body.as_admin and not user.get("is_admin"):
        raise HTTPException(403, "운영자만 사용할 수 있는 옵션입니다.")
    existing = await db.comments.find_one({"post_id": pid, "author_id": user["id"]}, {"_id": 0, "comment_index": 1})
    if existing and existing.get("comment_index"):
        idx = existing["comment_index"]
    else:
        authors = await db.comments.distinct("author_id", {"post_id": pid})
        idx = len(authors) + 1
    doc = {
        "id": str(uuid.uuid4()),
        "post_id": pid,
        "content": body.content.strip(),
        "author_id": user["id"],
        "author_email": user["email"],
        "author_is_admin": user.get("is_admin", False),
        "display_as_admin": bool(body.as_admin and user.get("is_admin")),
        "comment_index": idx,
        "created_at": now_utc().isoformat(),
    }
    await db.comments.insert_one(doc)
    await db.posts.update_one({"id": pid}, {"$inc": {"comment_count": 1}})
    return serialize_comment(doc, user, post)


@api.delete("/comments/{cid}")
async def delete_comment(cid: str, user: dict = Depends(require_active)):
    c = await db.comments.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")
    if not user.get("is_admin") and c["author_id"] != user["id"]:
        raise HTTPException(403, "권한이 없습니다.")
    await db.comments.delete_one({"id": cid})
    await db.posts.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    return {"ok": True}


# ---------------- DM (Anonymous) ----------------
def conv_id_for(a: str, b: str) -> str:
    return "__".join(sorted([a, b]))


async def get_admin_user() -> Optional[dict]:
    return await db.users.find_one({"is_admin": True}, {"_id": 0})


@api.get("/messages/conversations")
async def list_conversations(user: dict = Depends(require_active)):
    cursor = db.messages.find(
        {"$or": [{"sender_id": user["id"]}, {"recipient_id": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1)
    msgs = await cursor.to_list(2000)
    cutoff = (now_utc() - timedelta(hours=24)).isoformat()
    await db.messages.delete_many({"admin_line": True, "created_at": {"$lt": cutoff}})
    seen = {}
    for m in msgs:
        cid = m["conv_id"]
        if cid in seen:
            continue
        is_admin_line = m.get("admin_line", False)
        if is_admin_line and m["created_at"] < cutoff:
            continue
        other_id = m["recipient_id"] if m["sender_id"] == user["id"] else m["sender_id"]
        unread = await db.messages.count_documents({
            "conv_id": cid, "recipient_id": user["id"], "read": False
        })
        label = "운영자 비밀 통로" if is_admin_line else anon_handle(other_id, cid)
        seen[cid] = {
            "conv_id": cid,
            "other_user_id": other_id,
            "label": label,
            "is_admin_line": is_admin_line,
            "last_message": m["content"],
            "last_at": m["created_at"],
            "unread": unread,
        }
    s = await compute_status(user)
    if s.get("is_pillar") or s.get("is_champion"):
        admin = await get_admin_user()
        if admin and admin["id"] != user["id"]:
            cid = conv_id_for(user["id"], admin["id"]) + "::admin_line"
            if cid not in seen:
                seen[cid] = {
                    "conv_id": cid,
                    "other_user_id": admin["id"],
                    "label": "운영자 비밀 통로",
                    "is_admin_line": True,
                    "last_message": "Pillar 전용 1:1 비밀 채널 (24시간 후 자동 파기)",
                    "last_at": now_utc().isoformat(),
                    "unread": 0,
                }
    return list(seen.values())


@api.get("/messages/{conv_id}")
async def get_thread(conv_id: str, user: dict = Depends(require_active)):
    is_admin_line = conv_id.endswith("::admin_line")
    base_cid = conv_id.replace("::admin_line", "")
    parts = base_cid.split("__")
    if len(parts) != 2 or user["id"] not in parts:
        raise HTTPException(403, "접근 권한이 없습니다.")
    other_id = parts[0] if parts[1] == user["id"] else parts[1]
    if is_admin_line:
        s = await compute_status(user)
        if not (s.get("is_pillar") or s.get("is_champion") or user.get("is_admin")):
            raise HTTPException(403, "운영자 비밀 통로 사용 권한이 없습니다.")
        cutoff = (now_utc() - timedelta(hours=24)).isoformat()
        await db.messages.delete_many({"conv_id": conv_id, "created_at": {"$lt": cutoff}})
    cursor = db.messages.find({"conv_id": conv_id}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(1000)
    await db.messages.update_many(
        {"conv_id": conv_id, "recipient_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    other_label = "운영자 비밀 통로" if is_admin_line else anon_handle(other_id, base_cid)
    return {
        "conv_id": conv_id, "is_admin_line": is_admin_line, "other_label": other_label,
        "messages": [
            {"id": m["id"], "content": m["content"], "from_me": m["sender_id"] == user["id"], "created_at": m["created_at"]}
            for m in msgs
        ],
    }


@api.post("/messages")
async def send_message(body: MessageIn, user: dict = Depends(require_active)):
    if body.recipient_id == user["id"]:
        raise HTTPException(400, "자신에게 쪽지를 보낼 수 없습니다.")
    other = await db.users.find_one({"id": body.recipient_id}, {"_id": 0})
    if not other:
        raise HTTPException(404, "수신자를 찾을 수 없습니다.")
    admin_line = False
    cid = conv_id_for(user["id"], body.recipient_id)
    if other.get("is_admin", False) or user.get("is_admin", False):
        s_user = await compute_status(user)
        s_other = await compute_status(other)
        if s_user.get("is_pillar") or s_other.get("is_pillar") or s_user.get("is_champion") or s_other.get("is_champion"):
            admin_line = True
            cid = cid + "::admin_line"
    doc = {
        "id": str(uuid.uuid4()),
        "conv_id": cid,
        "sender_id": user["id"],
        "recipient_id": body.recipient_id,
        "content": body.content.strip(),
        "read": False,
        "admin_line": admin_line,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(doc)
    return {"id": doc["id"], "content": doc["content"], "from_me": True, "created_at": doc["created_at"], "conv_id": cid}


@api.post("/messages/start/{post_id}")
async def start_dm_from_post(post_id: str, user: dict = Depends(require_active)):
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if p["author_id"] == user["id"]:
        raise HTTPException(400, "자신의 글에는 쪽지를 보낼 수 없습니다.")
    return {"recipient_id": p["author_id"], "conv_id": conv_id_for(user["id"], p["author_id"])}


# ---------------- Recommendation Keys (user-facing) ----------------
@api.get("/me/keys")
async def my_keys(user: dict = Depends(get_current_user)):
    cursor = db.recommendation_keys.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    keys = await cursor.to_list(50)
    return keys


# ---------------- Admin Endpoints ----------------
@api.post("/admin/users/{uid}/approve")
async def admin_approve(uid: str, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    if u.get("status") != "pending_review":
        raise HTTPException(400, "심사 대기 상태가 아닙니다.")
    await db.users.update_one(
        {"id": uid}, {"$set": {"status": "active", "reviewed_at": now_utc().isoformat()}}
    )
    await send_admin_decision(u["email"], approved=True)
    return {"ok": True}


@api.get("/admin/pending")
async def admin_pending_v2(_: dict = Depends(require_admin)):
    cursor = db.users.find({"status": "pending_review"}, {"_id": 0, "password_hash": 0}).sort("created_at", 1)
    items = await cursor.to_list(200)
    for u in items:
        rid = u.get("recommended_by")
        if rid:
            r = await db.users.find_one({"id": rid}, {"_id": 0, "email": 1, "nickname": 1, "created_at": 1, "is_admin": 1})
            u["recommended_by_email"] = r["email"] if r else None
            u["recommended_by_nickname"] = (r.get("nickname") if r else None) or (r["email"].split("@")[0] if r else None)
            posts_n = await db.posts.count_documents({"author_id": rid})
            invites_n = await db.invite_logs.count_documents({"recommender_id": rid})
            rejected_n = await db.users.count_documents({"recommended_by": rid, "status": "rejected"})
            approved_n = await db.users.count_documents({"recommended_by": rid, "status": "active"})
            total_decided = rejected_n + approved_n
            reject_rate = (rejected_n / total_decided) if total_decided > 0 else 0.0
            # Suspicion heuristics
            flags = []
            if r and not r.get("is_admin"):
                age_days = (now_utc() - datetime.fromisoformat(r["created_at"])).total_seconds() / 86400
                if invites_n > 10:
                    flags.append("HIGH_VOLUME")
                if age_days < 7 and invites_n > 3:
                    flags.append("FRESH_SPAMMER")
                if reject_rate >= 0.3 and total_decided >= 3:
                    flags.append("HIGH_REJECT_RATE")
            u["recommender_stats"] = {
                "posts": posts_n, "invites": invites_n,
                "approved": approved_n, "rejected": rejected_n,
                "reject_rate": round(reject_rate, 2),
            }
            u["recommender_flags"] = flags
    return items


@api.post("/admin/users/batch-approve")
async def admin_batch_approve(body: dict, _: dict = Depends(require_admin)):
    """Approve multiple users at once. Body: {user_ids: [str, ...]}"""
    ids = body.get("user_ids", []) if isinstance(body, dict) else []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "user_ids 배열이 필요합니다.")
    approved = []
    for uid in ids:
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if u and u.get("status") == "pending_review":
            await db.users.update_one(
                {"id": uid}, {"$set": {"status": "active", "reviewed_at": now_utc().isoformat()}}
            )
            await send_admin_decision(u["email"], approved=True)
            approved.append(uid)
    return {"approved": approved, "count": len(approved)}


@api.post("/admin/users/batch-reject")
async def admin_batch_reject(body: dict, _: dict = Depends(require_admin)):
    """Reject multiple users at once. Body: {user_ids: [str, ...]}"""
    ids = body.get("user_ids", []) if isinstance(body, dict) else []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "user_ids 배열이 필요합니다.")
    rejected = []
    for uid in ids:
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        if u and u.get("status") in ("pending_review", "pending_email"):
            await db.users.update_one(
                {"id": uid}, {"$set": {"status": "rejected", "reviewed_at": now_utc().isoformat()}}
            )
            await send_admin_decision(u["email"], approved=False)
            rejected.append(uid)
    return {"rejected": rejected, "count": len(rejected)}


@api.get("/admin/leaderboard")
async def admin_invite_leaderboard(_: dict = Depends(require_admin)):
    """Top recommenders by approved invites. Includes flags from heuristics."""
    pipeline = [
        {"$group": {
            "_id": "$recommender_id",
            "nickname": {"$first": "$recommender_nickname"},
            "email": {"$first": "$recommender_email"},
            "invites": {"$sum": 1},
        }},
        {"$match": {"_id": {"$ne": None}}},
        {"$sort": {"invites": -1}},
        {"$limit": 20},
    ]
    rows = await db.invite_logs.aggregate(pipeline).to_list(20)
    return [{"recommender_id": r["_id"], "nickname": r.get("nickname"),
             "email": r.get("email"), "invites": r["invites"]} for r in rows]


@api.get("/admin/users/{uid}")
async def admin_user_detail(uid: str, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    # recommender chain (1-level up)
    recommender = None
    if u.get("recommended_by"):
        r = await db.users.find_one({"id": u["recommended_by"]}, {"_id": 0, "password_hash": 0})
        if r:
            recommender = {
                "id": r["id"], "email": r["email"],
                "nickname": r.get("nickname") or derive_nickname(r["email"]),
                "is_admin": r.get("is_admin", False),
                "gate": r.get("gate", "invite"),
                "status": r.get("status", "active"),
                "created_at": r["created_at"],
            }
    # invitees by this user (genealogy down 1 level)
    inv_cursor = db.invite_logs.find({"recommender_id": uid}, {"_id": 0}).sort("joined_at", 1)
    invitees = await inv_cursor.to_list(500)
    # recommender activity stats for solidarity check
    posts_authored = await db.posts.count_documents({"author_id": uid})
    likes_received = 0
    async for p in db.posts.find({"author_id": uid}, {"_id": 0, "likes": 1, "boost_likes": 1}):
        likes_received += len(p.get("likes", [])) + int(p.get("boost_likes", 0) or 0)
    keys_owned = await db.recommendation_keys.count_documents({"owner_id": uid})
    keys_used = await db.recommendation_keys.count_documents({"owner_id": uid, "used": True})
    return {
        "user": {
            "id": u["id"], "email": u["email"],
            "nickname": u.get("nickname") or derive_nickname(u["email"]),
            "gate": u.get("gate", "invite"),
            "is_admin": u.get("is_admin", False),
            "status": u.get("status", "active"),
            "key_granted": u.get("key_granted", False),
            "email_verified_at": u.get("email_verified_at"),
            "reviewed_at": u.get("reviewed_at"),
            "created_at": u["created_at"],
        },
        "recommender": recommender,
        "invitees": invitees,
        "stats": {
            "posts": posts_authored,
            "likes_received": likes_received,
            "keys_owned": keys_owned,
            "keys_used": keys_used,
            "invites_count": len(invitees),
        },
    }


@api.get("/admin/invite-log")
async def admin_invite_log(_: dict = Depends(require_admin)):
    cursor = db.invite_logs.find({}, {"_id": 0}).sort("joined_at", -1).limit(500)
    return await cursor.to_list(500)


@api.post("/admin/users/{uid}/reject")
async def admin_reject(uid: str, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "사용자를 찾을 수 없습니다.")
    if u.get("status") not in ("pending_review", "pending_email"):
        raise HTTPException(400, "심사 가능한 상태가 아닙니다.")
    await db.users.update_one(
        {"id": uid}, {"$set": {"status": "rejected", "reviewed_at": now_utc().isoformat()}}
    )
    await send_admin_decision(u["email"], approved=False)
    return {"ok": True}


@api.post("/admin/keys")
async def admin_mint_key(admin: dict = Depends(require_admin)):
    """Admin can mint unlimited keys."""
    key = await mint_key(admin["id"], source="admin")
    return key


@api.get("/admin/keys")
async def admin_list_keys(_: dict = Depends(require_admin)):
    cursor = db.recommendation_keys.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return await cursor.to_list(500)


@api.post("/admin/posts/{pid}/boost")
async def admin_boost(pid: str, body: AdminBoostIn, _: dict = Depends(require_admin)):
    """Set boost_likes value; recompute pillar status."""
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    await db.posts.update_one({"id": pid}, {"$set": {"boost_likes": int(body.boost)}})
    await maybe_promote_to_pillar(pid)
    return {"ok": True, "boost": int(body.boost)}


# ---------------- Startup ----------------
async def _migrate_pillar_rename():
    """Rename Champion → Pillar fields to keep backward compat."""
    try:
        await db.posts.update_many({"is_champion": {"$exists": True}, "is_pillar": {"$exists": False}}, {"$rename": {"is_champion": "is_pillar"}})
        await db.posts.update_many({"champion_at": {"$exists": True}, "pillar_at": {"$exists": False}}, {"$rename": {"champion_at": "pillar_at"}})
        await db.daily_state.update_many({"champion_id": {"$exists": True}, "pillar_id": {"$exists": False}}, {"$rename": {"champion_id": "pillar_id"}})
        await db.recommendation_keys.update_many({"source": "champion"}, {"$set": {"source": "pillar"}})
        logger.info("Pillar migration done")
    except Exception as e:
        logger.warning(f"Pillar migration: {e}")


@app.on_event("startup")
async def startup():
    await _migrate_pillar_rename()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("status")
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("date_key")
    await db.posts.create_index("created_at")
    await db.posts.create_index("is_champion")
    await db.comments.create_index("post_id")
    await db.messages.create_index("conv_id")
    await db.daily_state.create_index("date_key", unique=True)
    await db.recommendation_keys.create_index("code", unique=True)
    await db.recommendation_keys.create_index("owner_id")
    await db.email_otps.create_index("user_id")
    await db.password_resets.create_index("token", unique=True)
    await db.invite_logs.create_index("recommender_id")
    await db.invite_logs.create_index("invited_user_id")

    pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        admin_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": admin_id, "email": ADMIN_EMAIL,
            "nickname": "운영자",
            "password_hash": hash_password(pw),
            "is_admin": True, "gate": "isu", "status": "active",
            "key_granted": True, "email_verified_at": now_utc().isoformat(),
            "created_at": now_utc().isoformat(),
        })
        await mint_key(admin_id, source="founder")
        logger.info("Admin seeded with founder key")
    else:
        update = {}
        if not existing.get("is_admin"):
            update["is_admin"] = True
        if existing.get("status") != "active":
            update["status"] = "active"
        if not existing.get("nickname"):
            update["nickname"] = "운영자"
        if not existing.get("gate"):
            update["gate"] = "isu"
        if not verify_password(pw, existing["password_hash"]):
            update["password_hash"] = hash_password(pw)
        if update:
            await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": update})
        any_key = await db.recommendation_keys.find_one({"owner_id": existing["id"], "used": False}, {"_id": 0})
        if not any_key:
            await mint_key(existing["id"], source="founder")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"name": "5P", "tagline": "5 Stories, 5 People, Once a day."}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
