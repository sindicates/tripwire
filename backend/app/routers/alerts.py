from fastapi import APIRouter

router = APIRouter(prefix="/alerts", tags=["alerts"])

# GET  /alerts              — list alerts (filterable by student_id, channel)
# POST /alerts              — dispatch an alert for a risk event
# GET  /alerts/{id}         — fetch a single alert
# PUT  /alerts/{id}/open    — mark an alert as opened (webhook / client ping)
