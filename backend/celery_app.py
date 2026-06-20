from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "tripwire",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["celery_app"],
)

celery_app.conf.beat_schedule = {
    "nightly_risk_scan": {
        "task": "celery_app.nightly_risk_scan",
        "schedule": crontab(hour=2, minute=0),
    },
}

celery_app.conf.timezone = "UTC"


@celery_app.task(name="celery_app.nightly_risk_scan")
def nightly_risk_scan() -> None:
    pass
