#!/usr/bin/env python
import requests
import json
import sys

sys.path.insert(0, 'backend')

from api.config import WAQI_URL, WAQI_API_TOKEN

url = f"{WAQI_URL}/?token={WAQI_API_TOKEN}&lat=28.6139&lon=77.2090"
print(f"Testing WAQI API...")
print(f"URL: {url}\n")

try:
    resp = requests.get(url, timeout=10)
    print(f"Status Code: {resp.status_code}")
    print(f"Response Headers: {dict(resp.headers)}\n")
    
    text = resp.text
    print(f"Response Text: {text[:1000]}\n")
    
    data = resp.json()
    print(f"JSON Response:")
    print(json.dumps(data, indent=2))
    
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
