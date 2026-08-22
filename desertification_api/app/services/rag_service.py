
# import google.generativeai as genai
# from app.services.mongodb_service import MongoDBService
# from app.core.config import settings
# import json
# import asyncio

# genai.configure(api_key=settings.google_api_key)

# class RAGService:
#     def __init__(self):
#         self.db = MongoDBService()
#         # Flash is highly optimized for reading large JSON context payloads
#         self.model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')


#     async def _fetch_district_metrics(self, name: str, sem: asyncio.Semaphore):
#         """Safely fetches and trims data for a single district without freezing RAM."""
#         async with sem:
#             try:
#                 # Use your native, known DB method
#                 data = await self.db.get_district_data(name)
                
#                 # FIX 1: Safely check if data exists AND if baseline actually contains data
#                 if not data:
#                     return name, None

#                 # FIX 2: Safely fallback to empty dictionaries if any key holds a `None` value
#                 baseline_data = data.get("baseline") or {}
#                 forecast_data = data.get("forecast") or {}

#                 b_metrics = baseline_data.get("metrics") or {}
#                 f_metrics = forecast_data.get("metrics") or {}
                
#                 # Cleanly extract top 3 environmental drivers
#                 b_features = baseline_data.get("feature_correlations") or []
#                 top_features = {}
                
#                 if b_features:
#                     # Safely ensure each feature is a dict before checking keys
#                     valid_f = [f for f in b_features if isinstance(f, dict) and 'feature' in f and 'correlation' in f]
#                     valid_f.sort(key=lambda x: abs(float(x['correlation'])), reverse=True)
#                     top_features = {f['feature']: round(float(f['correlation']), 2) for f in valid_f[:3]}

#                 # Build the lightweight memory object
#                 metrics = {
#                     "current_dsi_severity": b_metrics.get("mean_dsi_severity", "N/A"),
#                     "primary_driver": b_metrics.get("primary_driver", "N/A"),
#                     "top_influencing_features": top_features,
#                     "forecasted_2030_dsi": f_metrics.get("final_mean_dsi_2030", "N/A"),
#                     "5_year_trend_slope": f_metrics.get("dsi_trend_slope", "N/A")
#                 }
                
#                 # CRITICAL: Delete the massive DB dictionary to instantly free up server RAM
#                 del data 
                
#                 return name, metrics
#             except Exception as e:
#                 print(f"RAG Extract Error for {name}: {e}")
#                 return name, None

#     async def query(self, user_text: str, chat_history: list = None):
#         """Processes the user's chat query as a dynamic Copilot."""
#         try:
#             # 1. Get valid names using your native method
#             valid_districts = await self.db.get_all_district_names()
#             if not valid_districts:
#                 return "The database is currently empty. Please run the Earth Engine model inference first to populate the regions."

#             # 2. Concurrency Control (The Freeze Fix)
#             # This ensures we only load 5 districts into RAM at a time. It prevents the 
#             # server event loop from locking up while still being incredibly fast.
#             sem = asyncio.Semaphore(5)
#             tasks = [self._fetch_district_metrics(name, sem) for name in valid_districts]
#             results = await asyncio.gather(*tasks)

#             # 3. Build the Global Catalog Dictionary
#             catalog = {name: metrics for name, metrics in results if metrics}

#             # 4. Construct the Copilot Brain
#             prompt_parts = [
#                 "You are the 'GeoAI Environmental Copilot', an advanced analytical AI expert in desertification and remote sensing.",
#                 "You have live access to a spatial telemetry database. Below is the structured JSON catalog of all regions currently analyzed.",
#                 "INSTRUCTIONS:",
#                 "- Be conversational, highly analytical, and format your answers beautifully using Markdown (bolding, lists, tables).",
#                 "- If the user asks comparative questions (e.g., 'Which district has the highest risk?'), evaluate the 'current_dsi_severity' or 'forecasted_2030_dsi' in the catalog to find the answer.",
#                 "- If the user asks for a list (e.g., 'List all districts driven by precipitation'), scan the 'primary_driver' or 'top_influencing_features' in the catalog.",
#                 "- If the user asks a general science question, answer it using your domain knowledge.",
#                 f"\n--- GLOBAL DATABASE CATALOG ---\n{json.dumps(catalog, indent=2)}\n",
#                 f"\nUSER QUERY: '{user_text}'\n"
#             ]

