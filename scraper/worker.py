#!/usr/bin/env python3
"""Opt-in, ordinary-fetch Scrapling worker for Cherry Source Inbox.

The worker is deliberately a small stdin/stdout boundary. It never accepts
cookies, proxies, browser sessions, stealth flags, or arbitrary selectors.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import re
import socket
import sys
import urllib.parse
import urllib.robotparser
from datetime import datetime, timezone
from html import unescape
from typing import Any

MAX_BYTES = 262_144
MAX_MARKDOWN_CHARS = 120_000
BLOCKED_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "linkedin.com", "www.linkedin.com"}
TRACKING_KEYS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"}


def validate_request(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    raw = payload.get("url")
    if not isinstance(raw, str) or len(raw) > 2048:
        return None, "url is required and must be at most 2048 characters"
    try:
        parsed = urllib.parse.urlsplit(raw)
    except ValueError:
        return None, "url is not valid"
    if parsed.scheme not in {"http", "https"}:
        return None, "only http(s) URLs are allowed"
    if parsed.username or parsed.password:
        return None, "URLs with embedded credentials are blocked"
    if parsed.fragment:
        return None, "URL fragments are not fetched; remove the fragment and retry"
    host = (parsed.hostname or "").lower().rstrip(".")
    if not host or host in BLOCKED_HOSTS or host.endswith(".youtube.com") or host.endswith(".linkedin.com"):
        return None, "this domain is blocked by Cherry's source policy"
    allowed = payload.get("allowedDomains")
    if not isinstance(allowed, list) or not allowed:
        return None, "allowedDomains must contain the public domain the user selected"
    allowed_hosts = {str(entry).lower().lstrip(".").rstrip(".") for entry in allowed if isinstance(entry, str)}
    if host not in allowed_hosts and not any(host.endswith("." + entry) for entry in allowed_hosts):
        return None, "domain is not in the user's allowlist"
    if _private_host(host):
        return None, "private or loopback addresses are blocked"
    return parsed.geturl(), None


def _private_host(host: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
        return address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_unspecified
    except ValueError:
        pass
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
        return any(_private_host(address) for address in addresses)
    except OSError:
        return True


def _robots_allows(url: str) -> bool:
    parsed = urllib.parse.urlsplit(url)
    robots_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    parser = urllib.robotparser.RobotFileParser(robots_url)
    try:
        parser.read()
    except Exception:
        return False
    return parser.can_fetch("CherrySourceInbox/1.0", url)


def _clean_html(html: str) -> str:
    # Strip active/hidden regions before markdown conversion. This is a
    # sanitisation boundary, not a claim that arbitrary web text is trusted.
    cleaned = re.sub(r"<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<form\b[^>]*>.*?</form\s*>", " ", html, flags=re.I | re.S)
    cleaned = re.sub(r"<([a-z0-9]+)\b[^>]*(?:hidden|aria-hidden\s*=\s*['\"]true['\"]|display\s*:\s*none)[^>]*>.*?</\1\s*>", " ", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"<(?:iframe|object|embed|svg|canvas)\b[^>]*>.*?</(?:iframe|object|embed|svg|canvas)\s*>", " ", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"\b(?:ignore|disregard)\s+(?:all\s+)?previous\s+instructions\b", "[removed prompt-like text]", cleaned, flags=re.I)
    return cleaned


def fetch(payload: dict[str, Any]) -> dict[str, Any]:
    url, error = validate_request(payload)
    if error:
        return {"status": "blocked", "reason": error}
    assert url is not None
    if payload.get("respectRobots", True) is not True or not _robots_allows(url):
        return {"status": "blocked", "reason": "robots.txt permission could not be established"}
    try:
        from scrapling.fetchers import Fetcher  # ordinary static fetcher only
        from markdownify import markdownify
    except ImportError:
        return {"status": "failed", "reason": "Scrapling worker dependencies are not installed; run pip install -r scraper/requirements.txt"}
    try:
        page = Fetcher.get(url, follow_redirects="safe", timeout=20)
        raw = getattr(page, "body", b"")
        if isinstance(raw, str):
            raw = raw.encode("utf-8", errors="replace")
        if len(raw) > min(int(payload.get("maxBytes", MAX_BYTES)), MAX_BYTES):
            return {"status": "blocked", "reason": "response exceeds the configured byte limit"}
        html = raw.decode("utf-8", errors="replace")
        clean = _clean_html(html)
        markdown = re.sub(r"\n{3,}", "\n\n", markdownify(clean, strip=["a"])).strip()
        markdown = unescape(markdown)[:MAX_MARKDOWN_CHARS].strip()
        if not markdown:
            return {"status": "failed", "reason": "page did not contain readable text"}
        title_match = re.search(r"<title[^>]*>(.*?)</title>", clean, flags=re.I | re.S)
        canonical_match = re.search(r"<link[^>]+rel=['\"]canonical['\"][^>]+href=['\"]([^'\"]+)", clean, flags=re.I)
        canonical = urllib.parse.urljoin(url, unescape(canonical_match.group(1))) if canonical_match else url
        author_match = re.search(r"<meta[^>]+(?:name|property)=['\"](?:author|article:author)['\"][^>]+content=['\"]([^'\"]+)", clean, flags=re.I)
        return {"status": "fetched", "title": unescape(title_match.group(1)).strip()[:300] if title_match else None, "canonicalUrl": canonical[:2048], "author": unescape(author_match.group(1)).strip()[:200] if author_match else None, "fetchedAt": datetime.now(timezone.utc).isoformat(), "contentHash": hashlib.sha256(markdown.encode("utf-8")).hexdigest(), "markdown": markdown}
    except Exception:
        return {"status": "failed", "reason": "ordinary public-page fetch failed"}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        result = fetch(payload if isinstance(payload, dict) else {})
    except Exception:
        result = {"status": "failed", "reason": "worker input must be one JSON object"}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

