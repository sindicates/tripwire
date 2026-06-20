class RAGService:
    """Retrieval-augmented generation over school policy documents."""

    async def embed_chunks(self, chunks: list[str]) -> list[list[float]]:
        raise NotImplementedError

    async def search(self, query: str, school_id: str, top_k: int = 5) -> list[dict]:
        raise NotImplementedError

    async def answer(self, query: str, school_id: str) -> str:
        raise NotImplementedError
