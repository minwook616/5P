from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, status
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------- Config ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24  # 1 day (Gen-Z convenience)
REFRESH_TOKEN_DAYS = 7
DAILY_POST_LIMIT = int(os.environ.get("DAILY_POST_LIMIT", "5"))

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Campus Talk API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("campus")


# ---------------- Utils ----------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                        max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                        max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "nickname": u["nickname"],
        "school": u.get("school", ""),
        "created_at": u["created_at"],
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    nickname: str = Field(min_length=2, max_length=20)
    school: str = Field(default="", max_length=50)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PostIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=5000)
    category: str = Field(default="free")  # free | secret | info
    is_anonymous: bool = True


class CommentIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    is_anonymous: bool = True


class MessageIn(BaseModel):
    recipient_id: str
    content: str = Field(min_length=1, max_length=2000)


VALID_CATEGORIES = {"free", "secret", "info", "question"}


# ---------------- Auth Endpoints ----------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다")

    nickname_exists = await db.users.find_one({"nickname": body.nickname})
    if nickname_exists:
        raise HTTPException(status_code=400, detail="이미 사용 중인 닉네임입니다")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "nickname": body.nickname,
        "school": body.school,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)

    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(doc), "access_token": access}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    access = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    rtoken = request.cookies.get("refresh_token")
    if not rtoken:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rtoken, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(user["id"], user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                            max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ---------------- Posts ----------------
async def count_today_posts(user_id: str) -> int:
    start = datetime.now(timezone.utc) - timedelta(hours=24)
    return await db.posts.count_documents({
        "author_id": user_id,
        "created_at": {"$gte": start.isoformat()},
    })


@api.get("/posts/quota")
async def my_quota(user: dict = Depends(get_current_user)):
    used = await count_today_posts(user["id"])
    return {"used": used, "limit": DAILY_POST_LIMIT, "remaining": max(0, DAILY_POST_LIMIT - used)}


@api.post("/posts")
async def create_post(body: PostIn, user: dict = Depends(get_current_user)):
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="유효하지 않은 카테고리입니다")
    used = await count_today_posts(user["id"])
    if used >= DAILY_POST_LIMIT:
        raise HTTPException(status_code=429, detail=f"하루 최대 {DAILY_POST_LIMIT}개까지 작성 가능합니다. 24시간 후 초기화됩니다.")

    post_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": post_id,
        "title": body.title.strip(),
        "content": body.content.strip(),
        "category": body.category,
        "is_anonymous": body.is_anonymous,
        "author_id": user["id"],
        "author_nickname": user["nickname"],
        "likes": [],
        "comment_count": 0,
        "views": 0,
        "created_at": now,
    }
    await db.posts.insert_one(doc)
    return serialize_post(doc, user["id"])


def serialize_post(p: dict, me_id: Optional[str] = None) -> dict:
    return {
        "id": p["id"],
        "title": p["title"],
        "content": p["content"],
        "category": p["category"],
        "is_anonymous": p.get("is_anonymous", True),
        "author_nickname": "익명" if p.get("is_anonymous", True) else p.get("author_nickname", "Unknown"),
        "author_id": None if p.get("is_anonymous", True) else p.get("author_id"),
        "is_mine": me_id == p.get("author_id") if me_id else False,
        "like_count": len(p.get("likes", [])),
        "liked_by_me": (me_id in p.get("likes", [])) if me_id else False,
        "comment_count": p.get("comment_count", 0),
        "views": p.get("views", 0),
        "created_at": p["created_at"],
    }


@api.get("/posts")
async def list_posts(category: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if category and category != "all":
        if category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail="유효하지 않은 카테고리입니다")
        query["category"] = category
    cursor = db.posts.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    items = await cursor.to_list(100)
    return [serialize_post(p, user["id"]) for p in items]


@api.get("/posts/{post_id}")
async def get_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    await db.posts.update_one({"id": post_id}, {"$inc": {"views": 1}})
    post["views"] = post.get("views", 0) + 1
    return serialize_post(post, user["id"])


