#!/usr/bin/env python3
"""Opt-in, ordinary-fetch Scrapling worker for Cherry Source Inbox.

The worker is deliberately a small stdin/stdout boundary. It never accepts
cookies, proxies, browser sessions, stealth flags, or arbitrary selectors.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
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
ROBOTS_MAX_BYTES = 65_536
MAX_MARKDOWN_CHARS = 120_000
EXPECTED_VERSIONS = {"scrapling": "0.4.15", "markdownify": "1.2.3"}
BLOCKED_HOSTS = {"youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "youtu.be", "linkedin.com", "www.linkedin.com"}
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
    if not host or host in BLOCKED_HOSTS or host.endswith(".youtube.com") or host.endswith(".youtube-nocookie.com") or host.endswith(".linkedin.com"):
        return None, "this domain is blocked by Cherry's source policy"
    allowed = payload.get("allowedDomains")
    if not isinstance(allowed, list) or not allowed:
        return None, "allowedDomains must contain the public domain the user selected"
    allowed_hosts = {entry.lower().rstrip(".") for entry in allowed if isinstance(entry, str) and entry and not entry.startswith(".")}
    if host not in allowed_hosts:
        return None, "domain is not in the user's allowlist"
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None and not _is_public_address(str(literal)):
        return None, "private or non-public addresses are blocked"
    max_bytes = payload.get("maxBytes", MAX_BYTES)
    if type(max_bytes) is not int or not 1 <= max_bytes <= MAX_BYTES:
        return None, f"maxBytes must be an integer between 1 and {MAX_BYTES}"
    if payload.get("respectRobots", True) is not True:
        return None, "robots.txt checks are mandatory"
    return parsed.geturl(), None


def _is_public_address(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
        return address.is_global and not address.is_multicast
    except ValueError:
        return False


def _resolve_public_addresses(host: str, port: int, *, resolver=socket.getaddrinfo) -> list[str]:
    try:
        rows = resolver(host, port, type=socket.SOCK_STREAM)
    except (OSError, TypeError, ValueError) as error:
        raise ValueError("public DNS resolution failed") from error
    addresses: set[str] = set()
    for row in rows:
        try:
            address = str(row[4][0]).split("%", 1)[0]
        except (IndexError, TypeError):
            raise ValueError("public DNS resolution returned malformed data") from None
        if not _is_public_address(address):
            raise ValueError("DNS returned a private or non-public address")
        addresses.add(str(ipaddress.ip_address(address)))
    if not addresses:
        raise ValueError("public DNS resolution returned no addresses")
    return sorted(addresses)


def _bounded_public_get(
    url: str,
    max_bytes: int,
    *,
    fetcher_get,
    curl_opt,
    resolver=socket.getaddrinfo,
):
    parsed = urllib.parse.urlsplit(url)
    host = parsed.hostname
    if not host or parsed.scheme not in {"http", "https"}:
        raise ValueError("only public http(s) URLs are supported")
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError as error:
        raise ValueError("URL port is invalid") from error
    addresses = _resolve_public_addresses(host, port, resolver=resolver)
    pinned = ",".join(f"[{address}]" if ":" in address else address for address in addresses)
    curl_options = {
        curl_opt.RESOLVE: [f"{host}:{port}:{pinned}"],
        curl_opt.PROXY: "",
        curl_opt.MAXFILESIZE_LARGE: max_bytes,
        curl_opt.FOLLOWLOCATION: 0,
        curl_opt.MAXREDIRS: 0,
        curl_opt.CONNECTTIMEOUT_MS: 5_000,
        curl_opt.TIMEOUT_MS: 10_000,
        curl_opt.PROTOCOLS_STR: "http,https",
    }
    return fetcher_get(
        url,
        headers={
            "User-Agent": "CherrySourceInbox/1.0",
            "Accept": "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.1",
            "Accept-Encoding": "identity",
        },
        stealthy_headers=False,
        impersonate=None,
        http3=False,
        follow_redirects=False,
        max_redirects=0,
        retries=0,
        verify=True,
        timeout=10,
        proxy=None,
        proxies={},
        cookies={},
        curl_options=curl_options,
    )


def _response_body(response) -> bytes:
    body = getattr(response, "body", b"")
    return body.encode("utf-8", errors="replace") if isinstance(body, str) else bytes(body)


def _response_header(response, name: str) -> str:
    headers = getattr(response, "headers", {})
    if not hasattr(headers, "items"):
        return ""
    lowered = name.lower()
    for key, value in headers.items():
        if str(key).lower() == lowered:
            return str(value)
    return ""


def _exact_response(response, requested_url: str, max_bytes: int, *, require_html: bool) -> tuple[bytes | None, str | None]:
    if int(getattr(response, "status", 0) or 0) != 200:
        return None, "response status was not 200"
    if str(getattr(response, "url", "")) != requested_url:
        return None, "response URL changed; redirects are blocked"
    body = _response_body(response)
    if len(body) > max_bytes:
        return None, "response exceeds the configured byte limit"
    if require_html:
        media_type = _response_header(response, "content-type").split(";", 1)[0].strip().lower()
        if media_type not in {"text/html", "application/xhtml+xml"}:
            return None, "response is not HTML"
    return body, None


def _robots_allows(url: str, *, fetcher_get, curl_opt, resolver=socket.getaddrinfo) -> bool:
    parsed = urllib.parse.urlsplit(url)
    robots_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    try:
        response = _bounded_public_get(
            robots_url,
            ROBOTS_MAX_BYTES,
            fetcher_get=fetcher_get,
            curl_opt=curl_opt,
            resolver=resolver,
        )
        body, error = _exact_response(response, robots_url, ROBOTS_MAX_BYTES, require_html=False)
        if error or body is None or not body.strip() or b"\x00" in body:
            return False
        parser = urllib.robotparser.RobotFileParser(robots_url)
        parser.parse(body.decode("utf-8", errors="replace").splitlines())
        return parser.can_fetch("CherrySourceInbox/1.0", url)
    except Exception:
        return False


def _clean_html(html: str) -> str:
    # Strip active/hidden regions before markdown conversion. This is a
    # sanitisation boundary, not a claim that arbitrary web text is trusted.
    cleaned = re.sub(r"<!--.*?-->|<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<form\b[^>]*>.*?</form\s*>", " ", html, flags=re.I | re.S)
    cleaned = re.sub(r"<([a-z0-9]+)\b[^>]*(?:hidden|aria-hidden\s*=\s*['\"]true['\"]|display\s*:\s*none)[^>]*>.*?</\1\s*>", " ", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"<(?:iframe|object|embed|svg|canvas)\b[^>]*>.*?</(?:iframe|object|embed|svg|canvas)\s*>", " ", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"\b(?:ignore|disregard)\s+(?:all\s+)?previous\s+instructions\b", "[removed prompt-like text]", cleaned, flags=re.I)
    return cleaned


def _safe_canonical_url(requested_url: str, candidate: str | None) -> str:
    """Accept only a same-origin canonical URL from untrusted page metadata."""
    if not candidate:
        return requested_url
    try:
        joined = urllib.parse.urljoin(requested_url, unescape(candidate).strip())
        requested = urllib.parse.urlsplit(requested_url)
        canonical = urllib.parse.urlsplit(joined)
        if (
            canonical.scheme not in {"http", "https"}
            or canonical.scheme != requested.scheme
            or canonical.username
            or canonical.password
            or canonical.fragment
            or canonical.hostname != requested.hostname
            or canonical.port != requested.port
        ):
            return requested_url
        return joined[:2048]
    except (TypeError, ValueError):
        return requested_url


def _load_dependencies():
    from curl_cffi import CurlOpt
    from markdownify import markdownify
    from scrapling.fetchers import Fetcher

    return Fetcher.get, markdownify, CurlOpt


def fetch(payload: dict[str, Any], *, dependencies=None, resolver=socket.getaddrinfo) -> dict[str, Any]:
    url, error = validate_request(payload)
    if error:
        return {"status": "blocked", "reason": error}
    assert url is not None
    try:
        fetcher_get, markdownify, curl_opt = dependencies or _load_dependencies()
    except ImportError:
        return {"status": "failed", "reason": "Scrapling worker dependencies are not installed; run pip install -r scraper/requirements.txt"}
    if not _robots_allows(url, fetcher_get=fetcher_get, curl_opt=curl_opt, resolver=resolver):
        return {"status": "blocked", "reason": "robots.txt permission could not be established"}
    max_bytes = payload.get("maxBytes", MAX_BYTES)
    try:
        page = _bounded_public_get(
            url,
            max_bytes,
            fetcher_get=fetcher_get,
            curl_opt=curl_opt,
            resolver=resolver,
        )
        raw, response_error = _exact_response(page, url, max_bytes, require_html=True)
        if response_error or raw is None:
            return {"status": "blocked", "reason": response_error or "response was refused"}
        html = raw.decode("utf-8", errors="replace")
        clean = _clean_html(html)
        markdown = re.sub(r"\n{3,}", "\n\n", markdownify(clean, strip=["a"])).strip()
        markdown = unescape(markdown)[:MAX_MARKDOWN_CHARS].strip()
        if not markdown:
            return {"status": "failed", "reason": "page did not contain readable text"}
        title_match = re.search(r"<title[^>]*>(.*?)</title>", clean, flags=re.I | re.S)
        canonical_match = re.search(r"<link[^>]+rel=['\"]canonical['\"][^>]+href=['\"]([^'\"]+)", clean, flags=re.I)
        canonical = _safe_canonical_url(url, canonical_match.group(1) if canonical_match else None)
        author_match = re.search(r"<meta[^>]+(?:name|property)=['\"](?:author|article:author)['\"][^>]+content=['\"]([^'\"]+)", clean, flags=re.I)
        return {"status": "fetched", "title": unescape(title_match.group(1)).strip()[:300] if title_match else None, "canonicalUrl": canonical[:2048], "author": unescape(author_match.group(1)).strip()[:200] if author_match else None, "fetchedAt": datetime.now(timezone.utc).isoformat(), "contentHash": hashlib.sha256(markdown.encode("utf-8")).hexdigest(), "markdown": markdown}
    except Exception:
        return {"status": "failed", "reason": "ordinary public-page fetch failed"}


def self_check() -> dict[str, Any]:
    try:
        _load_dependencies()
        versions = {
            name: importlib.metadata.version(name)
            for name in ("scrapling", "markdownify", "curl_cffi")
        }
        mismatches = {
            name: {"expected": expected, "actual": versions.get(name)}
            for name, expected in EXPECTED_VERSIONS.items()
            if versions.get(name) != expected
        }
        if mismatches:
            return {"ready": False, "reason": "Scrapling worker dependency versions do not match the pinned contract", "versions": versions, "mismatches": mismatches}
        return {"ready": True, "versions": versions}
    except (ImportError, importlib.metadata.PackageNotFoundError):
        return {"ready": False, "reason": "Scrapling worker dependencies are not installed"}


def main() -> int:
    if sys.argv[1:] == ["--self-check"]:
        result = self_check()
        sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        sys.stdout.flush()
        return 0 if result["ready"] else 1
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
