#!/usr/bin/env python3
"""Simulate daily cleanup: insert test posts for yesterday, run deletion query, report results."""
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
PILLAR_THRESHOLD = int(os.environ.get("PILLAR_THRESHOLD", os.environ.get("CHAMPION_THRESHOLD", "15")))
TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "America/Chicago"))

if not MONGO_URL or not DB_NAME:
    print("MONGO_URL and DB_NAME must be set in backend/.env")
    raise SystemExit(1)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

async def main():
    now_local = datetime.now(TZ)
    yesterday = (now_local - timedelta(days=1)).strftime("%Y-%m-%d")
    print(f"Simulating for date_key={yesterday}")

    # Prepare test authors
    author_a = str(uuid.uuid4())
    author_b = str(uuid.uuid4())

    # Insert non-pillar post (should be deleted)
    non_pillar = {
        "id": str(uuid.uuid4()),
        "title": "Test non-pillar",
        "content": "This should be deleted",
        "author_id": author_a,
        "author_email": "a@example.com",
        "author_is_admin": False,
        "date_key": yesterday,
        "slot": 1,
        "likes": [],
        "boost_likes": 0,
        "reports": [],
        "comment_count": 0,
        "is_champion": False,
        "created_at": datetime.now().isoformat(),
    }

    # Insert pillar post (should NOT be deleted)
    pillar = dict(non_pillar)
    pillar.update({"id": str(uuid.uuid4()), "title": "Pillar post", "author_id": author_b, "author_email": "b@example.com", "is_pillar": True})

    # Insert boosted post meeting threshold (should NOT be deleted)
    boosted = dict(non_pillar)
    boosted.update({"id": str(uuid.uuid4()), "title": "Boosted post", "author_id": str(uuid.uuid4()), "author_email": "c@example.com", "boost_likes": PILLAR_THRESHOLD})

    # Insert documents
    await db.posts.insert_many([non_pillar, pillar, boosted])
    total_before = await db.posts.count_documents({"date_key": yesterday})
    print(f"Total posts before cleanup for {yesterday}: {total_before}")

    # Run deletion query (same as server)
    q = {
        "date_key": yesterday,
        "is_pillar": {"$ne": True},
        "is_champion": {"$ne": True},
        "$or": [
            {"boost_likes": {"$exists": False}},
            {"boost_likes": {"$lt": PILLAR_THRESHOLD}},
        ],
    }
    res = await db.posts.delete_many(q)
    print(f"Deleted count: {res.deleted_count}")

    remaining = await db.posts.find({"date_key": yesterday}, {"_id": 0}).to_list(50)
    print(f"Remaining posts for {yesterday}: {len(remaining)}")
    for p in remaining:
        print(f" - id={p['id']} title={p.get('title')} is_pillar={p.get('is_pillar')} boost_likes={p.get('boost_likes')}")

    # Cleanup: remove remaining test posts to avoid polluting DB
    ids = [p['id'] for p in remaining]
    if ids:
        rr = await db.posts.delete_many({"id": {"$in": ids}})
        print(f"Cleaned up remaining test posts: {rr.deleted_count}")

    client.close()

if __name__ == '__main__':
    asyncio.run(main())