@api.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    if post["author_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="본인 게시글만 삭제할 수 있습니다")
    await db.posts.delete_one({"id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"ok": True}


@api.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    likes = post.get("likes", [])
    if user["id"] in likes:
        await db.posts.update_one({"id": post_id}, {"$pull": {"likes": user["id"]}})
        liked = False
    else:
        await db.posts.update_one({"id": post_id}, {"$addToSet": {"likes": user["id"]}})
        liked = True
    updated = await db.posts.find_one({"id": post_id}, {"_id": 0})
    return {"liked": liked, "like_count": len(updated.get("likes", []))}


# ---------------- Comments ----------------
@api.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user: dict = Depends(get_current_user)):
    cursor = db.comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1)
    items = await cursor.to_list(500)
    return [serialize_comment(c, user["id"]) for c in items]


def serialize_comment(c: dict, me_id: str) -> dict:
    return {
        "id": c["id"],
        "post_id": c["post_id"],
        "content": c["content"],
        "is_anonymous": c.get("is_anonymous", True),
        "author_nickname": "익명" if c.get("is_anonymous", True) else c.get("author_nickname", "Unknown"),
        "is_mine": me_id == c.get("author_id"),
        "created_at": c["created_at"],
    }


@api.post("/posts/{post_id}/comments")
async def create_comment(post_id: str, body: CommentIn, user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다")
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "post_id": post_id,
        "content": body.content.strip(),
        "is_anonymous": body.is_anonymous,
        "author_id": user["id"],
        "author_nickname": user["nickname"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.comments.insert_one(doc)
    await db.posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})
    return serialize_comment(doc, user["id"])


@api.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(get_current_user)):
    c = await db.comments.find_one({"id": comment_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다")
    if c["author_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="본인 댓글만 삭제할 수 있습니다")
    await db.comments.delete_one({"id": comment_id})
    await db.posts.update_one({"id": c["post_id"]}, {"$inc": {"comment_count": -1}})
    return {"ok": True}


# ---------------- DM / Messages ----------------
def conv_id(a: str, b: str) -> str:
    return "__".join(sorted([a, b]))


@api.get("/messages/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    # aggregate last message per conversation
    cursor = db.messages.find({"$or": [{"sender_id": user["id"]}, {"recipient_id": user["id"]}]},
                              {"_id": 0}).sort("created_at", -1)
    msgs = await cursor.to_list(1000)
    seen = {}
    for m in msgs:
        cid = m["conv_id"]
        if cid in seen:
            continue
        other_id = m["recipient_id"] if m["sender_id"] == user["id"] else m["sender_id"]
        other = await db.users.find_one({"id": other_id}, {"_id": 0})
        if not other:
            continue
        unread = await db.messages.count_documents({
            "conv_id": cid, "recipient_id": user["id"], "read": False,
        })
        seen[cid] = {
            "conv_id": cid,
            "other_user": {"id": other["id"], "nickname": other["nickname"]},
            "last_message": m["content"],
            "last_at": m["created_at"],
            "unread": unread,
        }
    return list(seen.values())


@api.get("/messages/{other_id}")
async def get_thread(other_id: str, user: dict = Depends(get_current_user)):
    cid = conv_id(user["id"], other_id)
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    cursor = db.messages.find({"conv_id": cid}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(1000)
    # mark as read
    await db.messages.update_many(
        {"conv_id": cid, "recipient_id": user["id"], "read": False},
        {"$set": {"read": True}},
    )
    return {
        "other_user": {"id": other["id"], "nickname": other["nickname"]},
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
async def send_message(body: MessageIn, user: dict = Depends(get_current_user)):
    if body.recipient_id == user["id"]:
        raise HTTPException(status_code=400, detail="자신에게 쪽지를 보낼 수 없습니다")
    other = await db.users.find_one({"id": body.recipient_id}, {"_id": 0})
    if not other:
        raise HTTPException(status_code=404, detail="수신자를 찾을 수 없습니다")
    mid = str(uuid.uuid4())
    doc = {
        "id": mid,
        "conv_id": conv_id(user["id"], body.recipient_id),
        "sender_id": user["id"],
        "recipient_id": body.recipient_id,
        "content": body.content.strip(),
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(doc)
    return {"id": mid, "content": doc["content"], "from_me": True, "created_at": doc["created_at"]}


# Find user by nickname (for starting DMs)
@api.get("/users/search")
async def search_users(q: str, user: dict = Depends(get_current_user)):
    if not q or len(q) < 1:
        return []
    cursor = db.users.find(
        {"nickname": {"$regex": q, "$options": "i"}, "id": {"$ne": user["id"]}},
        {"_id": 0, "id": 1, "nickname": 1},
    ).limit(10)
    items = await cursor.to_list(10)
    return items


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("nickname", unique=True)
    await db.users.create_index("id", unique=True)
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("created_at")
    await db.comments.create_index("post_id")
    await db.messages.create_index("conv_id")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@everytime.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "nickname": "Admin",
            "school": "Emergent Univ",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            await db.users.insert_one(doc)
            logger.info("Admin user seeded")
        except Exception as e:
            logger.warning(f"Admin seed: {e}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}}
        )


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "Campus Talk API", "version": "1.0"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
