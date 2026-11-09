from typing import List

import httpx

from backend.app.services.llm.base import BaseLLMProvider, LLMProviderError, build_prompt, parse_suggestions


class OpenAIProvider(BaseLLMProvider):
    DISPLAY_NAME = "OpenAI"
    # Modello economico e veloce: qui basta un suggerimento breve, non serve
    # il modello più potente disponibile.
    MODEL = "gpt-4o-mini"

    async def expand(self, terms: List[str], api_key: str) -> List[str]:
        prompt = build_prompt(terms)
        timeout = httpx.Timeout(15.0, connect=8.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": self.MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 100,
                },
            )

        if response.status_code != 200:
            raise LLMProviderError(f"OpenAI ha risposto con errore {response.status_code}: {response.text[:200]}")

        data = response.json()
        text = data["choices"][0]["message"]["content"]
        return parse_suggestions(text, terms)
