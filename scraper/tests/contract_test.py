import unittest
from pathlib import Path
from unittest.mock import patch

from scraper.worker import (
    MAX_BYTES,
    _bounded_public_get,
    _resolve_public_addresses,
    _robots_allows,
    _safe_canonical_url,
    fetch,
    self_check,
    validate_request,
)


class FakeCurlOpt:
    RESOLVE = "RESOLVE"
    PROXY = "PROXY"
    MAXFILESIZE_LARGE = "MAXFILESIZE_LARGE"
    FOLLOWLOCATION = "FOLLOWLOCATION"
    MAXREDIRS = "MAXREDIRS"
    CONNECTTIMEOUT_MS = "CONNECTTIMEOUT_MS"
    TIMEOUT_MS = "TIMEOUT_MS"
    PROTOCOLS_STR = "PROTOCOLS_STR"


class FakePage:
    def __init__(self, url, body=b"", status=200, content_type="text/html; charset=utf-8"):
        self.url = url
        self.body = body
        self.status = status
        self.headers = {"content-type": content_type}


def public_resolver(host, port, **_kwargs):
    return [(2, 1, 6, "", ("93.184.216.34", port))]


class WorkerContractTests(unittest.TestCase):
    def test_rejects_protected_and_unsafe_targets(self):
        for url in (
            "javascript:alert(1)",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            "https://www.linkedin.com/posts/example",
            "https://user:pass@example.com/post",
            "http://127.0.0.1:8080/private",
        ):
            _, reason = validate_request({"url": url, "allowedDomains": ["example.com"]})
            self.assertIsNotNone(reason, url)

    def test_requires_explicit_allowlist_and_public_domain(self):
        _, reason = validate_request({"url": "https://example.com/article"})
        self.assertIn("allowedDomains", reason or "")
        _, reason = validate_request({"url": "https://other.example/article", "allowedDomains": ["example.com"]})
        self.assertIn("allowlist", reason or "")

    def test_validates_fetch_limits_and_mandatory_robots(self):
        base = {"url": "https://example.com/article", "allowedDomains": ["example.com"]}
        for invalid in (0, -1, MAX_BYTES + 1, "1000", True):
            _, reason = validate_request({**base, "maxBytes": invalid})
            self.assertIn("maxBytes", reason or "")
        _, reason = validate_request({**base, "respectRobots": False})
        self.assertIn("robots", (reason or "").lower())

    def test_rejects_fragment_and_robots_opt_out(self):
        _, reason = validate_request({"url": "https://example.com/article#part", "allowedDomains": ["example.com"]})
        self.assertIn("fragments", reason or "")

    def test_dns_guard_requires_every_address_to_be_globally_routable(self):
        for address in ("127.0.0.1", "10.0.0.1", "100.64.0.1", "169.254.1.1", "224.0.0.1", "::1", "fe80::1"):
            def resolver(_host, port, **_kwargs):
                return [(2, 1, 6, "", (address, port))]

            with self.assertRaises(ValueError, msg=address):
                _resolve_public_addresses("example.com", 443, resolver=resolver)

        def mixed(_host, port, **_kwargs):
            return [
                (2, 1, 6, "", ("93.184.216.34", port)),
                (2, 1, 6, "", ("127.0.0.1", port)),
            ]

        with self.assertRaises(ValueError):
            _resolve_public_addresses("example.com", 443, resolver=mixed)

    def test_bounded_get_pins_dns_and_disables_redirects_proxies_and_retries(self):
        captured = {}

        def fake_get(url, **kwargs):
            captured.update(kwargs)
            return FakePage(url, b"ok")

        page = _bounded_public_get(
            "https://example.com/article",
            4096,
            fetcher_get=fake_get,
            curl_opt=FakeCurlOpt,
            resolver=public_resolver,
        )
        self.assertEqual(page.body, b"ok")
        self.assertFalse(captured["follow_redirects"])
        self.assertEqual(captured["max_redirects"], 0)
        self.assertEqual(captured["retries"], 0)
        self.assertTrue(captured["verify"])
        self.assertFalse(captured["stealthy_headers"])
        self.assertIsNone(captured["impersonate"])
        options = captured["curl_options"]
        self.assertEqual(options[FakeCurlOpt.RESOLVE], ["example.com:443:93.184.216.34"])
        self.assertEqual(options[FakeCurlOpt.PROXY], "")
        self.assertEqual(options[FakeCurlOpt.MAXFILESIZE_LARGE], 4096)
        self.assertEqual(options[FakeCurlOpt.FOLLOWLOCATION], 0)
        self.assertEqual(options[FakeCurlOpt.MAXREDIRS], 0)
        self.assertEqual(options[FakeCurlOpt.PROTOCOLS_STR], "http,https")

    def test_robots_fails_closed_and_never_fetches_the_page_when_permission_is_absent(self):
        for page in (
            FakePage("https://example.com/robots.txt", b"User-agent: *\nAllow: /", status=404),
            FakePage("https://example.com/robots.txt", b""),
            FakePage("https://example.com/robots.txt", b"User-agent: *\nDisallow: /"),
            FakePage("https://private.invalid/robots.txt", b"User-agent: *\nAllow: /"),
        ):
            calls = []

            def fake_get(url, **kwargs):
                calls.append((url, kwargs))
                return page

            self.assertFalse(_robots_allows(
                "https://example.com/article",
                fetcher_get=fake_get,
                curl_opt=FakeCurlOpt,
                resolver=public_resolver,
            ))
            self.assertEqual(len(calls), 1)

    def test_fetch_requires_exact_safe_responses_and_sanitizes_valid_html(self):
        html = b"<html><head><title>Safe</title></head><body><script>bad()</script><main>Hello</main></body></html>"

        def markdownify(value, **_kwargs):
            return value

        def run_with(page):
            responses = iter([
                FakePage("https://example.com/robots.txt", b"User-agent: *\nAllow: /"),
                page,
            ])
            return fetch(
                {"url": "https://example.com/article", "allowedDomains": ["example.com"], "maxBytes": 4096, "respectRobots": True},
                dependencies=(lambda _url, **_kwargs: next(responses), markdownify, FakeCurlOpt),
                resolver=public_resolver,
            )

        valid = run_with(FakePage("https://example.com/article", html))
        self.assertEqual(valid["status"], "fetched")
        self.assertNotIn("bad()", valid["markdown"])
        self.assertIn("Hello", valid["markdown"])

        for unsafe in (
            FakePage("https://example.com/article", html, status=302),
            FakePage("https://private.invalid/", html),
            FakePage("https://example.com/article", b"{}", content_type="application/json"),
            FakePage("https://example.com/article", b"x" * 4097),
        ):
            self.assertEqual(run_with(unsafe)["status"], "blocked")

    def test_canonical_metadata_cannot_repoint_the_saved_source(self):
        requested = "https://example.com/article"
        self.assertEqual(_safe_canonical_url(requested, "/canonical"), "https://example.com/canonical")
        for unsafe in (
            "https://other.example/article",
            "http://example.com/article",
            "https://user:pass@example.com/article",
            "https://example.com/article#fragment",
            "https://example.com:444/article",
        ):
            self.assertEqual(_safe_canonical_url(requested, unsafe), requested)

    def test_dependency_contract_uses_exact_direct_pins(self):
        requirements = (Path(__file__).parents[1] / "requirements.txt").read_text(encoding="utf-8").splitlines()
        self.assertEqual(requirements, ["scrapling[fetchers]==0.4.15", "markdownify==1.2.3"])

    def test_self_check_rejects_versions_outside_the_pinned_contract(self):
        versions = {"scrapling": "0.4.14", "markdownify": "1.2.3", "curl_cffi": "0.13.0"}
        with patch("scraper.worker._load_dependencies"), patch("scraper.worker.importlib.metadata.version", side_effect=lambda name: versions[name]):
            result = self_check()
        self.assertFalse(result["ready"])
        self.assertEqual(result["mismatches"]["scrapling"]["expected"], "0.4.15")

    def test_missing_dependencies_fail_before_any_network_boundary(self):
        with patch("scraper.worker._load_dependencies", side_effect=ImportError), patch("scraper.worker._robots_allows") as robots:
            result = fetch({"url": "https://example.com/article", "allowedDomains": ["example.com"]})
        self.assertEqual(result["status"], "failed")
        robots.assert_not_called()


if __name__ == "__main__":
    unittest.main()
