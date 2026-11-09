from typing import List

import httpx

from backend.app.services.llm.base import BaseLLMProvider, LLMProviderError, build_prompt, parse_suggestions


class AnthropicProvider(BaseLLMProvider):
    DISPLAY_NAME = "Anthropic"
    # Modello economico e veloce: qui basta un suggerimento breve, non serve
    # il modello più potente disponibile.
    MODEL = "claude-haiku-4-5-20251001"

    async def expand(self, terms: List[str], api_key: str) -> List[str]:
        prompt = build_prompt(terms)
        timeout = httpx.Timeout(15.0, connect=8.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.MODEL,
                    "max_tokens": 100,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )

        if response.status_code != 200:
            raise LLMProviderError(f"Anthropic ha risposto con errore {response.status_code}: {response.text[:200]}")

        data = response.json()
        text = "".join(block.get("text", "") for block in data.get("content", []))
        return parse_suggestions(text, terms)
