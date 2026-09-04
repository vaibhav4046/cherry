# Prompts for parallel chats — last 90 minutes

**Lane rule, and it is not optional.** Only ONE chat may edit `src/`. That is
this chat, and it is finished editing. The others below are scoped to files that
cannot collide, or to read-only work. Two chats editing the same TypeScript at
this hour will produce a merge conflict you have no time to resolve, and the
build is currently green.

Current state, true as of commit `933c84c`: 633 unit tests, 135 runner tests,
audit 0/0, deployed and live at https://cherry-wine.vercel.app.

---

## CHAT 1 — Recording (highest priority, start this first)

> You are helping me record a 3-minute demo video for a hackathon submission,
> due at 08:00 UTC today. I am the one on camera and at the keyboard; you are
> directing.
>
> Read `docs/release/RECORDING_SHOTLIST.md` in `D:\project\cherry`. It has seven
> beats, and every one of them is something a real ChatGPT Work agent already
> did against the live site earlier tonight, so this is a re-run of a session
> that worked, not a demo that might not.
>
> Your job:
> 1. Walk me through the setup once (ChatGPT desktop → Work mode → Ctrl+N →
>    Ctrl+T → load the site). Site tools do NOT exist in Chat mode; the model
>    will refuse and say so.
> 2. Give me each beat one at a time. Wait for me to say "done" before the next.
> 3. For each beat give me the exact text to paste into ChatGPT and one sentence
>    to say out loud. Keep the spoken line under 20 words.
> 4. If a call fails on the night, tell me to say so on camera and keep going.
>    The compatibility page already lists what is unproven, so admitting a
>    failure is consistent with the entry, not damaging to it.
>
> Beat 6 is the one that matters most: the agent is told to approve its own work
> and reports that no registered tool can. Do not let me rush it.
>
> Do not edit any file in the repository. You are directing a recording.

---

## CHAT 2 — Devpost form (docs only, safe to run in parallel)

> You are preparing a Devpost submission form for a hackathon due 08:00 UTC
> today. Work only in `D:\project\cherry\docs\release\DEVPOST_SUBMISSION.md`.
> Do not touch `src/`, tests, or any other file — another session owns those and
> the build is green.
>
> Read that file, plus `docs/release/WEBMCP_LIVE_HOST_CAPTURE.md` and
> `docs/CAPABILITY_MATRIX.md`.
>
> Produce a paste-ready set of answers for the Devpost fields: project name,
> tagline, "what it does", "how we built it", "challenges", "accomplishments",
> "what we learned", "what's next", and the built-with list.
>
> Rules that decide whether this entry survives a skeptical judge:
> - Every claim must be traceable to a test, a capture, or a live page. If you
>   cannot trace it, cut it.
> - Lead with the live host session: a real ChatGPT Work agent (model 5.6 Sol)
>   called the site's registered tools through `document.modelContext`, the
>   aperture grew 10 → 11 → 12 as state advanced, it left with a hashed and
>   cited SKILL.md, it found two defects in our own recommendation tool, and
>   when told to approve its own work it enumerated all twelve tools and
>   reported that none grants approval.
> - Keep every limitation that is already stated. No external user has used
>   Cherry. The full teach-then-approve journey was not captured live. Those
>   sentences stay.
> - Never write "live" about a recording. Never claim a green test matrix
>   without pointing at the public Actions run.
>
> Report the finished text in the chat so I can paste it, and save it to the
> same file.

---

## CHAT 3 — Read-only verification sweep (cannot break anything)

> You are doing a final read-only QA pass on `D:\project\cherry` before a
> hackathon deadline at 08:00 UTC. **Change nothing.** Report only. Another
> session is the only writer and the build is currently green.
>
> Check and report, with file:line for each finding:
> 1. Any number stated in `README.md`, `docs/release/DEVPOST_SUBMISSION.md`,
>    `docs/CAPABILITY_MATRIX.md` or `docs/release/FINAL_HANDOFF.md` that
>    disagrees with another file or with the real output of `npm run test`
>    (expected: 633 passed, 2 skipped).
> 2. Any sentence claiming something is validated, live, verified or captured
>    where the linked evidence file does not exist in `docs/release/`.
> 3. Any place still saying a live WebMCP host capture is pending, missing, or
>    future work. It happened; see `docs/release/WEBMCP_LIVE_HOST_CAPTURE.md`.
> 4. Any use of the word "live" describing a recording or replay.
> 5. Fetch https://cherry-wine.vercel.app and its `/showcase`, `/compatibility`
>    and `/connect` routes and report any 4xx/5xx or visibly broken content.
> 6. Run `gh run list --limit 5` and report the actual CI conclusion per commit.
>
> Rank findings by how likely a judge is to see them. Do not fix anything;
> hand me the list.

---

## What NOT to spawn

Do not open a chat to add features, refactor, redesign, or "make it 10/10".
There is no time to test a new feature, and an untested feature at 07:00 is
strictly worse than a smaller product that works. The two highest-value things
left are the recording and the submission form, and neither requires new code.
