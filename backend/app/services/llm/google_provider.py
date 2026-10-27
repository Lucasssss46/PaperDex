from typing import List

import httpx

from backend.app.services.llm.base import BaseLLMProvider, LLMProviderError, build_prompt, parse_suggestions


class GoogleProvider(BaseLLMProvider):
    DISPLAY_NAME = "Google"
    # Modello economico e veloce: qui basta un suggerimento breve, non serve
    # il modello più potente disponibile. gemini-2.0-flash non compare più
    # nella pagina di pricing corrente di Google (verificato il 2026-08-31);
    # gemini-2.5-flash è il Flash confermato attuale, con free tier per
    # input/output testuale.
    MODEL = "gemini-2.5-flash"

    async def expand(self, terms: List[str], api_key: str) -> List[str]:
        prompt = build_prompt(terms)
        timeout = httpx.Timeout(15.0, connect=8.0)
        # A differenza di OpenAI/Anthropic, l'API di Google passa la chiave
        # come query param invece che in un header di autenticazione.
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.MODEL}:generateContent?key={api_key}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json={"contents": [{"parts": [{"text": prompt}]}]})

        if response.status_code != 200:
            raise LLMProviderError(f"Google ha risposto con errore {response.status_code}: {response.text[:200]}")

        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return parse_suggestions(text, terms)
