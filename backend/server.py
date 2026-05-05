from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import random
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta, time as dtime
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

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

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="5P (Five Posts) API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("5p")


# ---------------- Time Helpers ----------------
def now_local() -> datetime:
    return datetime.now(TZ)


def today_key(dt: Optional[datetime] = None) -> str:
    dt = dt or now_local()
    return dt.astimezone(TZ).strftime("%Y-%m-%d")


def yesterday_key() -> str:
    return (now_local() - timedelta(days=1)).strftime("%Y-%m-%d")


def day_start_local(date_key: str) -> datetime:
    y, m, d = map(int, date_key.split("-"))
    return datetime(y, m, d, 0, 0, 0, tzinfo=TZ)


# ---------------- Crypto ----------------
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
        {"sub": uid, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES), "type": "access"},
        get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    return jwt.encode(
        {"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS), "type": "refresh"},
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
        "is_admin": u.get("is_admin", False),
        "created_at": u["created_at"],
    }


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


# ---------------- Anonymous Handle ----------------
def anon_handle(user_id: str, conv_id: str) -> str:
    """Stable per-conversation anonymous handle (double-blind)."""
    import hashlib
    h = hashlib.sha256(f"{conv_id}:{user_id}".encode()).hexdigest()[:4].upper()
    return f"ANON-{h}"


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PostIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=3000)


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=800)


class MessageIn(BaseModel):
    recipient_id: str
    content: str = Field(min_length=1, max_length=2000)


