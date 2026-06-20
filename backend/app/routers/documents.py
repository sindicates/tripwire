from fastapi import APIRouter

router = APIRouter(prefix="/documents", tags=["documents"])

# GET  /documents              — list documents (filterable by school_id)
# POST /documents              — register a document URL for ingestion
# GET  /documents/{id}         — fetch document metadata + chunk count
# DELETE /documents/{id}       — remove document and its chunks
# GET  /documents/{id}/chunks  — list doc chunks for a document
