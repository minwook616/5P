#!/usr/bin/env python3
"""Delete test user and related documents. Use with caution.

Deletes user by email and related posts/comments/messages/invite logs/keys/reset tokens.
"""
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    print("MONGO_URL and DB_NAME must be set in backend/.env")
    raise SystemExit(1)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

TEST_EMAIL = os.environ.get("TEST_DELETE_EMAIL", "testbot0495@iastate.edu")

async def main():
    u = await db.users.find_one({"email": TEST_EMAIL})
    if not u:
        print(f"No user with email {TEST_EMAIL} found.")
        return
    uid = u["id"]
    print(f"Deleting user {TEST_EMAIL} id={uid}")
    # delete posts
    res_posts = await db.posts.delete_many({"author_id": uid})
    print(f"Deleted posts: {res_posts.deleted_count}")
    # delete comments
    res_comments = await db.comments.delete_many({"author_id": uid})
    print(f"Deleted comments: {res_comments.deleted_count}")
    # delete messages where sender or recipient
    res_msgs = await db.messages.delete_many({"$or": [{"sender_id": uid}, {"recipient_id": uid}]})
    print(f"Deleted messages: {res_msgs.deleted_count}")
    # recommendation keys owned or used_by
    res_keys = await db.recommendation_keys.delete_many({"$or": [{"owner_id": uid}, {"used_by_id": uid}]})
    print(f"Deleted recommendation keys: {res_keys.deleted_count}")
    # invite logs
    res_inv = await db.invite_logs.delete_many({"$or": [{"recommender_id": uid}, {"invited_user_id": uid}]})
    print(f"Deleted invite logs: {res_inv.deleted_count}")
    # email_otps, password_resets
    res_otps = await db.email_otps.delete_many({"user_id": uid})
    print(f"Deleted email_otps: {res_otps.deleted_count}")
    res_resets = await db.password_resets.delete_many({"user_id": uid})
    print(f"Deleted password_resets: {res_resets.deleted_count}")
    # finally delete user
    res_user = await db.users.delete_one({"id": uid})
    print(f"Deleted user: {res_user.deleted_count}")
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
