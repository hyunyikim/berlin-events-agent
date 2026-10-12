from pydantic import BaseModel, Field
from datetime import datetime, timezone
from enum import Enum


class EventCategory(Enum):
    CLUB = "club"
    MUSIC = "music"
    MUSEUM = "museum"
    GALLERY = "gallery"
    ART = "art"
    FOOD = "food"
    OUTDOOR = "outdoor"
    SEASONAL = "seasonal"
    WORKSHOP = "workshop"
    SPORTS = "sports"
    ETC = "etc"


class ExtractedEvent(BaseModel):
    """Fields the LLM fills in from the page text."""

    title: str = Field(
        description="Event name only, e.g. 'Klubnacht'. Do not include room names or the lineup."
    )
    category: EventCategory = Field(
        description="The single best-fitting category. Use 'etc' only if nothing else fits."
    )
    tags: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Up to 5 short lowercase labels, e.g. 'techno', 'lgbtq', 'open-air', 'free-entry'.",
    )
    start_at: datetime | None = Field(
        description=(
            "Start in Berlin local time, ISO 8601 without timezone, e.g. 2026-10-03T23:59:00. "
            "If the year is missing, use the nearest upcoming date. "
            "If only a date is shown, use 00:00:00."
        )
    )
    end_at: datetime | None = Field(
        default=None,
        description="End in Berlin local time, same format as start_at. null if not listed. Never guess.",
    )
    has_time: bool = Field(
        description="true if the page shows a start time, false if only a date is shown."
    )
    location: str | None = Field(
        default=None,
        description="Venue name only, e.g. 'Berghain' or 'Tresor'. null if unknown.",
    )
    address: str | None = Field(
        default=None,
        description="Street address of the venue. null if not on the page. Never guess.",
    )
    description: str | None = Field(
        default=None,
        description="Short summary in 1-3 sentences. Include the lineup / artist names if listed.",
    )
    url: str | None = Field(
        default=None,
        description="Event detail page's Url.",
    )


class ExtractedEvents(BaseModel):
    """Wrapper: one page contains many events."""

    events: list[ExtractedEvent] = Field(
        default_factory=list,
        description="All upcoming events found on the page. Empty list if there are none.",
    )


class Event(ExtractedEvent):
    """What we store: LLM fields plus fields our own code fills in."""

    id: str
    source_url: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc))


class Status(Enum):
    PENDING = "pending"
    SCRAPE_FAILED = "scrape_failed"
    FORMAT_FAILED = "format_failed"
    FORMAT_VALIDATION_FAILED = "format_validation_failed"
    OK = "ok"


class FormatResult(BaseModel):
    status: Status = Status.PENDING
    source_url: str
    raw_content: str | None = None
    data: ExtractedEvents | None = None
    error: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc))
