import unittest

from scraper.worker import validate_request


class WorkerContractTests(unittest.TestCase):
    def test_rejects_protected_and_unsafe_targets(self):
        for url in (
            "javascript:alert(1)",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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

    def test_rejects_fragment_and_robots_opt_out(self):
        _, reason = validate_request({"url": "https://example.com/article#part", "allowedDomains": ["example.com"]})
        self.assertIn("fragments", reason or "")


if __name__ == "__main__":
    unittest.main()

