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

# PROXY & SLUG SETTINGS
PROXY_BASE_URL = "https://isu-dining-proxy.minwoo01616.workers.dev/wp-json/dining/v1/get-single-location/"
DINING_HALLS = [
    {"slug": "union-drive-marketplace-2-2", "display_name": "UDM"},
    {"slug": "friley-windows-2-2", "display_name": "Friley Windows"},
    {"slug": "seasons-marketplace-2-2", "display_name": "Seasons"}
]

# Hardcoded metadata fallbacks for reliability
DINING_COORDS = {
    "union-drive-marketplace-2-2": {"lat": "42.0253", "lng": "-93.6519"},
    "friley-windows-2-2": {"lat": "42.0244", "lng": "-93.6502"},
    "seasons-marketplace-2-2": {"lat": "42.0227", "lng": "-93.6393"}
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

    async def fetch_and_update_all(self):
        logger.info("Starting dining data update via Proxy...")
        today = datetime.now().date()
        for i in range(14):
            date_str = (today + timedelta(days=i)).strftime("%Y-%m-%d")
            for hall in DINING_HALLS:
                try:
                    await self.fetch_and_update_single(hall["slug"], date_str)
                    await asyncio.sleep(0.5) # Minimal delay since we use proxy
                except Exception as e:
                    logger.error(f"Error updating {hall['slug']} for {date_str}: {e}")
        logger.info("Dining data update completed.")

    async def fetch_and_update_single(self, slug, date_str):
        url = f"{PROXY_BASE_URL}?slug={slug}&date={date_str}"
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(url, timeout=20))
            if resp.status_code != 200:
                logger.error(f"Proxy returned {resp.status_code} for {slug}")
                return None

            data = resp.json()
            if isinstance(data, list) and data: data = data[0]
            if not data or not data.get("menus"):
                return None

            # 1. Parse JSON
            parsed_data = self.parse_json(data, date_str, slug)
            if not parsed_data or not parsed_data["menus"]:
                return None

            # 2. Batch Translation
            if self.model:
                all_names = []
                for meal in parsed_data["menus"]:
                    for station in meal["stations"]:
                        for item in station["items"]:
                            all_names.append(item["name"])
                
                unique_names = list(set(all_names))
                if unique_names:
                    translations = await self.batch_translate(unique_names)
                    for meal in parsed_data["menus"]:
                        for station in meal["stations"]:
                            for item in station["items"]:
                                item["name_ko"] = translations.get(item["name"], item["name"])
            
            # 3. Upsert into MongoDB
            await self.collection.update_one(
                {"slug": slug, "date": date_str},
                {"$set": parsed_data},
                upsert=True
            )
            logger.info(f"Successfully updated {slug} for {date_str}")
            return parsed_data

        except Exception as e:
            logger.error(f"Fetch failed for {slug}: {e}")
            return None

    def parse_json(self, data, date_str, slug):
        try:
            # Extract basic info
            title = data.get("title", slug)
            # Use data coordinates or fallback to hardcoded
            lat = str(data.get("lat") or DINING_COORDS.get(slug, {}).get("lat"))
            lng = str(data.get("lng") or DINING_COORDS.get(slug, {}).get("lng"))
            
            menus = []
            raw_menus = data.get("menus", [])
            
            # Normalize list vs dict
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
                    # Extract items from categories -> menuItems
                    for cat in d.get("categories", []):
                        for mi in cat.get("menuItems", []):
                            items.append({
                                "name": mi.get("name"),
                                "totalCal": str(mi.get("totalCal") or "0"),
                                "isVegan": bool(mi.get("isVegan", False)),
                                "isHalal": bool(mi.get("isHalal", False)),
                                "isVegetarian": bool(mi.get("isVegetarian", False)),
                                "name_ko": mi.get("name") # Default to English
                            })
                    
                    if items:
                        stations.append({"name": d.get("name", "Station"), "items": items})
                
                if stations:
                    menus.append({"section": section_name, "stations": stations})

            return {
                "title": title,
                "slug": slug,
                "date": date_str,
                "lat": lat,
                "lng": lng,
                "menus": menus,
                "updated_at": datetime.now()
            }
        except Exception as e:
            logger.error(f"Parsing error: {e}")
            return None

    async def batch_translate(self, names):
        if not self.model: return {}
        
        system_prompt = (
            "너는 미국 유학생을 위한 학식 번역가야. "
            "주어진 영어 메뉴명을 한국인이 맛을 상상할 수 있게 의역하고 괄호 안에 짧은 설명을 덧붙여 줘. "
            "어색한 직역은 피하고 식당 메뉴판처럼 써줘. "
            "(예: 'Breaded Beef Bites' -> '한입 비프까스 (바삭한 소고기 튀김)', "
            "'Stuffed Pepper Soup' -> '스터프드 페퍼 수프 (고기와 피망이 들어간 토마토 수프)') "
            "결과는 오직 원본 영문명을 Key로, 한글 번역명을 Value로 하는 JSON 객체만 반환해."
        )

        translations = {}
        # Batch by 40 to avoid token limits
        for i in range(0, len(names), 40):
            chunk = names[i:i+40]
            try:
                loop = asyncio.get_event_loop()
                resp = await loop.run_in_executor(None, lambda: self.model.generate_content(
                    f"{system_prompt}\n\nTranslate: {json.dumps(chunk)}",
                    generation_config={"response_mime_type": "application/json"}
                ))
                translations.update(json.loads(resp.text))
            except: continue
        return translations

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    return service
