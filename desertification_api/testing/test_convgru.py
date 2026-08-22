import requests
import base64

# 1. Hit your FastAPI forecast endpoint
print("[*] Calling FastAPI Forecast Endpoint (This might take a few minutes on CPU!)...")
response = requests.post(
    "http://localhost:8000/api/v1/analyze/forecast",
    json={
        "coordinates": [
            [
                [68.35, 25.35],
                [68.40, 25.35],
                [68.40, 25.40],
                [68.35, 25.40],
                [68.35, 25.35]
            ]
        ]
    }
)

if response.status_code == 200:
    data = response.json()
    
    # 2. Extract the massive Base64 string directly from the JSON
    # Notice we use 'anomaly_map' here matching the output from routes.py
    b64_string = data['visualizations']['anomaly_map']
    
    # 3. Decode the string into raw binary bytes
    image_bytes = base64.b64decode(b64_string)
    
    # 4. Save the bytes to a real .png file
    with open("full_anomaly_map.png", "wb") as file:
        file.write(image_bytes)
        
    print("[*] Success! Open 'full_anomaly_map.png' to see the forecasted anomaly map.")
else:
    print(f"[!] API Failed with status code: {response.status_code}")
    print(f"Details: {response.text}")