class RiskEngine:
    """Evaluates student data against school policies and emits risk events."""

    async def scan_student(self, student_id: str) -> list[dict]:
        raise NotImplementedError

    async def scan_all(self) -> None:
        raise NotImplementedError

    async def build_action_packet(self, risk_type: str, context: dict) -> dict:
        raise NotImplementedError
