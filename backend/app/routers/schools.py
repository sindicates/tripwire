from fastapi import APIRouter

router = APIRouter(prefix="/schools", tags=["schools"])

# GET  /schools           — list all schools
# POST /schools           — create a school record
# GET  /schools/{id}      — fetch a school by id
# PUT  /schools/{id}      — update school metadata (name, scorecard_id, etc.)
# POST /schools/{id}/ingest — trigger document ingestion for a school
