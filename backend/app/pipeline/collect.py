import json
import os
from pathlib import Path
from pprint import pformat, pprint
from datetime import date, datetime
import time

from dotenv import load_dotenv
from pydantic import ValidationError
from openrouter import OpenRouter
from openrouter.components import ChatFormatJSONSchemaConfig, ChatJSONSchemaConfig

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

openrouter = OpenRouter(api_key=os.getenv("OPENROUTER_API_KEY"))

class LLMCallError(Exception):
    """Rasied when the LLM call fails."""

def scrape() -> list[dict]:
    path = Path(__file__).parent / "test" / "tavily_extract_result.json"

    with open(path, 'r') as f: 
        return json.load(f)['results']

def call_llm(content: str) -> str:
    start = time.perf_counter()
    try:
        response =openrouter.chat.send(
            model=LLM_MODEL, 
            messages=[
            {"role": "system", "content": SYSTEM_PROMPT.format(today=date.today().isoformat())}, 
            {"role": "user", "content": content}
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
        pprint(response)


        return "{}"
    except Exception as e: 
        print(f"LLM_CALL_ERROR: {pformat(e)}")
        raise LLMCallError from e
    finally: 
        elapsed = time.perf_counter() - start
        print(f"LLM Call: {elapsed:.3f} seconds")

def format(content: str | None) -> FormatResult:
    if content is None: 
        return FormatResult(status=Status.SCRAPE_FAILED)

    try:
        llm_result = call_llm(content)
        result = ExtractedEvents.model_validate_json(llm_result)
        return FormatResult(status=Status.OK, data=result,)
    except ValidationError as e:
        pprint(e)
        return FormatResult(status=Status.FORMAT_VALIDATION_FAILED, error=str(e))
    except Exception as e:
        pprint(e)
        return FormatResult(status=Status.FORMAT_FAILED, error=str(e))
    

def format_all(pages: list[dict]):
    format_results: list[FormatResult] = []
    for page in pages:
        raw_content: str | None = page['raw_content']
        result = format(raw_content)
        format_results.append(result)
    return format_results

if __name__ == "__main__":
    scraped = scrape()
    formated = format_all(scraped)
    pprint(formated)


    
    