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

# Correct slugs for ISU Dining
DINING_SLUGS = [
    "union-drive-marketplace",
    "friley-windows",
    "seasons-marketplace"
]

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
                    await asyncio.sleep(random.uniform(0.5, 1.0))
                except Exception as e:
                    logger.error(f"Error updating {slug} for {date_str}: {e}")
        logger.info("Dining data update completed.")

    async def fetch_and_update_single(self, slug, date_str):
        # We try multiple endpoint patterns because ISU often changes them
        base_url = "https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/"
        
        # Try both date format and timestamp format
        try:
            dt_obj = datetime.strptime(date_str, "%Y-%m-%d")
            timestamp = int(dt_obj.timestamp())
        except:
            timestamp = int(time.time())

        params_list = [
            {"slug": slug, "date": date_str},
            {"slug": slug, "time": timestamp}
        ]
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.dining.iastate.edu/hours-menus/",
            "Origin": "https://www.dining.iastate.edu"
        }
        
        raw_data = None
        for params in params_list:
            try:
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(None, lambda: requests.get(base_url, params=params, headers=headers, timeout=15))
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list) and data:
                        data = data[0]
                    # If it has menus, we found it
                    if data.get("menus"):
                        raw_data = data
                        break
            except Exception as e:
                logger.warning(f"Failed fetch with params {params}: {e}")
                continue
        
        if not raw_data:
            logger.error(f"Could not get menu data for {slug} on {date_str}")
            return None

        # 1. Parse data
        parsed_data = self.parse_dining_json(raw_data, date_str)
        if not parsed_data:
            return None

        # 2. Translate items (only if menus exist)
        if parsed_data.get("menus"):
            all_menu_items = []
            for meal in parsed_data["menus"]:
                for station in meal["stations"]:
                    for item in station["items"]:
                        all_menu_items.append(item["name"])

            unique_items = list(set(all_menu_items))
            if unique_items and self.model:
                translations = await self.batch_translate(unique_items)
                for meal in parsed_data["menus"]:
                    for station in meal["stations"]:
                        for item in station["items"]:
                            item["name_ko"] = translations.get(item["name"], item["name"])
            else:
                for meal in parsed_data["menus"]:
                    for station in meal["stations"]:
                        for item in station["items"]:
                            item["name_ko"] = item["name"]

        # 4. Upsert into MongoDB
        await self.collection.update_one(
            {"slug": slug, "date": date_str},
            {"$set": parsed_data},
            upsert=True
        )
        logger.info(f"Updated {slug} for {date_str}. Menus: {len(parsed_data.get('menus', []))}")
        return parsed_data

    def parse_dining_json(self, data, date_str):
        try:
            title = data.get("title")
            lat = data.get("lat")
            lng = data.get("lng")
            payment_types = [p.get("name") for p in data.get("paymentType", [])]
            
            menus = []
            raw_menus = data.get("menus", [])
            
            # Helper to extract items from a display/station
            def extract_items(display):
                items = []
                # Check for menuItems inside categories
                cats = display.get("categories", [])
                if cats:
                    for cat in cats:
                        for item_data in cat.get("menuItems", []):
                            items.append({
                                "name": item_data.get("name"),
                                "totalCal": item_data.get("totalCal"),
                                "isVegan": item_data.get("isVegan", False),
                                "isHalal": item_data.get("isHalal", False),
                                "isVegetarian": item_data.get("isVegetarian", False)
                            })
                # Check for direct items
                elif display.get("items"):
                    for item_data in display.get("items", []):
                        items.append({
                            "name": item_data.get("name"),
                            "totalCal": item_data.get("totalCal"),
                            "isVegan": item_data.get("isVegan", False),
                            "isHalal": item_data.get("isHalal", False),
                            "isVegetarian": item_data.get("isVegetarian", False)
                        })
                return items

            if isinstance(raw_menus, list):
                for menu_data in raw_menus:
                    section = menu_data.get("section")
                    stations = []
                    displays = menu_data.get("menuDisplays") or menu_data.get("stations") or []
                    for display in displays:
                        items = extract_items(display)
                        if items:
                            stations.append({"name": display.get("name"), "items": items})
                    if stations:
                        menus.append({"section": section, "stations": stations})
            
            elif isinstance(raw_menus, dict):
                for section, menu_data in raw_menus.items():
                    stations = []
                    raw_stations = menu_data.get("stations") or menu_data.get("menuDisplays") or []
                    for s_data in raw_stations:
                        items = extract_items(s_data)
                        if items:
                            stations.append({"name": s_data.get("name"), "items": items})
                    if stations:
                        menus.append({"section": section, "stations": stations})

            return {
                "title": title,
                "slug": data.get("slug"),
                "date": date_str,
                "lat": lat,
                "lng": lng,
                "paymentTypes": payment_types,
                "menus": menus,
                "updated_at": datetime.now()
            }
        except Exception as e:
            logger.error(f"Error parsing JSON: {e}")
            return None

    async def batch_translate(self, items):
        if not items: return {}
        system_prompt = (
            "너는 미국 유학생들을 위한 센스 있는 학식 메뉴 번역가야. "
            "음식명을 한국인이 직관적으로 맛을 상상할 수 있게 자연스럽게 의역하고, 괄호 안에 짧은 설명을 덧붙여 줘. "
            "결과는 원본 영어 메뉴명과 한국어 번역이 매핑된 JSON 형식으로만 반환해. "
            "형식: {\"English Name\": \"Korean Translation\", ...}"
        )
        prompt = f"다음 메뉴들을 번역해줘:\n{json.dumps(items[:50], ensure_ascii=False)}" # Limit to 50 items per batch
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: self.model.generate_content(
                f"{system_prompt}\n\n{prompt}",
                generation_config={"response_mime_type": "application/json"}
            ))
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"LLM Translation error: {e}")
            return {}

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    return service
