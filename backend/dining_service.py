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

# Hardcoded metadata for reliability
DINING_METADATA = {
    "union-drive-marketplace": {
        "title": "Union Drive Marketplace (UDM)",
        "lat": 42.0253,
        "lng": -93.6519,
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars", "Credit Card"]
    },
    "friley-windows": {
        "title": "Friley Windows",
        "lat": 42.0244,
        "lng": -93.6502,
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars", "Credit Card"]
    },
    "seasons-marketplace": {
        "title": "Seasons Marketplace",
        "lat": 42.0227,
        "lng": -93.6393,
        "paymentTypes": ["Meal Office", "Flex Meals", "Dining Dollars", "Credit Card"]
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
        for i in range(14):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            for slug in DINING_SLUGS:
                await self.fetch_and_update_single(slug, date_str)
                await asyncio.sleep(0.3)

    async def fetch_and_update_single(self, slug, date_str):
        url = f"https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/?slug={slug}&date={date_str}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.dining.iastate.edu/hours-menus/",
        }
        
        meta = DINING_METADATA.get(slug, {})
        parsed_data = {
            "title": meta.get("title", slug),
            "slug": slug,
            "date": date_str,
            "lat": meta.get("lat"),
            "lng": meta.get("lng"),
            "paymentTypes": meta.get("paymentTypes", []),
            "menus": [],
            "updated_at": datetime.now()
        }

        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=10))
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data: data = data[0]
                
                # Update metadata from live data if available
                if data.get("title"): parsed_data["title"] = data.get("title")
                if data.get("lat"): parsed_data["lat"] = data.get("lat")
                if data.get("lng"): parsed_data["lng"] = data.get("lng")
                
                # Parse menus
                raw_menus = data.get("menus", [])
                menus = []
                
                sections = []
                if isinstance(raw_menus, list): sections = raw_menus
                elif isinstance(raw_menus, dict): 
                    for k, v in raw_menus.items():
                        if isinstance(v, dict):
                            v["section"] = k
                            sections.append(v)

                for sec in sections:
                    section_name = sec.get("section", "Meal")
                    stations = []
                    # Try all possible keys for stations
                    displays = sec.get("menuDisplays") or sec.get("stations") or sec.get("menu_displays") or []
                    for d in displays:
                        items = []
                        # Items can be in 'items' or 'categories -> menuItems'
                        raw_items = d.get("items") or []
                        for cat in d.get("categories", []):
                            raw_items.extend(cat.get("menuItems", []))
                        
                        for ri in raw_items:
                            if not ri.get("name"): continue
                            items.append({
                                "name": ri.get("name"),
                                "totalCal": ri.get("totalCal") or ri.get("calories"),
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

            # Save (even if menus empty, to fix the 'Undefined llc' problem)
            await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": parsed_data}, upsert=True)
            return parsed_data
        except Exception as e:
            logger.error(f"Fetch error for {slug}: {e}")
            # Still save metadata on error
            await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": parsed_data}, upsert=True)
            return parsed_data

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            chunk = items[:50]
            prompt = f"Return JSON mapping English menu to natural Korean: {json.dumps(chunk)}"
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