# ---------------- Daily State ----------------
async def get_or_create_daily_state(date_key: str) -> dict:
    state = await db.daily_state.find_one({"date_key": date_key}, {"_id": 0})
    if state:
        return state

    # compute champion = top liked post author from yesterday
    champion_id = None
    yk = (datetime.strptime(date_key, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    yest_posts = await db.posts.find({"date_key": yk}, {"_id": 0}).to_list(50)
    if yest_posts:
        ranked = sorted(yest_posts, key=lambda p: len(p.get("likes", [])), reverse=True)
        if ranked and len(ranked[0].get("likes", [])) > 0:
            champion_id = ranked[0]["author_id"]

    # random unlock time within [00:00, 01:00] local
    start = day_start_local(date_key)
    offset = random.randint(0, 3599)
    unlock_at = start + timedelta(seconds=offset)

    state = {
        "date_key": date_key,
        "unlock_at": unlock_at.astimezone(timezone.utc).isoformat(),
        "champion_id": champion_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.daily_state.insert_one(dict(state))
    except Exception:
        # race
        existing = await db.daily_state.find_one({"date_key": date_key}, {"_id": 0})
        if existing:
            return existing
    return state


async def server_post_count_today(date_key: str) -> int:
    return await db.posts.count_documents({"date_key": date_key})


async def user_posted_today(user_id: str, date_key: str) -> bool:
    return await db.posts.count_documents({"author_id": user_id, "date_key": date_key}) > 0


async def compute_status(user: dict) -> dict:
    dk = today_key()
    state = await get_or_create_daily_state(dk)
    server_count = await server_post_count_today(dk)
    is_admin = user.get("is_admin", False)
    is_champion = state.get("champion_id") == user["id"]
    user_done = await user_posted_today(user["id"], dk)
    now_utc = datetime.now(timezone.utc)
    unlock_at = datetime.fromisoformat(state["unlock_at"])
    if unlock_at.tzinfo is None:
        unlock_at = unlock_at.replace(tzinfo=timezone.utc)

    spectator = server_count >= SERVER_DAILY_LIMIT and not is_admin
    golden_hour_passed = now_utc >= unlock_at
    can_post_now = False
    block_reason = None

    if is_admin:
        # admin: only blocked by ADMIN_DAILY_LIMIT (own posts today)
        admin_today = await db.posts.count_documents({"author_id": user["id"], "date_key": dk})
        can_post_now = admin_today < ADMIN_DAILY_LIMIT
        if not can_post_now:
            block_reason = "ADMIN_LIMIT"
    elif spectator:
        block_reason = "SERVER_FULL"
    elif user_done:
        block_reason = "USER_DONE"
    elif is_champion:
        # champion can post at 00:00 local immediately, no random wait
        can_post_now = True
    elif not golden_hour_passed:
        block_reason = "GOLDEN_HOUR_LOCKED"
    else:
        can_post_now = True

    return {
        "today_key": dk,
        "now": now_utc.isoformat(),
        "unlock_at": unlock_at.isoformat(),
        "server_used": server_count,
        "server_limit": SERVER_DAILY_LIMIT,
        "available_slots": max(0, SERVER_DAILY_LIMIT - server_count),
        "user_posted_today": user_done,
        "is_admin": is_admin,
        "is_champion": is_champion,
        "spectator_mode": spectator,
        "can_post_now": can_post_now,
        "block_reason": block_reason,
        "admin_daily_limit": ADMIN_DAILY_LIMIT,
    }


# ---------------- Auth ----------------
def email_allowed(email: str) -> bool:
    return email.lower().endswith(f"@{ALLOWED_DOMAIN}")


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    if not email_allowed(email):
        raise HTTPException(403, f"@{ALLOWED_DOMAIN} 이메일만 가입할 수 있습니다.")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(400, "이미 가입된 이메일입니다.")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": email,
        "password_hash": hash_password(body.password),
        "is_admin": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"user": public_user(doc)}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
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


# ---------------- Status ----------------
@api.get("/status/today")
async def today_status(user: dict = Depends(get_current_user)):
    return await compute_status(user)


# ---------------- Posts ----------------
def serialize_post(p: dict, viewer: dict) -> dict:
    is_blinded = len(p.get("reports", [])) >= 3
    is_admin = viewer.get("is_admin", False)
    show_real = is_admin
    return {
        "id": p["id"],
        "title": p["title"] if not is_blinded or is_admin else "블라인드 처리된 글",
        "content": p["content"] if not is_blinded or is_admin else "부적절한 내용으로 블라인드 처리되었습니다.",
        "blinded": is_blinded,
        "author_label": ("운영자" if p.get("author_is_admin") else f"#{p['slot']}") if not show_real else p.get("author_email", "?"),
        "author_id": p.get("author_id") if is_admin else None,
        "is_mine": viewer["id"] == p.get("author_id"),
        "is_admin_post": p.get("author_is_admin", False),
        "slot": p.get("slot", 0),
        "date_key": p["date_key"],
        "like_count": len(p.get("likes", [])),
        "liked_by_me": viewer["id"] in p.get("likes", []),
        "comment_count": p.get("comment_count", 0),
        "report_count": len(p.get("reports", [])) if is_admin else None,
        "created_at": p["created_at"],
    }


@api.post("/posts")
async def create_post(body: PostIn, user: dict = Depends(get_current_user)):
    status = await compute_status(user)
    if not status["can_post_now"]:
        reason = status["block_reason"]
        msg = {
            "SERVER_FULL": "오늘의 기회는 모두 소진되었습니다.",
            "USER_DONE": "오늘은 이미 작성하셨습니다. 내일 다시 만나요.",
            "GOLDEN_HOUR_LOCKED": "Golden Hour를 기다려주세요.",
            "ADMIN_LIMIT": f"운영자는 하루 {ADMIN_DAILY_LIMIT}개까지 작성 가능합니다.",
        }.get(reason, "지금은 작성할 수 없습니다.")
        raise HTTPException(423, msg)

    dk = today_key()
    # assign slot number = count + 1 at insert time (best effort, race is fine)
    server_count = await server_post_count_today(dk)
    slot = server_count + 1
    now_utc = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "content": body.content.strip(),
        "author_id": user["id"],
        "author_email": user["email"],
        "author_is_admin": user.get("is_admin", False),
        "date_key": dk,
        "slot": slot,
        "likes": [],
        "reports": [],
        "comment_count": 0,
        "created_at": now_utc,
    }
    await db.posts.insert_one(doc)
    return serialize_post(doc, user)


@api.get("/posts")
async def list_posts(date_key: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if date_key:
        q["date_key"] = date_key
    cursor = db.posts.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cursor.to_list(200)
    return [serialize_post(p, user) for p in items]


@api.get("/posts/{pid}")
async def get_post(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    return serialize_post(p, user)


@api.post("/posts/{pid}/like")
async def like(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user["id"] in p.get("likes", []):
        await db.posts.update_one({"id": pid}, {"$pull": {"likes": user["id"]}})
        liked = False
    else:
        await db.posts.update_one({"id": pid}, {"$addToSet": {"likes": user["id"]}})
        liked = True
    fresh = await db.posts.find_one({"id": pid}, {"_id": 0})
    return {"liked": liked, "like_count": len(fresh.get("likes", []))}


@api.post("/posts/{pid}/report")
async def report_post(pid: str, user: dict = Depends(get_current_user)):
    p = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if user["id"] == p.get("author_id"):
        raise HTTPException(400, "자신의 글은 신고할 수 없습니다.")
    if user["id"] in p.get("reports", []):
        return {"reported": True, "report_count": len(p.get("reports", []))}
    await db.posts.update_one({"id": pid}, {"$addToSet": {"reports": user["id"]}})
    fresh = await db.posts.find_one({"id": pid}, {"_id": 0})
    return {"reported": True, "report_count": len(fresh.get("reports", []))}


@api.delete("/posts/{pid}")
async def delete_post(pid: str, user: dict = Depends(get_current_user)):
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
    label = c.get("author_email", "?") if is_admin else (
        "글쓴이" if c.get("author_id") == post.get("author_id") else f"익명{c.get('comment_index', 0)}"
    )
    if c.get("author_is_admin"):
        label = "운영자"
    return {
        "id": c["id"],
        "post_id": c["post_id"],
        "content": c["content"],
        "author_label": label,
        "author_id": c.get("author_id") if is_admin else None,
        "is_mine": viewer["id"] == c.get("author_id"),
        "is_admin_post": c.get("author_is_admin", False),
        "created_at": c["created_at"],
    }


@api.get("/posts/{pid}/comments")
async def list_comments(pid: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    cursor = db.comments.find({"post_id": pid}, {"_id": 0}).sort("created_at", 1)
    items = await cursor.to_list(500)
    return [serialize_comment(c, user, post) for c in items]


@api.post("/posts/{pid}/comments")
async def create_comment(pid: str, body: CommentIn, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": pid}, {"_id": 0})
    if not post:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    # Assign comment index per post per author (stable label)
    existing = await db.comments.find_one({"post_id": pid, "author_id": user["id"]}, {"_id": 0, "comment_index": 1})
    if existing and existing.get("comment_index"):
        idx = existing["comment_index"]
    else:
        # next index based on distinct authors so far
        authors = await db.comments.distinct("author_id", {"post_id": pid})
        idx = len(authors) + 1
    doc = {
        "id": str(uuid.uuid4()),
        "post_id": pid,
        "content": body.content.strip(),
        "author_id": user["id"],
        "author_email": user["email"],
        "author_is_admin": user.get("is_admin", False),
        "comment_index": idx,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.comments.insert_one(doc)
    await db.posts.update_one({"id": pid}, {"$inc": {"comment_count": 1}})
    return serialize_comment(doc, user, post)


@api.delete("/comments/{cid}")
async def delete_comment(cid: str, user: dict = Depends(get_current_user)):
    c = await db.comments.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "댓글을 찾을 수 없습니다.")
    if not user.get("is_admin") and c["author_id"] != user["id"]:
        raise HTTPException(403, "권한이 없습니다.")
    await db.comments.delete_one({"id": cid})
    await db.posts.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    return {"ok": True}


# ---------------- DM (Anonymous double-blind) ----------------
def conv_id_for(a: str, b: str) -> str:
    return "__".join(sorted([a, b]))


async def get_admin_user() -> Optional[dict]:
    return await db.users.find_one({"is_admin": True}, {"_id": 0})


@api.get("/messages/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    cursor = db.messages.find(
        {"$or": [{"sender_id": user["id"]}, {"recipient_id": user["id"]}]}, {"_id": 0}
    ).sort("created_at", -1)
    msgs = await cursor.to_list(2000)

    # purge admin_line older than 24h
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
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
        if is_admin_line:
            label = "운영자 비밀 통로"
        else:
            label = anon_handle(other_id, cid)
        seen[cid] = {
            "conv_id": cid,
            "other_user_id": other_id,
            "label": label,
            "is_admin_line": is_admin_line,
            "last_message": m["content"],
            "last_at": m["created_at"],
            "unread": unread,
        }

    # if user is champion today, ensure admin direct line entry exists
    status = await compute_status(user)
    if status["is_champion"]:
        admin = await get_admin_user()
        if admin and admin["id"] != user["id"]:
            cid = conv_id_for(user["id"], admin["id"]) + "::admin_line"
            if cid not in seen:
                seen[cid] = {
                    "conv_id": cid,
                    "other_user_id": admin["id"],
                    "label": "운영자 비밀 통로",
                    "is_admin_line": True,
                    "last_message": "챔피언 전용 1:1 비밀 채널 (24시간 후 자동 파기)",
                    "last_at": datetime.now(timezone.utc).isoformat(),
                    "unread": 0,
                }
    return list(seen.values())


@api.get("/messages/{conv_id}")
async def get_thread(conv_id: str, user: dict = Depends(get_current_user)):
    is_admin_line = conv_id.endswith("::admin_line")
    base_cid = conv_id.replace("::admin_line", "")
    parts = base_cid.split("__")
    if len(parts) != 2 or user["id"] not in parts:
        raise HTTPException(403, "접근 권한이 없습니다.")
    other_id = parts[0] if parts[1] == user["id"] else parts[1]

    if is_admin_line:
        # only champion or admin can use admin_line; auto-purge >24h
        status = await compute_status(user)
        if not (status["is_champion"] or user.get("is_admin")):
            raise HTTPException(403, "운영자 비밀 통로 사용 권한이 없습니다.")
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        await db.messages.delete_many({"conv_id": conv_id, "created_at": {"$lt": cutoff}})

    cursor = db.messages.find({"conv_id": conv_id}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(1000)
    await db.messages.update_many(
        {"conv_id": conv_id, "recipient_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    other_label = "운영자 비밀 통로" if is_admin_line else anon_handle(other_id, base_cid)
    return {
        "conv_id": conv_id,
        "is_admin_line": is_admin_line,
        "other_label": other_label,
        "messages": [
            {
                "id": m["id"],
                "content": m["content"],
                "from_me": m["sender_id"] == user["id"],
                "created_at": m["created_at"],
            }
            for m in msgs
        ],
    }


@api.post("/messages")
async def send_message(body: MessageIn, request: Request, user: dict = Depends(get_current_user)):
    if body.recipient_id == user["id"]:
        raise HTTPException(400, "자신에게 쪽지를 보낼 수 없습니다.")
    other = await db.users.find_one({"id": body.recipient_id}, {"_id": 0})
    if not other:
        raise HTTPException(404, "수신자를 찾을 수 없습니다.")

    # Determine if this is an admin-line message:
    admin_line = False
    cid = conv_id_for(user["id"], body.recipient_id)
    target_admin = other.get("is_admin", False) or user.get("is_admin", False)
    if target_admin:
        # if either party is admin AND user (or recipient) is champion today, use admin_line
        status_user = await compute_status(user)
        status_other = await compute_status(other)
        if status_user["is_champion"] or status_other["is_champion"]:
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    return {
        "id": doc["id"],
        "content": doc["content"],
        "from_me": True,
        "created_at": doc["created_at"],
        "conv_id": cid,
    }


@api.post("/messages/start/{post_id}")
async def start_dm_from_post(post_id: str, user: dict = Depends(get_current_user)):
    """Anonymous DM initiation from a post — caller doesn't see the author identity."""
    p = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "게시글을 찾을 수 없습니다.")
    if p["author_id"] == user["id"]:
        raise HTTPException(400, "자신의 글에는 쪽지를 보낼 수 없습니다.")
    return {"recipient_id": p["author_id"], "conv_id": conv_id_for(user["id"], p["author_id"])}


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("date_key")
    await db.posts.create_index("created_at")
    await db.comments.create_index("post_id")
    await db.messages.create_index("conv_id")
    await db.daily_state.create_index("date_key", unique=True)

    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(pw),
            "is_admin": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Admin seeded")
    else:
        update = {}
        if not existing.get("is_admin"):
            update["is_admin"] = True
        if not verify_password(pw, existing["password_hash"]):
            update["password_hash"] = hash_password(pw)
        if update:
            await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": update})


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
