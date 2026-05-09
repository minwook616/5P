import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

async def check_production_db():
    load_dotenv(Path("5P/backend/.env"))
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    
    date = "2026-05-08"
    print(f"--- Diagnostic Report for {date} ---")
    
    async for doc in db["dining_menus"].find({"date": date}):
        slug = doc.get("slug")
        error = doc.get("error_log", "N/A")
        menu_count = len(doc.get("menus", []))
        updated_at = doc.get("updated_at")
        
        print(f"Hall: {slug}")
        print(f"  Status: {'SUCCESS' if menu_count > 0 else 'EMPTY'}")
        print(f"  Menus Found: {menu_count}")
        print(f"  Error Log: {error}")
        print(f"  Last Updated: {updated_at}")
        print("-" * 30)

    client.close()

if __name__ == "__main__":
    asyncio.run(check_production_db())
