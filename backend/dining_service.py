import os
import time
import random
import logging
import json
import requests
from datetime import datetime, timedelta
import google.generativeai as genai
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger("dining_service")

# Slugs for the 3 main dining halls
DINING_SLUGS = ["udm", "friley-windows", "seasons-marketplace"]

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
                    # Random sleep to prevent server blocking
                    time.sleep(random.uniform(1.0, 3.0))
                except Exception as e:
                    logger.error(f"Error updating {slug} for {date_str}: {e}")
        logger.info("Dining data update completed.")

    async def fetch_and_update_single(self, slug, date_str):
        url = f"https://www.dining.iastate.edu/wp-json/dining/v1/get-single-location/?slug={slug}&date={date_str}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.dining.iastate.edu/locations/udm/",
            "Origin": "https://www.dining.iastate.edu"
        }
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code != 200:
            logger.error(f"Failed to fetch data for {slug} on {date_str}: {response.status_code}")
            return

        data = response.json()
        if not data:
            return

        # 1. Parse data
        parsed_data = self.parse_dining_json(data, date_str)
        if not parsed_data:
            return

        # 2. Extract menu items for translation
        all_menu_items = []
        for meal in parsed_data["menus"]:
            for station in meal["stations"]:
                for item in station["items"]:
                    all_menu_items.append(item["name"])

        # 3. Batch Translate
        unique_items = list(set(all_menu_items))
        if unique_items and self.model:
            translations = await self.batch_translate(unique_items)
            # Map translations back
            for meal in parsed_data["menus"]:
                for station in meal["stations"]:
                    for item in station["items"]:
                        item["name_ko"] = translations.get(item["name"], item["name"])
        else:
            # Fallback if no model or items
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
        logger.info(f"Updated {slug} for {date_str}")

    def parse_dining_json(self, data, date_str):
        try:
            title = data.get("title")
            lat = data.get("lat")
            lng = data.get("lng")
            payment_types = [p.get("name") for p in data.get("paymentType", [])]
            
            menus = []
            for menu_data in data.get("menus", []):
                section = menu_data.get("section") # e.g., Breakfast, Lunch
                stations = []
                for display in menu_data.get("menuDisplays", []):
                    station_name = display.get("name")
                    items = []
                    for cat in display.get("categories", []):
                        for item_data in cat.get("menuItems", []):
                            item = {
                                "name": item_data.get("name"),
                                "totalCal": item_data.get("totalCal"),
                                "isVegan": item_data.get("isVegan", False),
                                "isHalal": item_data.get("isHalal", False),
                                "isVegetarian": item_data.get("isVegetarian", False)
                            }
                            items.append(item)
                    if items:
                        stations.append({
                            "name": station_name,
                            "items": items
                        })
                if stations:
                    menus.append({
                        "section": section,
                        "stations": stations
                    })

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
            response = self.model.generate_content(
                f"{system_prompt}\n\n{prompt}",
                generation_config={"response_mime_type": "application/json"}
            )
            translations = json.loads(response.text)
            return translations
        except Exception as e:
            logger.error(f"LLM Translation error: {e}")
            return {}

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    # Schedule every day at 3 AM
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    logger.info("Dining scheduler started.")
    return service
