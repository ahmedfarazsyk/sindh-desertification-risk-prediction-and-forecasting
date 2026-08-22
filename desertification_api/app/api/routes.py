from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
import os
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel


from app.api.schemas import BoundingBox, AnalysisResponse
from app.services.ee_service import fetch_current_data, fetch_forecast_data
from app.services.inference import run_current_inference, run_forecast_inference
from app.services.visuals import (
    generate_current_dashboard, 
    generate_feature_importance_and_hexbins, 
    generate_anomaly_map,
    generate_forecast_metrics,
    generate_forecast_gif
)
from app.services.supabase_service import upload_base64_image, save_analysis_record, supabase
from app.services.report_service import generate_multimodal_report
from app.core.config import settings
from app.services.mongodb_service import MongoDBService
from app.services.rag_service import RAGService
from bson.objectid import ObjectId

router = APIRouter()
db_service = MongoDBService()
rag_service = RAGService()


class RAGQuery(BaseModel):
    query: str
    history: Optional[List[Dict[str, Any]]] = []

@router.post("/analyze/current", response_model=AnalysisResponse)
async def analyze_current(bbox: BoundingBox):
    try:
        task_id = str(uuid.uuid4())
        input_tiff = os.path.join(settings.TEMP_DIR, f"{task_id}_inputs.tif")
        output_tiff = os.path.join(settings.TEMP_DIR, f"{task_id}_dsi.tif")

        await run_in_threadpool(fetch_current_data, bbox.coordinates, input_tiff)
        await run_in_threadpool(run_current_inference, input_tiff, output_tiff)
        
        dash_b64 = await run_in_threadpool(generate_current_dashboard, input_tiff, output_tiff)
        extra = await run_in_threadpool(generate_feature_importance_and_hexbins, input_tiff, output_tiff)

        visual_urls = {
            "dashboard": upload_base64_image(dash_b64, "current", "png"),
            "feature_importance": upload_base64_image(extra["feature_importance"], "current", "png"),
            "hexbins": upload_base64_image(extra["hexbins"], "current", "png")
        }

        db_id = save_analysis_record("current", bbox.coordinates, bbox.area_sq_km, visual_urls)

        # Cleanup the heavy TIFFs
        if os.path.exists(input_tiff): os.remove(input_tiff)
        if os.path.exists(output_tiff): os.remove(output_tiff)

        return AnalysisResponse(
            status="success", message="Current analysis complete.",
            analysis_id=db_id, visualizations=visual_urls
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analyze/forecast", response_model=AnalysisResponse)
async def analyze_forecast(bbox: BoundingBox):
    try:
        task_id = str(uuid.uuid4())
        input_tiff = os.path.join(settings.TEMP_DIR, f"{task_id}_temporal_inputs.tif")
        output_tiff = os.path.join(settings.TEMP_DIR, f"{task_id}_forecast.tif")

        await run_in_threadpool(fetch_forecast_data, bbox.coordinates, input_tiff)
        await run_in_threadpool(run_forecast_inference, input_tiff, output_tiff)
        
        anomaly_b64 = await run_in_threadpool(generate_anomaly_map, input_tiff, output_tiff)
        metrics = await run_in_threadpool(generate_forecast_metrics, input_tiff, output_tiff)
        gif_b64 = await run_in_threadpool(generate_forecast_gif, input_tiff, output_tiff)

        visual_urls = {
            "anomaly_map": upload_base64_image(anomaly_b64, "forecast", "png"),
            "stacked_bar": upload_base64_image(metrics["stacked_bar"], "forecast", "png"),
            "trend": upload_base64_image(metrics["trend"], "forecast", "png"),
            "std_dev": upload_base64_image(metrics["std_dev"], "forecast", "png"),
            "seasonal": upload_base64_image(metrics["seasonal"], "forecast", "png"),
            "timelapse_gif": upload_base64_image(gif_b64, "forecast", "gif")
        }

        db_id = save_analysis_record("forecast", bbox.coordinates, bbox.area_sq_km, visual_urls)

        # Cleanup the heavy TIFFs
        if os.path.exists(input_tiff): os.remove(input_tiff)
        if os.path.exists(output_tiff): os.remove(output_tiff)

        return AnalysisResponse(
            status="success", message="Forecast complete.",
            analysis_id=db_id, visualizations=visual_urls
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    


@router.get("/history", response_model=List[Dict[str, Any]])
async def get_history():
    """Retrieves all previous analyses in reverse chronological order."""
    try:
        # Fetching all columns, ordered by most recent first
        response = supabase.table("analyses").select("*").order("created_at", desc=True).execute()
        
        if hasattr(response, 'error') and response.error:
            raise Exception(response.error)
            
        return response.data if response.data else []
    except Exception as e:
        print(f"History Fetch Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

@router.delete("/history/{analysis_id}")
async def delete_history_item(analysis_id: str):
    """Deletes a specific analysis record AND its associated images from Supabase Storage."""
    bucket_name = "desertification-visuals"
    
    try:
        print(f"[*] Attempting to delete analysis_id: {analysis_id}")
        
        # 1. Fetch the record first
        record = supabase.table("analyses").select("visualizations").eq("id", analysis_id).execute()
        
        if not record.data:
            print("[-] Record not found in database.")
            raise HTTPException(status_code=404, detail="Analysis record not found")
            
        visualizations = record.data[0].get("visualizations", {})
        
        # 2. Extract file paths
        files_to_delete = []
        for key, url in visualizations.items():
            if url and f"/{bucket_name}/" in url:
                try:
                    file_path = url.split(f"/{bucket_name}/")[1]
                    files_to_delete.append(file_path)
                except IndexError:
                    continue
        
        # 3. Isolate Storage Deletion in its own Try/Except block
        # This guarantees that even if a file is missing, the DB row still gets deleted!
        if files_to_delete:
            try:
                supabase.storage.from_(bucket_name).remove(files_to_delete)
                print(f"[+] Successfully removed {len(files_to_delete)} files from Supabase Storage.")
            except Exception as storage_err:
                print(f"[-] Storage Warning (Files may already be gone): {str(storage_err)}")
                
        # 4. Guarantee Database Deletion
        db_response = supabase.table("analyses").delete().eq("id", analysis_id).execute()
        print(f"[+] Database deletion response: {db_response.data}")
        
        return {"status": "success", "message": f"Deleted record {analysis_id}"}
        
    except Exception as e:
        print(f"[!] Critical Delete Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fully delete record: {str(e)}")
    

@router.post("/history/{analysis_id}/report")
async def create_ai_report(analysis_id: str):
    """Generates an AI report using Gemini and saves it to the correct database (MongoDB or Supabase)."""
    try:
        # 1. Determine which DB to query based on ID length 
        # (Mongo ObjectIds are exactly 24 chars, Supabase UUIDs are 36 chars)
        is_mongo = len(analysis_id) == 24
        analysis = None

        if is_mongo:
            # ---> Query MongoDB (Precomputed Districts)
            doc = await db_service.collection.find_one({"_id": ObjectId(analysis_id)})
            if not doc:
                raise HTTPException(status_code=404, detail="Analysis not found in MongoDB")
            
            # Caching: If it already exists, return it immediately
            if doc.get("ai_report"):
                return {"status": "success", "report": doc["ai_report"]}
            
            # Format payload for the report generator to match the expected structure
            analysis = {
                "analysis_type": "current" if doc.get("analysis_type") == "baseline" else "forecast",
                "coordinates": doc.get("spatial_data", {}).get("coordinates", []),
                "area_sq_km": doc.get("metrics", {}).get("area_sq_km", 0),
                "visualizations": doc.get("visualizations", {})
            }
        else:
            # ---> Query Supabase (Real-Time Inferences)
            record = supabase.table("analyses").select("*").eq("id", analysis_id).execute()
            if not record.data:
                raise HTTPException(status_code=404, detail="Analysis not found in Supabase")
            
            analysis = record.data[0]
            
            # Caching: If it already exists, return it immediately
            if analysis.get("ai_report"):
                return {"status": "success", "report": analysis["ai_report"]}

        # 2. Generate the report via Gemini
        report_text = await generate_multimodal_report(
            analysis_type=analysis["analysis_type"],
            coordinates=analysis["coordinates"],
            area=analysis["area_sq_km"],
            visual_urls=analysis["visualizations"]
        )

        # 3. Save the generated report back to the CORRECT database
        if is_mongo:
            await db_service.collection.update_one(
                {"_id": ObjectId(analysis_id)},
                {"$set": {"ai_report": report_text}}
            )
        else:
            supabase.table("analyses").update({"ai_report": report_text}).eq("id", analysis_id).execute()

        return {"status": "success", "report": report_text}

    except Exception as e:
        print(f"Gemini Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")
    

@router.get("/search")
async def search_districts(q: str):
    """Provides autocomplete suggestions for districts in MongoDB."""
    return await db_service.search_districts(q)

@router.get("/district/{name}")
async def get_district(name: str):
    """Fetches both baseline and forecast payloads for the UI."""
    data = await db_service.get_district_data(name)
    if not data["baseline"]:
        raise HTTPException(status_code=404, detail="District not found in database")
    return data

@router.post("/rag")
async def run_multimodal_rag(payload: RAGQuery):
    """
    STREAMS the Copilot response token-by-token.
    Provides robust memory and global comparative knowledge.
    """
    try:
        # Returns a StreamingResponse using the generator from RAGService
        return StreamingResponse(
            rag_service.query_stream(payload.query, payload.history),
            media_type="text/plain"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))