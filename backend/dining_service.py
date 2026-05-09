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

# USE THE PROXY PROVIDED BY USER
PROXY_DOMAIN = "https://isu-dining-proxy.minwoo01616.workers.dev"

# LATEST SLUGS PROVIDED BY USER
DINING_METADATA = {
    "union-drive-marketplace-2-2": {
        "id": 1,
        "title": "UDM",
        "lat": "42.0253",
        "lng": "-93.6519"
    },
    "friley-windows-2-2": {
        "id": 4,
        "title": "Friley Windows",
        "lat": "42.0244",
        "lng": "-93.6502"
    },
    "seasons-marketplace-2-2": {
        "id": 3,
        "title": "Seasons Marketplace",
        "lat": "42.0227",
        "lng": "-93.6393"
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
        for i in range(7):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            tasks = [self.fetch_and_update_single(slug, date_str) for slug in DINING_SLUGS]
            await asyncio.gather(*tasks)
            await asyncio.sleep(0.5)

    async def fetch_and_update_single(self, slug, date_str):
        meta = DINING_METADATA.get(slug)
        if not meta: return None

        # TARGET PROXY URLS
        urls = [
            f"{PROXY_DOMAIN}/wp-json/dining/menu-hours/get-single-location/?slug={slug}&date={date_str}",
            f"{PROXY_DOMAIN}/wp-json/dining/v1/get-single-location/?slug={slug}&date={date_str}",
            f"{PROXY_DOMAIN}/wp-json/dining/v1/get-menus/?location={meta['id']}&date={date_str}"
        ]
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.dining.iastate.edu/hours-menus/",
        }
        
        raw_data = None
        for url in urls:
            try:
                loop = asyncio.get_event_loop()
                resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=12))
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and data: data = data[0]
                    if data and (data.get("menus") or any(k in data for k in ["Breakfast", "Lunch", "Dinner"])):
                        raw_data = data
                        break
            except: continue

        doc = {
            "slug": slug,
            "title": meta["title"],
            "date": date_str,
            "lat": meta["lat"],
            "lng": meta["lng"],
            "menus": [],
            "updated_at": datetime.now()
        }

        if raw_data:
            menus = []
            raw_menus = raw_data.get("menus") if isinstance(raw_data, dict) and "menus" in raw_data else raw_data
            
            sections = []
            if isinstance(raw_menus, list): sections = raw_menus
            elif isinstance(raw_menus, dict):
                for k, v in raw_menus.items():
                    if isinstance(v, dict): v["section"] = k; sections.append(v)

            for sec in sections:
                section_name = sec.get("section", "Meal")
                stations = []
                displays = sec.get("menuDisplays") or sec.get("stations") or []
                if isinstance(displays, dict):
                    displays = [{"name": k, "items": v.get("items", [])} for k, v in displays.items()]

                for d in displays:
                    items = []
                    raw_items = d.get("items") or []
                    for cat in d.get("categories", []): raw_items.extend(cat.get("menuItems", []))
                    
                    for ri in raw_items:
                        if not ri.get("name"): continue
                        items.append({
                            "name": ri.get("name"),
                            "totalCal": str(ri.get("totalCal") or ri.get("calories") or "0"),
                            "isVegan": bool(ri.get("isVegan", False)),
                            "isHalal": bool(ri.get("isHalal", False)),
                            "isVegetarian": bool(ri.get("isVegetarian", False)),
                            "name_ko": ri.get("name") # Default
                        })
                    if items:
                        stations.append({"name": d.get("name", "Station"), "items": items})
                if stations:
                    menus.append({"section": section_name, "stations": stations})
            
            doc["menus"] = menus
            
            # TRANSLATE
            if menus and self.model:
                try:
                    all_names = list(set([i["name"] for m in menus for s in m["stations"] for i in s["items"]]))
                    translations = await self.batch_translate(all_names[:40])
                    for m in menus:
                        for s in m["stations"]:
                            for i in s["items"]: i["name_ko"] = translations.get(i["name"], i["name"])
                except: pass

        await self.collection.update_one({"slug": slug, "date": date_str}, {"$set": doc}, upsert=True)
        return doc

    async def batch_translate(self, items):
        if not items or not self.model: return {}
        try:
            prompt = (
                "너는 미국 유학생을 위한 학식 번역가야. "
                "주어진 영어 메뉴명을 한국인이 맛을 상상할 수 있게 의역하고 괄호 안에 짧은 설명을 덧붙여 줘. "
                "결과는 오직 원본 영문명을 Key로, 한글 번역명을 Value로 하는 JSON 객체만 반환해.\n"
                f"메뉴: {json.dumps(items)}"
            )
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
