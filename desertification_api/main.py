import uvicorn
import os
from app.core.config import settings

if __name__ == "__main__":
    # In a production ECS environment, you typically don't use 'reload=True'
    # and you might pass port configurations via environment variables.
    port = int(os.environ.get("PORT", 9000))
    
    print(f"[*] Starting {settings.PROJECT_NAME} server on port {port}...")
    
    uvicorn.run(
        "app.main:app", 
        host="localhost", 
        port=port, 
        reload=True  # Change to False when deploying to AWS
    )