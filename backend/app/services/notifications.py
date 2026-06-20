class NotificationService:
    """Dispatches alerts over email (SendGrid), SMS (Twilio), and in-app channels."""

    async def send_email(self, to: str, subject: str, body: str) -> None:
        raise NotImplementedError

    async def send_sms(self, to: str, body: str) -> None:
        raise NotImplementedError

    async def send_in_app(self, student_id: str, payload: dict) -> None:
        raise NotImplementedError
