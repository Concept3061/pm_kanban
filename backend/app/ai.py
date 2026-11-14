import os

from openai import OpenAI
from pydantic import BaseModel

MODEL = "openai/gpt-oss-120b"


def client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
        timeout=120,
    )


def ask(prompt: str) -> str:
    completion = client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return completion.choices[0].message.content


def parse[T: BaseModel](messages: list[dict[str, str]], response_format: type[T]) -> T | None:
    """Return the model's reply as response_format, or None if it refused."""
    completion = client().chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=response_format,
        # Not every provider of this model supports Structured Outputs. These two
        # accept the schema but misbehave: CoreWeave truncates boards and DeepInfra
        # can reply in plain text.
        extra_body={"provider": {"require_parameters": True, "ignore": ["CoreWeave", "DeepInfra"]}},
    )
    return completion.choices[0].message.parsed
