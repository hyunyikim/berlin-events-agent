import json
import os
from pathlib import Path
from pprint import pformat, pprint
from datetime import date, datetime
import time

import yaml
from dotenv import load_dotenv
from pydantic import ValidationError
from openrouter import OpenRouter
from openrouter.components import ChatFormatJSONSchemaConfig, ChatJSONSchemaConfig
from tavily import TavilyClient

from app.models import ExtractedEvents, FormatResult, Status

load_dotenv()

LLM_MODEL = "deepseek/deepseek-v4.1-flash"
SYSTEM_PROMPT = """\
You extract event listings from the scraped text of ONE Berlin club website.
The text is markdown. Each event usually has a date, a title, a room/venue and a lineup.

Rules:
- Return every upcoming event on the page as a separate item.
- The same event name on different dates is a different event (different start_at).
- Never invent data. If a field is not on the page, use null.
- Today's date is {today}. Use it to work out missing years.
- Dates on the page are Berlin local time.

Respond with minified JSON only (no newlines, no indentation, no spaces after : or ,), matching the provided schema.
"""

tavily = TavilyClient()
openrouter = OpenRouter(api_key=os.getenv("OPENROUTER_API_KEY"))


class LLMCallError(Exception):
    """Raised when the LLM call fails."""


def scrape(local_path: Path | None = None) -> list[dict]:
    if local_path is not None:
        with open(local_path, 'r') as f:
            return json.load(f)['results']

    path = Path(__file__).parent / "clubs.yaml"
    with open(path, 'r') as f:
        clubs = yaml.safe_load(f)

    urls = []
    for club in clubs:
        urls.append(club['url'])

    tavily_response = tavily.extract(
        urls=urls,
        format="markdown"
    )
    return tavily_response['results']


def call_llm(raw_content: str) -> str:
    start = time.perf_counter()
    try:
        llm_response = openrouter.chat.send(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(
                    today=date.today().isoformat())},
                {"role": "user", "content": raw_content}
            ],
            response_format=ChatFormatJSONSchemaConfig(
                type="json_schema",
                json_schema=ChatJSONSchemaConfig(
                    name="extracted_events",
                    strict=True,
                    schema_=ExtractedEvents.model_json_schema()
                )
            ),
            temperature=0,
            timeout_ms=30_000,
            max_completion_tokens=20000,
            reasoning={"effort": "none"}
        )
        pprint(llm_response)
        llm_json = llm_response.choices[0].message.content

        if not isinstance(llm_json, str):
            raise ValueError(f"LLM returned unusable content: {llm_json!r}")

        return llm_json
    except Exception as e:
        print(f"LLM_CALL_ERROR: {pformat(e)}")
        raise LLMCallError from e
    finally:
        elapsed = time.perf_counter() - start
        print(f"LLM Call: {elapsed:.3f} seconds")


def format_extracted_events(raw_content: str | None, source_url: str) -> FormatResult:
    format_result = FormatResult(
        source_url=source_url, raw_content=raw_content)
    if raw_content is None:
        format_result.status = Status.SCRAPE_FAILED
        return format_result

    try:
        llm_json = call_llm(raw_content)
        extracted_events = ExtractedEvents.model_validate_json(llm_json)
        format_result.data = extracted_events
        format_result.status = Status.OK
        return format_result
    except ValidationError as e:
        pprint(e)
        format_result.status = Status.FORMAT_VALIDATION_FAILED
        format_result.error = str(e)
        return format_result
    except Exception as e:
        pprint(e)
        format_result.status = Status.FORMAT_FAILED
        format_result.error = str(e)
        return format_result


def format_all(pages: list[dict]):
    format_results: list[FormatResult] = []
    for page in pages:
        raw_content: str | None = page['raw_content']
        url: str = page['url']

        format_result = format_extracted_events(raw_content, url)
        format_results.append(format_result)
    return format_results


if __name__ == "__main__":
    local_path = Path(__file__).parent / 'test' / 'tavily_extract_result.json'

    pages = scrape()
    format_results = format_all(pages)
    pprint(format_results)
