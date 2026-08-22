import google.generativeai as genai
import httpx
import os
from app.core.config import settings

# Set your API key in your .env file!
genai.configure(api_key=settings.google_api_key)
model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')

async def generate_multimodal_report(analysis_type: str, coordinates:dict, area: float, visual_urls: dict) -> str:
    """Downloads images from Supabase, sends them to Gemini, and asks for a Markdown report."""
    
    prompt_parts = [
        f"You are an expert Environmental Scientist. Generate a formal report for a {analysis_type} desertification analysis covering {area} sq km.",
        f"Your report MUST include the provided coordinates {coordinates} with 2 decimal places and images embedded directly in the text using standard Markdown image syntax: ![Title](URL).",
        "Structure the report by embedding an image, and then writing a detailed paragraph below it explaining what the data shows.",
        "End the report with a 'Conclusion & Actionable Strategies' section.\n\n"
    ]

    async with httpx.AsyncClient() as client:
        for name, url in visual_urls.items():
            if not url or 'gif' in url: 
                continue # Skip GIFs as Gemini prefers static images for this type of prompt
                
            # 1. Download the image bytes so Gemini can "see" it
            response = await client.get(url)
            if response.status_code == 200:
                image_data = {
                    "mime_type": "image/png",
                    "data": response.content
                }
                
                # 2. Add the image and the specific Markdown tag to the prompt
                prompt_parts.append(image_data)
                formatted_name = name.replace("_", " ").title()
                prompt_parts.append(f"Image Name: {formatted_name}. The Markdown tag you MUST use to embed this in your report is: ![{formatted_name}]({url})\n")

    # Send the combined text and images to Gemini
    response = await model.generate_content_async(prompt_parts)
    return response.text