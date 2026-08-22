import requests
import base64

# 1. Hit your FastAPI endpoint
print("[*] Calling FastAPI...")
response = requests.post(
    "http://localhost:8000/api/v1/analyze/current",
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
    b64_string = data['visualizations']['dashboard']
    
    # 3. Decode the string into raw binary bytes
    image_bytes = base64.b64decode(b64_string)
    
    # 4. Save the bytes to a real .png file
    with open("testing/full_dashboard.png", "wb") as file:
        file.write(image_bytes)
        
    print("[*] Success! Open 'full_dashboard.png' to see the complete image.")
else:
    print(f"[!] API Failed with status code: {response.status_code}")