from typing import Type

from backend.app.services.llm.anthropic_provider import AnthropicProvider
from backend.app.services.llm.base import BaseLLMProvider
from backend.app.services.llm.google_provider import GoogleProvider
from backend.app.services.llm.openai_provider import OpenAIProvider

# Chiavi coincidenti con User.llm_provider: l'utente ne sceglie uno solo dal
# menu a tendina in ApiKeysPage, non una chiave per provider.
LLM_PROVIDERS: dict[str, Type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "google": GoogleProvider,
}
