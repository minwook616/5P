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

# ISU Dining Slugs
DINING_SLUGS = ["union-drive-marketplace", "friley-windows", "seasons-marketplace"]

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
        logger.info("Batch update started.")
        today = datetime.now().date()
        for i in range(14):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            for slug in DINING_SLUGS:
                await self.fetch_and_update_single(slug, date_str)
                await asyncio.sleep(0.5)

    async def fetch_and_update_single(self, slug, date_str):
        # We try the most reliable endpoint first
        url = f"https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/?slug={slug}&date={date_str}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.dining.iastate.edu/hours-menus/",
        }
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=15))
            if resp.status_code != 200: return None
            
            data = resp.json()
            if isinstance(data, list) and data: data = data[0]
            if not data or not data.get("menus"): 
                # If no menus, we still save a "Closed" state so frontend doesn't keep spinning
                await self.collection.update_one(
                    {"slug": slug, "date": date_str},
                    {"$set": {"title": data.get("title", slug), "slug": slug, "date": date_str, "menus": [], "is_closed": True, "updated_at": datetime.now()}},
                    upsert=True
                )
                return None

            # Parse
            menus = []
            raw_menus = data.get("menus", [])
            
            # Flexible Parser
            sections = []
            if isinstance(raw_menus, list): sections = raw_menus
            elif isinstance(raw_menus, dict): 
                for sec_name, sec_data in raw_menus.items():
                    sec_data["section"] = sec_name
                    sections.append(sec_data)

            for sec in sections:
                section_name = sec.get("section", "Menu")
                stations = []
                displays = sec.get("menuDisplays") or sec.get("stations") or []
                for d in displays:
                    items = []
                    # Try all known item locations
                    raw_items = d.get("items") or []
                    for cat in d.get("categories", []):
                        raw_items.extend(cat.get("menuItems", []))
                    
                    for ri in raw_items:
                        items.append({
                            "name": ri.get("name"),
                            "totalCal": ri.get("totalCal"),
                            "isVegan": ri.get("isVegan", False),
                            "isHalal": ri.get("isHalal", False),
                            "isVegetarian": ri.get("isVegetarian", False)
                        })
                    if items:
                        stations.append({"name": d.get("name", "Station"), "items": items})
                if stations:
                    menus.append({"section": section_name, "stations": stations})

            # Translation
            if menus and self.model:
                all_names = []
                for m in menus:
                    for s in m["stations"]:
                        for i in s["items"]: all_names.append(i["name"])
                
                translations = await self.batch_translate(list(set(all_names)))
                for m in menus:
                    for s in m["stations"]:
                        for i in s["items"]:
                            i["name_ko"] = translations.get(i["name"], i["name"])
            else:
                for m in menus:
                    for s in m["stations"]:
                        for i in s["items"]: i["name_ko"] = i["name"]

            # Save
            final_doc = {
                "title": data.get("title"),
                "slug": slug,
                "date": date_str,
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "paymentTypes": [p.get("name") for p in data.get("paymentType", []) if isinstance(p, dict)],
                "menus": menus,
                "is_closed": len(menus) == 0,
                "updated_at": datetime.now()
            }
            await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": final_doc}, upsert=True)
            return final_doc
        except Exception as e:
            logger.error(f"Error for {slug}: {e}")
            return None

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            # Batch 50 items
            chunk = items[:50]
            prompt = f"Translate these American college dining menu items to appetizing Korean with short descriptions in parentheses. Return ONLY a JSON object mapping English to Korean.\nItems: {json.dumps(chunk)}"
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
