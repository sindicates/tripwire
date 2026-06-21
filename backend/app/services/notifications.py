import logging
import asyncio
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from twilio.rest import Client

from app.config import settings

logger = logging.getLogger(__name__)

class NotificationService:
    """Dispatches alerts over email (SendGrid), SMS (Twilio), and in-app channels."""

    def __init__(self):
        self.sg_client = SendGridAPIClient(settings.SENDGRID_API_KEY) if settings.SENDGRID_API_KEY else None
        self.twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN) if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN else None

    async def send_email(self, to: str, subject: str, body: str) -> None:
        if self.sg_client:
            try:
                message = Mail(
                    from_email="noreply@sherpa.app",
                    to_emails=to,
                    subject=subject,
                    html_content=body
                )
                
                def _send():
                    return self.sg_client.send(message)
                
                response = await asyncio.to_thread(_send)
                logger.info(f"[SendGrid] Email sent to {to} | Status: {response.status_code}")
            except Exception as e:
                logger.error(f"[SendGrid] Failed to send email to {to}: {e}")
        else:
            logger.info(f"[Mock Email] To: {to} | Subject: {subject} | Body: {body[:100]}...")

    async def send_sms(self, to: str, body: str) -> None:
        if self.twilio_client:
            try:
                def _send():
                    return self.twilio_client.messages.create(
                        body=body,
                        from_=settings.TWILIO_PHONE_NUMBER,
                        to=to
                    )
                
                message = await asyncio.to_thread(_send)
                logger.info(f"[Twilio] SMS sent to {to} | SID: {message.sid}")
            except Exception as e:
                logger.error(f"[Twilio] Failed to send SMS to {to}: {e}")
        else:
            logger.info(f"[Mock SMS] To: {to} | Body: {body[:100]}...")

    async def send_in_app(self, student_id: str, payload: dict) -> None:
        # In-app notifications could be pushed via websockets or saved to the DB.
        # For now, we just log the dispatch.
        logger.info(f"[Mock In-App] To Student: {student_id} | Payload: {payload}")

