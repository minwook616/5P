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

# All possible slug variations to try
DINING_SLUGS = ["union-drive-marketplace", "friley-windows", "seasons-marketplace"]
ALT_SLUGS = {
    "union-drive-marketplace": ["udm", "union-drive-marketplace"],
    "friley-windows": ["friley-windows", "friley-windows-dining-center", "friley"],
    "seasons-marketplace": ["seasons-marketplace", "seasons"]
}

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
            logger.warning("GEMINI_API_KEY not found. Translation will be skipped.")

    async def fetch_and_update_all(self):
        logger.info("Starting dining data update...")
        today = datetime.now().date()
        for i in range(14):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            for slug in DINING_SLUGS:
                try:
                    await self.fetch_and_update_single(slug, date_str)
                    await asyncio.sleep(0.5)
                except Exception as e:
                    logger.error(f"Error updating {slug} for {date_str}: {e}")
        logger.info("Dining data update completed.")

    async def fetch_and_update_single(self, primary_slug, date_str):
        base_url = "https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/"
        v1_url = "https://www.dining.iastate.edu/wp-json/dining/v1/get-single-location/"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.dining.iastate.edu/hours-menus/"
        }
        
        # Try different slugs for this dining hall
        slugs_to_try = ALT_SLUGS.get(primary_slug, [primary_slug])
        
        raw_data = None
        for slug in slugs_to_try:
            for api_url in [base_url, v1_url]:
                try:
                    loop = asyncio.get_event_loop()
                    response = await loop.run_in_executor(None, lambda: requests.get(
                        api_url, params={"slug": slug, "date": date_str}, headers=headers, timeout=10
                    ))
                    if response.status_code == 200:
                        data = response.json()
                        if isinstance(data, list) and data: data = data[0]
                        if data and data.get("menus"):
                            raw_data = data
                            break
                except: continue
            if raw_data: break
        
        if not raw_data: return None

        # Parse
        parsed_data = self.parse_dining_json(raw_data, date_str, primary_slug)
        if not parsed_data: return None

        # Translate
        if parsed_data.get("menus") and self.model:
            items = []
            for m in parsed_data["menus"]:
                for s in m["stations"]:
                    for i in s["items"]: items.append(i["name"])
            
            unique_items = list(set(items))
            translations = await self.batch_translate(unique_items)
            for m in parsed_data["menus"]:
                for s in m["stations"]:
                    for i in s["items"]:
                        i["name_ko"] = translations.get(i["name"], i["name"])
        else:
            for m in parsed_data.get("menus", []):
                for s in m["stations"]:
                    for i in s["items"]: i["name_ko"] = i["name"]

        # Save with the primary_slug for consistent DB lookups
        parsed_data["slug"] = primary_slug
        await self.collection.update_one(
            {"slug": primary_slug, "date": date_str},
            {"$set": parsed_data},
            upsert=True
        )
        return parsed_data

    def parse_dining_json(self, data, date_str, slug):
        try:
            menus = []
            raw_menus = data.get("menus", [])
            
            def get_itms(d):
                itms = []
                # Handle categories -> menuItems
                for c in d.get("categories", []):
                    for mi in c.get("menuItems", []):
                        itms.append({
                            "name": mi.get("name"),
                            "totalCal": mi.get("totalCal"),
                            "isVegan": mi.get("isVegan", False),
                            "isHalal": mi.get("isHalal", False),
                            "isVegetarian": mi.get("isVegetarian", False)
                        })
                # Handle direct items
                if not itms and d.get("items"):
                    for mi in d.get("items", []):
                        itms.append({
                            "name": mi.get("name"),
                            "totalCal": mi.get("totalCal"),
                            "isVegan": mi.get("isVegan", False),
                            "isHalal": mi.get("isHalal", False),
                            "isVegetarian": mi.get("isVegetarian", False)
                        })
                return itms

            if isinstance(raw_menus, list):
                for m in raw_menus:
                    section = m.get("section")
                    stations = []
                    ds = m.get("menuDisplays") or m.get("stations") or []
                    for d in ds:
                        itms = get_itms(d)
                        if itms: stations.append({"name": d.get("name"), "items": itms})
                    if stations: menus.append({"section": section, "stations": stations})
            elif isinstance(raw_menus, dict):
                for sec, m in raw_menus.items():
                    stations = []
                    ds = m.get("stations") or m.get("menuDisplays") or []
                    for d in ds:
                        itms = get_itms(d)
                        if itms: stations.append({"name": d.get("name"), "items": itms})
                    if stations: menus.append({"section": sec, "stations": stations})

            return {
                "title": data.get("title"),
                "slug": slug,
                "date": date_str,
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "paymentTypes": [p.get("name") for p in data.get("paymentType", []) if isinstance(p, dict)],
                "menus": menus,
                "updated_at": datetime.now()
            }
        except: return None

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            prompt = f"Translate to Korean (natural, appetizing, with short description in parenthesis):\n{json.dumps(items[:40])}"
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
