# Optional local Scrapling fetcher

Cherry can request one public article page at a time through a paired local
runner. The React app does not bundle Python, scrape in the cloud, or start a
background crawler. You choose the URL, click **Fetch selected page**, and the
result remains untrusted until you review it.

```powershell
py -3.10 -m venv .cherry-scraper
.cherry-scraper\Scripts\Activate.ps1
python -m pip install -r scraper/requirements.txt
node runner/server.mjs --root . --allow-exec python
```

The requirements file pins Scrapling `0.4.15` and Markdownify `1.2.3` exactly.
At startup the runner performs one local import/version self-check and reports
`setup_required` until that contract passes. This repository does not yet ship
a hash-locked transitive Python environment, so do not describe the optional
fetcher as fully reproducible across Python platforms.

The Python allowlist entry is reserved for Cherry's fixed
`scraper/worker.py` capability. It does not permit `python -c`, arbitrary
scripts, or Python through the generic command adapters.

Pair the token printed by the runner in Studio → Connect. The worker accepts a
single JSON request, uses Scrapling's ordinary `Fetcher.get` only, checks
robots.txt fail-closed, pins the public DNS resolution used by the connection,
blocks redirects, proxies, YouTube/LinkedIn/private addresses and embedded
credentials, bounds response/time/text size, and strips active/hidden markup
before returning Markdown. Stealth fetchers, proxy rotation, CAPTCHA solving, session
cookies, and remote browsers are intentionally not supported.

If Python or the worker is not configured, Sources remains fully usable for
user-pasted/exported text and the fetch action reports setup required. A URL is
metadata, not permission to redistribute a page.
