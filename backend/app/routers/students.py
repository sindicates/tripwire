from fastapi import APIRouter

router = APIRouter(prefix="/students", tags=["students"])

# GET    /students/me                  — fetch the authenticated student's profile
# PUT    /students/me                  — update GPA, credits, degree audit, aid package
# GET    /students/{student_id}        — admin: fetch any student by id
# GET    /students/{student_id}/risk-events  — list risk events for a student
# GET    /students/{student_id}/alerts       — list alerts for a student
