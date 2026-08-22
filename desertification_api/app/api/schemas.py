from pydantic import BaseModel
from typing import List, Dict

class BoundingBox(BaseModel):
    coordinates: List[List[List[float]]]
    area_sq_km: float = 0.0  # Captures area from Next.js

class AnalysisResponse(BaseModel):
    status: str
    message: str
    analysis_id: str  # Returns the Supabase UUID
    visualizations: Dict[str, str]