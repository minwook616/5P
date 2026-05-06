#!/usr/bin/env python3
"""Interactive migration script to backfill created_at (datetime) and expireAt (24h) for posts
and admin_line messages. Run manually after backing up your DB.

Usage: python backend/scripts/migrate_ttl.py
"""
import os
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Load backend .env
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    print("MONGO_URL and DB_NAME must be set in backend/.env")
    raise SystemExit(1)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

async def migrate_posts():
    total = await db.posts.count_documents({})
    missing = await db.posts.count_documents({"expireAt": {"$exists": False}})
    print(f"Posts total: {total}, without expireAt: {missing}")
    if missing == 0:
        return
    confirm = input("Proceed to backfill posts (this will modify documents)? (yes/no): ")
    if confirm.lower() != "yes":
        print("Skipping posts migration")
        return
    i = 0
    async for p in db.posts.find({}, {"_id": 1, "created_at": 1}):
        ca = p.get("created_at")
        updates = {}
        dt = None
        if isinstance(ca, str):
            try:
                dt = datetime.fromisoformat(ca)
                updates["created_at"] = dt
            except Exception:
                # skip unparsable
                continue
        elif isinstance(ca, datetime):
            dt = ca
        if dt and p.get("expireAt") is None:
            updates["expireAt"] = dt + timedelta(hours=24)
        if updates:
            await db.posts.update_one({"_id": p["_id"]}, {"$set": updates})
            i += 1
    print(f"Posts updated: {i}")

async def migrate_messages():
    total = await db.messages.count_documents({"admin_line": True})
    missing = await db.messages.count_documents({"admin_line": True, "expireAt": {"$exists": False}})
    print(f"Admin messages total: {total}, without expireAt: {missing}")
    if missing == 0:
        return
    confirm = input("Proceed to backfill admin messages (this will modify documents)? (yes/no): ")
    if confirm.lower() != "yes":
        print("Skipping messages migration")
        return
    i = 0
    async for m in db.messages.find({"admin_line": True}, {"_id": 1, "created_at": 1}):
        ca = m.get("created_at")
        updates = {}
        dt = None
        if isinstance(ca, str):
            try:
                dt = datetime.fromisoformat(ca)
                updates["created_at"] = dt
            except Exception:
                continue
        elif isinstance(ca, datetime):
            dt = ca
        if dt and m.get("expireAt") is None:
            updates["expireAt"] = dt + timedelta(hours=24)
        if updates:
            await db.messages.update_one({"_id": m["_id"]}, {"$set": updates})
            i += 1
    print(f"Admin messages updated: {i}")

async def main():
    print("WARNING: Backup your database before running this script.")
    await migrate_posts()
    await migrate_messages()
    print("Migration finished.")
    client.close()

if __name__ == '__main__':
    asyncio.run(main())
