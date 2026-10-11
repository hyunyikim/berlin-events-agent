import json
from pathlib import Path
from pprint import pformat, pprint

from pydantic import ValidationError

from app.models import ExtractedEvents, FormatResult, Status

LLM_MODEL = ""
SYSTEM_PROMPT = """\
"""

class LLMCallError(Exception):
    """Rasied when the LLM call fails."""

def scrape() -> list[dict]:
    path = Path(__file__).parent / "test" / "tavily_extract_result.json"

    with open(path, 'r') as f: 
        return json.load(f)['results']

def call_llm(content: str) -> str:
    try:
        return "{}"
    except Exception as e: 
        raise LLMCallError from e

def format(content: str | None) -> FormatResult:
    if content == None: 
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


    
    