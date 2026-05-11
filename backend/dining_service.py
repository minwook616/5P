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
    "udm": {"id": 39, "title": "UDCC", "lat": "42.0253", "lng": "-93.6519", "address": "Union Drive Community Center, Ames, IA 50011"},
    "friley": {"id": 30, "title": "Friley Windows", "lat": "42.0244", "lng": "-93.6502", "address": "Friley Hall, Ames, IA 50012"},
    "seasons": {"id": 23, "title": "Seasons Marketplace", "lat": "42.0227", "lng": "-93.6393", "address": "Maple-Willow-Larch Commons, Ames, IA 50011"}
}

DINING_SLUGS = list(DINING_METADATA.keys())

class DiningService:
    def __init__(self, db):
        self.db = db
        self.collection = db["dining_menus"]
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            # Use a more modern/available model
            self.model = genai.GenerativeModel('gemini-flash-latest')
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
                await self.log_error(slug, date_str, "No meals for this date")
                return None

            # NEW PARSER (Object-based) - Super Defensive
            menus = []
            meals_dict = data.get("meals")
            if not isinstance(meals_dict, dict):
                meals_dict = {}
            
            # Sort meals safely
            try:
                m_keys = sorted(meals_dict.keys(), key=lambda x: int(x) if str(x).isdigit() else 999)
            except:
                m_keys = list(meals_dict.keys())

            for m_id in m_keys:
                m_info = meals_dict.get(m_id)
                if not isinstance(m_info, dict): continue
                
                section_name = m_info.get("meal", "Meal")
                stations = []
                
                displays = m_info.get("menu_displays")
                if not isinstance(displays, dict): displays = {}
                
                for d_id in displays:
                    d_info = displays.get(d_id)
                    if not isinstance(d_info, dict): continue
                    
                    items_list = []
                    categories = d_info.get("categories")
                    if not isinstance(categories, dict): categories = {}
                    
                    for c_slug in categories:
                        cat_info = categories.get(c_slug)
                        if not isinstance(cat_info, dict): continue
                        
                        cat_items = cat_info.get("items")
                        if not isinstance(cat_items, dict): cat_items = {}
                        
                        for i_id in cat_items:
                            item = cat_items.get(i_id)
                            if not isinstance(item, dict): continue
                            
                            # Nutrients
                            nutrients = item.get("nutrients")
                            if not isinstance(nutrients, dict): nutrients = {}
                            
                            kcal = "0"
                            if "kcal" in nutrients:
                                kcal_obj = nutrients.get("kcal")
                                if isinstance(kcal_obj, dict):
                                    kcal = str(kcal_obj.get("rounded_quantity") or kcal_obj.get("quantity") or "0")
                            
                            # Traits (Vegan, Halal, etc.)
                            traits = item.get("traits")
                            if not isinstance(traits, dict): traits = {}
                            
                            reqs = traits.get("requirement")
                            if not isinstance(reqs, dict): reqs = {}
                            
                            items_list.append({
                                "name": item.get("name") or "Unknown Item",
                                "totalCal": kcal,
                                "isVegan": "vegan" in reqs,
                                "isHalal": "halal" in reqs,
                                "isVegetarian": "vegetarian" in reqs,
                                "name_ko": item.get("name") or "Unknown Item"
                            })
                    
                    if items_list:
                        stations.append({"name": d_info.get("name", "Station"), "items": items_list})
                
                if stations:
                    menus.append({"section": section_name, "stations": stations})

            if not menus:
                await self.log_error(slug, date_str, "Parser: No items extracted (possibly closed)")
                return None

            # TRANSLATE
            if self.model:
                try:
                    all_names = list(set([i["name"] for m in menus for s in m["stations"] for i in s["items"] if i.get("name")]))
                    if all_names:
                        # Translate in chunks of 30 to avoid prompt too long and ensure quality
                        all_translations = {}
                        for i in range(0, len(all_names), 30):
                            chunk = all_names[i:i+30]
                            translations = await self.batch_translate(chunk)
                            all_translations.update(translations)
                            await asyncio.sleep(1) # Rate limit protection
                            
                        for m in menus:
                            for s in m["stations"]:
                                for i in s["items"]: 
                                    i["name_ko"] = all_translations.get(i["name"], i["name"])
                except Exception as e:
                    logger.error(f"Translation error: {e}")

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
        
        system_prompt = (
            "너는 미국 유학생을 위한 학식 번역가야. 주어진 영어 메뉴명을 한국인이 맛을 상상할 수 있게 의역하고 "
            "괄호 안에 짧은 설명을 덧붙여 줘. 어색한 직역은 피하고 식당 메뉴판처럼 써줘. "
            "(예: 'Breaded Beef Bites' -> '한입 비프까스 (바삭한 소고기 튀김)', "
            "'Stuffed Pepper Soup' -> '스터프드 페퍼 수프 (고기와 피망이 들어간 토마토 수프)') "
            "반드시 JSON 형식으로 응답하며, 키는 원본 영어명, 값은 번역된 한국어명이어야 해."
        )

        try:
            prompt = f"{system_prompt}\n\nTranslate these items: {json.dumps(items)}"
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: self.model.generate_content(
                prompt, generation_config={"response_mime_type": "application/json"}
            ))
            
            # Robust JSON extraction
            text = resp.text.strip()
            if text.startswith("```json"):
                text = text.split("```json")[1].split("```")[0].strip()
            elif text.startswith("```"):
                text = text.split("```")[1].split("```")[0].strip()
                
            return json.loads(text)
        except Exception as e:
            logger.error(f"batch_translate error: {e}")
            return {}

def setup_dining_scheduler(db):
    service = DiningService(db)
    scheduler = AsyncIOScheduler()
    scheduler.add_job(service.fetch_and_update_all, 'cron', hour=3, minute=0)
    scheduler.start()
    return service
