from fastapi import APIRouter

router = APIRouter(prefix="/risk-events", tags=["risk_events"])

# GET  /risk-events              — list risk events (filterable by student_id, severity)
# POST /risk-events              — manually create a risk event
# GET  /risk-events/{id}         — fetch a single risk event with action packet
# PUT  /risk-events/{id}/resolve — mark a risk event as resolved
