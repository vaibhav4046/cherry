# Post-hackathon roadmap (Track G)

Order follows the directive. Nothing here is started before submission unless P0 is green.

1. General MCP client host: isolated clients per server, stdio and Streamable HTTP, OAuth 2.1 with
   PKCE, audience-bound tokens, no passthrough, per-server permissions, cancellation and progress.
2. OAuth and token-handle connection service backed by an OS keychain; tokens never in browser
   persistence, repository or logs.
3. Kilo, Kimi, Ollama and verified OmniRoute adapters: probe first, deterministic fixture run,
   `shipped_tested` only after a real probe and capture.
4. Model and host router with measured pass rate, latency, cost and privacy preference.
5. Visible browser computer with human takeover for sign-in, CAPTCHA and 2FA.
6. Docker and WSL sandbox providers behind the same `SandboxManager` interface, honest `container`
   label.
7. Event bus and connector webhooks.
8. Gmail and Calendar capability packs (draft by default, send on approval).
9. LinkedIn official publishing (`w_member_social` where granted), never scraping.
10. YouTube official publishing and multimodal local-media learning.
11. Remote worker provider ("Cherry Cloud" stays Roadmap until deployed and captured).
12. Distributed CAS and index backends (see SCALE_DESIGN.md).
13. Teams, marketplace and enterprise policy.
14. Creative capability packs (image, video, 3D, game workflows).
