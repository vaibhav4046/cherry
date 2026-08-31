# Vaibhav's list — the only things that need a human

Everything else runs agent-to-agent through the operating model. Your three acts:

## 1. Tuesday, two minutes: sanity taps

- Open https://cherry-wine.vercel.app on your phone and laptop. If anything looks broken to you,
  screenshot it into the chat — one screenshot beats ten paragraphs.
- Optional but valuable: sign in once on production (email code) so the Privy path is
  human-verified end to end. Then it can be labeled honestly as verified.

## 2. Wednesday by ~15:00 London: the video (only you can do this)

- Script: `docs/release/DEMO_SCRIPT.md` (kept current by Claude; re-read it Wednesday, not before).
- Under 3 minutes, with audio, public on YouTube. Screen-record at 1440×900 or larger.
- One take is fine. The failed-verification beat stays in — it is the credibility peak.
- If you can open the site inside ChatGPT's in-app browser on your machine, record the
  recommend_skills moment there; if not, the mock-host e2e remains the honest claim and the
  video uses the Agent View.

## 3. Wednesday by ~18:00 London (deadline 21:00): submit

- Form map: `docs/release/DEVPOST_SUBMISSION.md` — every field is pre-written; paste, attach the
  video link, submit. Register/join the hackathon on Devpost first if you haven't.
- Confirm the GitHub repo is public and current (the agents push, but eyeball
  github.com/vaibhav4046/cherry shows recent commits).

## Standing safety notes

- Rotate the Privy app secret and the Vercel token after the hackathon (both were pasted in
  chat). Nothing uses the app secret; the token is used only for env + deploys.
- If both agent sessions ever look stuck on git at the same time, approve the file-deletion
  permission prompt (lets git clean its own lock files) or delete `D:\project\cherry\.git\*.lock`
  files older than a minute yourself.
