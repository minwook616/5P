import os
import time
import random
import logging
import json
import requests
import asyncio
from datetime import datetime, timedelta
import google.generativeai as genai
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger("dining_service")

PROXY_DOMAIN = "https://isu-dining-proxy.minwoo01616.workers.dev"

DINING_METADATA = {
    "union-drive-marketplace-2-2": {"id": 1, "title": "UDM", "lat": "42.0253", "lng": "-93.6519"},
    "friley-windows-2-2": {"id": 4, "title": "Friley Windows", "lat": "42.0244", "lng": "-93.6502"},
    "seasons-marketplace-2-2": {"id": 3, "title": "Seasons Marketplace", "lat": "42.0227", "lng": "-93.6393"}
}

DINING_SLUGS = list(DINING_METADATA.keys())

class DiningService:
    def __init__(self, db):
        self.db = db
        self.collection = db["dining_menus"]
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None

    async def fetch_and_update_all(self):
        today = datetime.now().date()
        for i in range(7):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            for slug in DINING_SLUGS:
                await self.fetch_and_update_single(slug, date_str)
                await asyncio.sleep(0.5)

    async def fetch_and_update_single(self, slug, date_str):
        meta = DINING_METADATA.get(slug)
        url = f"{PROXY_DOMAIN}/wp-json/dining/v1/get-single-location/?slug={slug}&date={date_str}"
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(url, timeout=25)) # Longer timeout
            
            if resp.status_code != 200:
                await self.log_error(slug, date_str, f"Proxy Error: {resp.status_code}")
                return None

            data = resp.json()
            if isinstance(data, list) and data: data = data[0]
            
            if not data or not data.get("menus"):
                await self.log_error(slug, date_str, "ISU API: No menu found in JSON")
                return None

            # FAST PARSER
            menus = []
            for m_sec in data.get("menus", []):
                section_name = m_sec.get("section", "Meal")
                stations = []
                for display in m_sec.get("menuDisplays", []):
                    items = []
                    for cat in display.get("categories", []):
                        for item in cat.get("menuItems", []):
                            items.append({
                                "name": item.get("name"),
                                "totalCal": str(item.get("totalCal") or "0"),
                                "isVegan": bool(item.get("isVegan")),
                                "isHalal": bool(item.get("isHalal")),
                                "isVegetarian": bool(item.get("isVegetarian")),
                                "name_ko": item.get("name")
                            })
                    if items:
                        stations.append({"name": display.get("name", "Station"), "items": items})
                if stations:
                    menus.append({"section": section_name, "stations": stations})

            if not menus:
                await self.log_error(slug, date_str, "Parser: Failed to extract items")
                return None

            # TRANSLATE
            if self.model:
                try:
                    all_names = list(set([i["name"] for m in menus for s in m["stations"] for i in s["items"]]))
                    translations = await self.batch_translate(all_names[:50])
                    for m in menus:
                        for s in m["stations"]:
                            for i in s["items"]: i["name_ko"] = translations.get(i["name"], i["name"])
                except: pass

            final_doc = {
                "slug": slug,
                "title": meta["title"],
                "date": date_str,
                "lat": meta["lat"],
                "lng": meta["lng"],
                "menus": menus,
                "status": "Success",
                "updated_at": datetime.now()
            }
            await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": final_doc}, upsert=True)
            return final_doc

        except Exception as e:
            await self.log_error(slug, date_str, f"System Error: {str(e)}")
            return None

    async def log_error(self, slug, date_str, msg):
        meta = DINING_METADATA.get(slug)
        await self.collection.update_one(
            {"slug": slug, "date": date_str},
            {"$set": {
                "slug": slug, "title": meta["title"], "date": date_str,
                "menus": [], "status": msg, "updated_at": datetime.now()
            }},
            upsert=True
        )

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            prompt = f"Map English menu names to natural Korean: {json.dumps(items)}"
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: self.model.generate_content(
                prompt, generation_config={"response_mime_type": "application/json"}
            ))
            return json.loads(resp.text)
        except: return {}

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    return service
