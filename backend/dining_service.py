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

# Correct slugs for ISU Dining based on website URLs
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
                    await asyncio.sleep(random.uniform(0.5, 1.5))
                except Exception as e:
                    logger.error(f"Error updating {slug} for {date_str}: {e}")
        logger.info("Dining data update completed.")

    async def fetch_and_update_single(self, slug, date_str):
        # Using the confirmed endpoint from debug/search
        base_url = "https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/"
        url = f"{base_url}?slug={slug}&date={date_str}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Referer": "https://www.dining.iastate.edu/hours-menus/"
        }
        
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: requests.get(url, headers=headers, timeout=20))
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch data for {slug} on {date_str}: {response.status_code}")
                return None

            data = response.json()
            # Handle list response
            if isinstance(data, list) and data:
                data = data[0]
            
            if not data or not data.get("title"):
                logger.warning(f"No valid data returned for {slug} on {date_str}")
                return None

            # 1. Parse data
            parsed_data = self.parse_dining_json(data, date_str)
            if not parsed_data or not parsed_data.get("menus"):
                logger.warning(f"No menus parsed for {slug} on {date_str}")
                # Even if no menus, save the metadata (title, lat, lng) to show closed status
                parsed_data = {
                    "title": data.get("title", slug),
                    "slug": slug,
                    "date": date_str,
                    "lat": data.get("lat"),
                    "lng": data.get("lng"),
                    "paymentTypes": [p.get("name") for p in data.get("paymentType", [])],
                    "menus": [],
                    "updated_at": datetime.now()
                }

            # 2. Extract menu items for translation
            all_menu_items = []
            for meal in parsed_data.get("menus", []):
                for station in meal.get("stations", []):
                    for item in station.get("items", []):
                        all_menu_items.append(item["name"])

            # 3. Batch Translate
            unique_items = list(set(all_menu_items))
            if unique_items and self.model:
                translations = await self.batch_translate(unique_items)
                for meal in parsed_data["menus"]:
                    for station in meal["stations"]:
                        for item in station["items"]:
                            item["name_ko"] = translations.get(item["name"], item["name"])
            else:
                for meal in parsed_data.get("menus", []):
                    for station in meal.get("stations", []):
                        for item in station.get("items", []):
                            item["name_ko"] = item["name"]

            # 4. Upsert into MongoDB
            await self.collection.update_one(
                {"slug": slug, "date": date_str},
                {"$set": parsed_data},
                upsert=True
            )
            logger.info(f"Updated {slug} for {date_str} (Menus: {len(parsed_data.get('menus', []))})")
            return parsed_data
        except Exception as e:
            logger.error(f"Error in fetch_and_update_single for {slug}: {e}")
            return None

    def parse_dining_json(self, data, date_str):
        try:
            title = data.get("title")
            lat = data.get("lat")
            lng = data.get("lng")
            payment_types = [p.get("name") for p in data.get("paymentType", [])]
            
            menus = []
            raw_menus = data.get("menus", [])
            
            # The API might return menus as a dictionary or a list
            if isinstance(raw_menus, dict):
                # If it's a dict, keys are sections (Breakfast, Lunch, etc.)
                for section, menu_data in raw_menus.items():
                    stations = []
                    # In some versions, items are directly under the section
                    # In others, there's a stations list
                    raw_stations = menu_data.get("stations", [])
                    for station_data in raw_stations:
                        station_name = station_data.get("name")
                        items = []
                        for item_data in station_data.get("items", []):
                            items.append({
                                "name": item_data.get("name"),
                                "totalCal": item_data.get("totalCal"),
                                "isVegan": item_data.get("isVegan", False),
                                "isHalal": item_data.get("isHalal", False),
                                "isVegetarian": item_data.get("isVegetarian", False)
                            })
                        if items:
                            stations.append({"name": station_name, "items": items})
                    if stations:
                        menus.append({"section": section, "stations": stations})
            
            elif isinstance(raw_menus, list):
                # If it's a list, each element is a section
                for menu_data in raw_menus:
                    section = menu_data.get("section")
                    stations = []
                    # It might be menuDisplays or stations
                    displays = menu_data.get("menuDisplays") or menu_data.get("stations") or []
                    for display in displays:
                        station_name = display.get("name")
                        items = []
                        # It might be categories -> menuItems or just items
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
                        else:
                            # Try direct items
                            for item_data in display.get("items", []):
                                items.append({
                                    "name": item_data.get("name"),
                                    "totalCal": item_data.get("totalCal"),
                                    "isVegan": item_data.get("isVegan", False),
                                    "isHalal": item_data.get("isHalal", False),
                                    "isVegetarian": item_data.get("isVegetarian", False)
                                })
                        if items:
                            stations.append({"name": station_name, "items": items})
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
            logger.error(f"Error parsing JSON for {date_str}: {e}")
            return None

    async def batch_translate(self, items):
        if not items:
            return {}
        
        system_prompt = (
            "너는 미국 유학생들을 위한 센스 있는 학식 메뉴 번역가야. "
            "주어진 영어 메뉴명을 한국인이 직관적으로 맛을 상상할 수 있게 자연스럽게 의역하고, 괄호 안에 짧은 설명을 덧붙여 줘. "
            "어색한 직역(예: 고기채움 수프)은 절대 피하고, 한국 식당 메뉴판처럼 먹음직스럽게 써줘.\n\n"
            "예시 1: 'Breaded Beef Bites' -> '한입 비프까스 (바삭한 소고기 튀김)'\n"
            "예시 2: 'Sloppy Joe' -> '슬로피 조 (다진 고기 바비큐 소스 버거)'\n"
            "예시 3: 'Cilantro Lime Rice' -> '고수 라임 라이스 (상큼한 멕시칸 스타일 볶음밥)'\n"
            "예시 4: 'Stuffed Pepper Soup' -> '스터프드 페퍼 수프 (다진 고기와 피망이 들어간 토마토 수프)'\n\n"
            "결과는 원본 영어 메뉴명과 한국어 번역이 매핑된 JSON 형식으로만 반환해. "
            "형식: {\"English Name\": \"Korean Translation\", ...}"
        )

        prompt = f"다음 메뉴들을 번역해줘:\n{json.dumps(items, ensure_ascii=False)}"
        
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: self.model.generate_content(
                f"{system_prompt}\n\n{prompt}",
                generation_config={"response_mime_type": "application/json"}
            ))
            translations = json.loads(response.text)
            return translations
        except Exception as e:
            logger.error(f"LLM Translation error: {e}")
            return {}

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    logger.info("Dining scheduler started.")
    return service
