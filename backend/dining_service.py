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

PROXY_DOMAIN = "https://new.dining.iastate.edu/api"

DINING_METADATA = {
    "udm": {"id": 39, "title": "UDCC", "lat": "42.0253", "lng": "-93.6519"},
    "friley": {"id": 30, "title": "Friley Windows", "lat": "42.0244", "lng": "-93.6502"},
    "seasons": {"id": 23, "title": "Seasons Marketplace", "lat": "42.0227", "lng": "-93.6393"}
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
        venue_id = meta["id"]
        url = f"{PROXY_DOMAIN}/venue/{venue_id}/menu/{date_str}"
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(url, timeout=25)) 
            
            if resp.status_code != 200:
                await self.log_error(slug, date_str, f"ISU API Error: {resp.status_code}")
                return None

            data = resp.json()
            if not data or not data.get("meals"):
                await self.log_error(slug, date_str, "ISU API: No meals found for this date")
                return None

            # NEW PARSER (Object-based)
            menus = []
            meals_dict = data.get("meals") or {}
            
            for m_id in sorted(meals_dict.keys(), key=lambda x: int(x)):
                m_info = meals_dict[m_id] or {}
                section_name = m_info.get("meal", "Meal")
                stations = []
                
                displays = m_info.get("menu_displays") or {}
                for d_id in displays:
                    d_info = displays[d_id] or {}
                    items = []
                    categories = d_info.get("categories") or {}
                    for c_slug in categories:
                        cat_info = categories[c_slug] or {}
                        cat_items = cat_info.get("items") or {}
                        for i_id in cat_items:
                            item = cat_items[i_id]
                            if not item: continue
                            
                            # Nutrients
                            nutrients = item.get("nutrients") or {}
                            kcal = "0"
                            if "kcal" in nutrients:
                                kcal_obj = nutrients["kcal"] or {}
                                kcal = kcal_obj.get("rounded_quantity") or kcal_obj.get("quantity") or "0"
                            
                            # Traits (Vegan, Halal, etc.)
                            reqs = item.get("traits", {}).get("requirement") or {}
                            
                            items.append({
                                "name": item.get("name"),
                                "totalCal": str(kcal),
                                "isVegan": "vegan" in reqs,
                                "isHalal": "halal" in reqs,
                                "isVegetarian": "vegetarian" in reqs,
                                "name_ko": item.get("name")
                            })
                    
                    if items:
                        stations.append({"name": d_info.get("name", "Station"), "items": items})
                
                if stations:
                    menus.append({"section": section_name, "stations": stations})

            if not menus:
                await self.log_error(slug, date_str, "Parser: No items extracted")
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
