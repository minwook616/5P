import requests
import json
import time
from datetime import datetime

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
}

base_url = "https://www.dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/"
slug = "union-drive-marketplace"

# Try a few different ways to specify time
# 1. Current timestamp
# 2. Timestamp for 12:00 PM today
# 3. Date string

now_ts = int(time.time())
print(f"Current TS: {now_ts}")

test_params = [
    {"time": now_ts},
    {"time": "2026-05-08"},
    {"date": "2026-05-08"}
]

for p in test_params:
    r = requests.get(base_url, params={"slug": slug, **p}, headers=headers, timeout=10)
    print(f"Params: {p} | Status: {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        if isinstance(data, list) and data:
            data = data[0]
        
        menus = data.get("menus", [])
        print(f"  Menus found: {len(menus) if isinstance(menus, list) else 'N/A (type: ' + str(type(menus)) + ')'}")
        if isinstance(menus, dict):
            print(f"  Menu sections: {list(menus.keys())}")
        elif isinstance(menus, list) and menus:
            print(f"  First menu keys: {list(menus[0].keys())}")
            if 'menuDisplays' in menus[0]:
                print(f"    menuDisplays count: {len(menus[0]['menuDisplays'])}")
