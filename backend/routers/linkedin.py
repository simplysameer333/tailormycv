"""LinkedIn profile import endpoint.

POST /api/linkedin/parse — validate URL, fetch profile via LinkdAPI, return
normalised data + raw_text so the frontend can confirm and pass to the upload
session.
"""
import logging
import traceback

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx

from config import settings
from services.linkedin_service import fetch_profile, is_valid_linkedin_url
from services.email_service import send_error_alert

router = APIRouter()
logger = logging.getLogger("tailormycv")

_SERVICE_UNAVAILABLE = "LinkedIn import is temporarily unavailable. Please upload your resume instead."
_LIMIT_REACHED = "LinkedIn import has reached its usage limit. Please upload your resume instead."
_PROFILE_NOT_FOUND = "LinkedIn profile not found. Make sure the URL is correct and the profile is public."
_TRY_AGAIN = "LinkedIn import is busy right now — please wait a moment and try again."


class LinkedInParseBody(BaseModel):
    url: str


async def _alert(exc: Exception) -> None:
    """Fire-and-forget support email — never raises."""
    try:
        await send_error_alert("POST", "/api/linkedin/parse", exc, traceback.format_exc())
    except Exception:
        pass


@router.post("/linkedin/parse")
async def parse_linkedin_profile(body: LinkedInParseBody):
    """Validate a LinkedIn URL and return the normalised profile data.

    Returns: full_name, headline, location, email, summary, skills[], raw_text
    """
    url = body.url.strip()

    if not is_valid_linkedin_url(url):
        raise HTTPException(
            400, "Please enter a valid LinkedIn profile URL (linkedin.com/in/username)."
        )

    if not settings.linkdapi_key:
        raise HTTPException(503, _SERVICE_UNAVAILABLE)

    try:
        profile = await fetch_profile(url, settings.linkdapi_key)

    except ValueError as exc:
        if str(exc) == "linkedin_api_unavailable":
            # API returned a failure response (e.g. quota, service down)
            await _alert(exc)
            raise HTTPException(503, _SERVICE_UNAVAILABLE)
        # User-facing error (invalid URL format — should already be caught above)
        raise HTTPException(400, "Please enter a valid LinkedIn profile URL (linkedin.com/in/username).")

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise HTTPException(404, _PROFILE_NOT_FOUND)
        if status == 429:
            await _alert(exc)
            raise HTTPException(429, _TRY_AGAIN)
        if status in (401, 402, 403):
            await _alert(exc)
            raise HTTPException(503, _LIMIT_REACHED)
        await _alert(exc)
        raise HTTPException(503, _SERVICE_UNAVAILABLE)

    except httpx.TimeoutException as exc:
        logger.warning("[linkedin] Request timed out for %s", url)
        await _alert(exc)
        raise HTTPException(503, "LinkedIn import timed out. Please try again or upload your resume instead.")

    except Exception as exc:
        logger.exception("[linkedin] Unexpected error for %s", url)
        await _alert(exc)
        raise HTTPException(503, _SERVICE_UNAVAILABLE)

    return profile