#             # 5. Generate Answer
#             response = await self.model.generate_content_async(prompt_parts)
#             return response.text
            
#         except Exception as e:
#             print(f"Copilot Critical Error: {str(e)}")
#             return f"I encountered a technical error analyzing the database: {str(e)}"


import google.generativeai as genai
from app.services.mongodb_service import MongoDBService
from app.core.config import settings
import json
import asyncio

genai.configure(api_key=settings.google_api_key)

class RAGService:
    def __init__(self):
        self.db = MongoDBService()
        self.model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
        # This acts as the persistent system instruction for the chat session
        self.system_instruction = (
            "You are the 'GeoAI Environmental Copilot'. You analyze desertification telemetry. "
            "Use the provided JSON catalog for comparisons and stats. Format with Markdown. "
            "Be conversational but scientifically accurate."
        )

    async def _fetch_district_metrics(self, name: str, sem: asyncio.Semaphore):
        """Fetches and cleans data for a single district safely."""
        async with sem:
            try:
                data = await self.db.get_district_data(name)
                if not data: return name, None

                baseline = data.get("baseline") or {}
                forecast = data.get("forecast") or {}
                b_metrics = baseline.get("metrics") or {}
                f_metrics = forecast.get("metrics") or {}
                
                b_features = baseline.get("feature_correlations") or []
                top_features = {}
                if b_features:
                    valid_f = [f for f in b_features if isinstance(f, dict) and 'feature' in f and 'correlation' in f]
                    valid_f.sort(key=lambda x: abs(float(x['correlation'])), reverse=True)
                    top_features = {f['feature']: round(float(f['correlation']), 2) for f in valid_f[:3]}

                metrics = {
                    "current_dsi": b_metrics.get("mean_dsi_severity") if b_metrics.get("mean_dsi_severity") is not None else "N/A",
                    "primary_driver": b_metrics.get("primary_driver", "N/A"),
                    "top_drivers": top_features if top_features else {"Status": "Data Pending"},
                    "forecasted_2030_dsi": f_metrics.get("final_mean_dsi_2030", "N/A"),
                    "trend_slope": f_metrics.get("dsi_trend_slope", "N/A")
                }
                del data 
                return name, metrics
            except Exception as e:
                print(f"RAG Extract Error for {name}: {e}")
                return name, None

    async def query_stream(self, user_text: str, chat_history: list = None):
        """
        Asynchronous generator for token-by-token streaming with history.
        """
        try:
            # 1. Prepare Database Context
            valid_districts = await self.db.get_all_district_names()
            sem = asyncio.Semaphore(5)
            tasks = [self._fetch_district_metrics(name, sem) for name in valid_districts]
            results = await asyncio.gather(*tasks)
            catalog = {name: metrics for name, metrics in results if metrics}

            # 2. Initialize Chat Session with History
            # chat_history format: [{"role": "user", "parts": ["..."]}, {"role": "model", "parts": ["..."]}]
            chat = self.model.start_chat(history=chat_history or [])

            # 3. Build the Contextual Prompt
            # We inject the catalog here so the model has 'fresh' data even in a long chat
            contextual_query = (
                f"--- CURRENT DATABASE SNAPSHOT ---\n{json.dumps(catalog, indent=2)}\n\n"
                f"USER QUERY: {user_text}"
            )

            # 4. Stream Response
            response = await chat.send_message_async(contextual_query, stream=True)
            
            async for chunk in response:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            yield f"**Copilot Error:** {str(e)}"