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

# BULLETPROOF METADATA
DINING_METADATA = {
    "union-drive-marketplace": {
        "title": "Union Drive Marketplace (UDM)",
        "lat": "42.0253",
        "lng": "-93.6519",
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars"]
    },
    "friley-windows": {
        "title": "Friley Windows",
        "lat": "42.0244",
        "lng": "-93.6502",
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars"]
    },
    "seasons-marketplace": {
        "title": "Seasons Marketplace",
        "lat": "42.0227",
        "lng": "-93.6393",
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars"]
    }
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
        for i in range(7): # Focus on next 7 days for reliability
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            tasks = [self.fetch_and_update_single(slug, date_str) for slug in DINING_SLUGS]
            await asyncio.gather(*tasks)
            await asyncio.sleep(1.0)

    async def fetch_and_update_single(self, slug, date_str):
        # We try BOTH common endpoints
        endpoints = [
            f"https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/?slug={slug}&date={date_str}",
            f"https://www.dining.iastate.edu/wp-json/dining/v1/get-single-location/?slug={slug}&date={date_str}"
        ]
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.dining.iastate.edu/hours-menus/",
        }
        
        meta = DINING_METADATA[slug]
        raw_data = None
        
        for url in endpoints:
            try:
                loop = asyncio.get_event_loop()
                resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=10))
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and data: data = data[0]
                    if data.get("menus"):
                        raw_data = data
                        break
            except: continue

        # Build Document
        parsed_data = {
            "slug": slug,
            "title": meta["title"],
            "date": date_str,
            "lat": meta["lat"], # Prefer hardcoded for map stability
            "lng": meta["lng"],
            "paymentTypes": meta["paymentTypes"],
            "menus": [],
            "updated_at": datetime.now()
        }

        if raw_data:
            # Smart Parsing
            menus = []
            raw_menus = raw_data.get("menus", [])
            sections = []
            if isinstance(raw_menus, list): sections = raw_menus
            elif isinstance(raw_menus, dict):
                for k, v in raw_menus.items():
                    if isinstance(v, dict): v["section"] = k; sections.append(v)

            for sec in sections:
                section_name = sec.get("section", "Meal")
                stations = []
                displays = sec.get("menuDisplays") or sec.get("stations") or []
                for d in displays:
                    items = []
                    raw_items = d.get("items") or []
                    for cat in d.get("categories", []): raw_items.extend(cat.get("menuItems", []))
                    
                    for ri in raw_items:
                        if not ri.get("name"): continue
                        items.append({
                            "name": ri.get("name"),
                            "totalCal": str(ri.get("totalCal") or ri.get("calories") or "0"),
                            "isVegan": ri.get("isVegan", False),
                            "isHalal": ri.get("isHalal", False),
                            "isVegetarian": ri.get("isVegetarian", False)
                        })
                    if items:
                        stations.append({"name": d.get("name", "Station"), "items": items})
                if stations:
                    menus.append({"section": section_name, "stations": stations})
            
            parsed_data["menus"] = menus
            
            # Translation
            if menus and self.model:
                all_names = [i["name"] for m in menus for s in m["stations"] for i in s["items"]]
                translations = await self.batch_translate(list(set(all_names)))
                for m in menus:
                    for s in m["stations"]:
                        for i in s["items"]: i["name_ko"] = translations.get(i["name"], i["name"])
            else:
                for m in menus:
                    for s in m["stations"]:
                        for i in s["items"]: i["name_ko"] = i["name"]

        # Final Save
        await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": parsed_data}, upsert=True)
        return parsed_data

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            chunk = items[:40]
            prompt = f"Map English menu names to appetizing Korean translations in JSON format: {json.dumps(chunk)}"
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
