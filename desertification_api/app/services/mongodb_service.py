from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

class MongoDBService:
    def __init__(self):
        self.client = AsyncIOMotorClient(settings.MONGO_URI)
        self.db = self.client['Desertification_Dashboard']
        self.collection = self.db['District_Analyses']

    async def get_all_district_names(self):
        """Helper for RAG to know what districts actually exist in the DB."""
        return await self.collection.distinct("district_name")

    async def search_districts(self, query: str):
        """Returns autocomplete suggestions based on the query. (Lenient Match)"""
        cursor = self.collection.find(
            {"district_name": {"$regex": query, "$options": "i"}},
            {"district_name": 1, "_id": 0}
        )
        results = await cursor.to_list(length=20)
        
        # Deduplicate and normalize names to prevent double entries (e.g., "badin" and "Badin")
        names = list(set([str(doc.get("district_name")).strip().title() for doc in results if doc.get("district_name")]))
        return names

    async def get_district_data(self, district_name: str):
        """Fetches baseline and forecast data safely preventing cross-contamination of numbered districts."""
        
        # 1. Try Exact Match First (Ideal for UI Autocomplete selections)
        cursor = self.collection.find({
            "district_name": {"$regex": f"^{district_name}$", "$options": "i"}
        })
        results = await cursor.to_list(length=10)
        
        # 2. Fallback to lenient regex if exact match fails (e.g., manual API calls)
        if not results:
            clean_name = district_name.lower().replace(" district", "").strip()
            cursor = self.collection.find({
                "district_name": {"$regex": clean_name, "$options": "i"}
            })
            results = await cursor.to_list(length=10)
        
        data = {"baseline": None, "forecast": None}
        
        if not results:
            return data

        # 3. Lock onto the EXACT district to avoid mixing "Thatta 1" and "Thatta 2" in the same response
        target_district = results[0].get("district_name")
        matched_results = [doc for doc in results if doc.get("district_name") == target_district][:2]
        
        for doc in matched_results:
            doc_id = str(doc.get("_id", ""))
            
            # Safely map all schema fields into the parsed document
            parsed_doc = {
                "id": doc_id,
                "analysis_type": "current" if doc.get("analysis_type") == "baseline" else "forecast",
                "district_name": doc.get("district_name", ""),
                "created_at": str(doc.get("created_at", "")),

                "ai_report": doc.get("ai_report", None),
                
                # Spatial Data extraction (passes the nested Polygon/MultiPolygon arrays directly to the frontend)
                "coordinates": doc.get("spatial_data", {}).get("coordinates", []),
                "spatial_type": doc.get("spatial_data", {}).get("type", "Polygon"),
                "projection": doc.get("spatial_data", {}).get("projection", "EPSG:4326"),
                
                # Full Object extractions based on the schema
                "metrics": doc.get("metrics", {}),
                "area_sq_km": doc.get("metrics", {}).get("area_sq_km", 0), 
                "visualizations": doc.get("visualizations", {}),
                "feature_correlations": doc.get("feature_correlations", []),
                "model_metadata": doc.get("model_metadata", {})
            }
            
            if doc.get("analysis_type") == "baseline":
                data["baseline"] = parsed_doc
            else:
                data["forecast"] = parsed_doc
                
        return data