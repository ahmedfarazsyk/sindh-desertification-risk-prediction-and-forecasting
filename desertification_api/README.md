# Desertification Risk API (Backend)

This is the FastAPI backend for the Desertification Dashboard.

## Setup Instructions

### 1. Requirements
- Python 3.10+
- virtualenv or `uv` for environment management

### 2. Create Virtual Environment
```bash
uv venv
# On Windows
.venv\Scripts\activate
# On Mac/Linux
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
uv pip install -e .
```

### 4. Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Fill in the required credentials for MongoDB, Supabase, and Google Gemini in the newly created `.env` file.

### 5. Start the Server
Run the FastAPI development server:
```bash
python main.py
```
The server will be available at the port defined in `main.py` (default: `http://localhost:9000` or `http://localhost:8000`). You can access the API documentation at `/docs`.
