# Cherry demo — voiceover script (final cut)

Generated from the finished film, not written beside it. Timecodes are the measured beat
boundaries of the two captures the film is made from (`docs/release/demo/journey-capture.json`
and `docs/release/demo-capture.json`), so a line can be checked against the second it claims.

- **Film:** `public/media/demo/cherry-demo-final.mp4` — 2:26, 1920x1080, 30 fps, no audio track
- **Subtitles:** `public/media/demo/cherry-demo-final.srt`
- **Words:** 220 (≈88 s at 150 wpm across 146 s of picture)
- **Cues:** 20

The first 1:31 is a single unbroken run: an agent doing the whole job through tools Cherry
registered with a WebMCP host, against the deployed site, with real IndexedDB. The tail is the
WebMCP aperture and the live-host evidence.

## Voice direction

Plain, unhurried, slightly dry. The product refuses to overclaim, so the read should not oversell
it. No rising inflection on statements. Let the gaps sit; that is when the viewer reads the screen.

ElevenLabs: Stability 50, Similarity 75, Style 0, Speaker boost off. Neutral British or
transatlantic. Render 44.1 kHz mono.

## Script

| # | In | Shot | On screen | Line |
| --- | --- | --- | --- | --- |
| 1 | 00:00 | 21.2s | One unbroken run — An agent does the whole job | One agent, one unbroken run, doing the whole job. |
| 2 | 00:22 | 4.7s | The aperture — The page hands over its tools | Cherry hands a visiting agent its tools, straight from the page. |
| 3 | 00:26 | 5.1s | start_apprenticeship — A project and a mission, in one call | One call creates the project and the mission. |
| 4 | 00:31 | 14.2s | add_source_evidence — Every claim it records is untrusted | It records the source, and every claim it records is untrusted by default. |
| 5 | 00:46 | 4.4s | derive_skill — A five-step workflow, cited to the source | Derivation produces a real five-step workflow, each step cited to the source. |
| 6 | 00:50 | 5.9s | The boundary — approval_required — and no export tool exists | Now the boundary. get_skill returns approval_required, and the export tools are not registered at all. |
| 7 | 00:56 | 3.4s | Human only — The decision happens on Cherry's own screen | The agent hands over a link. The decision happens on Cherry’s own screen. |
| 8 | 00:59 | 4.9s | Approved — Pinned to this exact revision | Approved, and pinned to this exact revision. |
| 9 | 01:04 | 5.1s | Execution — Real files, written by the agent | Execution opens. The agent writes real files. |
| 10 | 01:09 | 13.7s | run_verification — It failed, on the placeholder it left behind | Verification fails, honestly, on the placeholder it left behind. |
| 11 | 01:23 | 4.2s | apply_verified_repair — The same checks, now passing | It repairs the file, runs the same checks again, and they pass. |
| 12 | 01:27 | 8.1s | Carry it anywhere — A bundle, a receipt, an archive | Only now do the exports open: a bundle, a receipt, and an archive. |
| 13 | 01:31 | 6.1s | WebMCP — The page hands the agent its tools | This is the aperture the page registers. |
| 14 | 01:37 | 8.4s | State-aware aperture — Eleven tools, and not one more | Eleven tools. Seven always on, and the rest only when the state earns them. |
| 15 | 01:45 | 7.4s | Real closures — One row per registered tool | One row per registered closure, and a live call log beside it. |
| 16 | 01:52 | 5.0s | Live call log — You can see what it asked for | You can see exactly what the agent asked for. |
| 17 | 01:57 | 6.1s | Live host — ChatGPT desktop, Work mode | A real host did this too: ChatGPT desktop, in Work mode. |
| 18 | 02:04 | 7.4s | Validated — It fetched the aperture and called the tools | It fetched the aperture and called the tools. The row says Validated because it happened. |
| 19 | 02:11 | 5.0s | Honest by default — What ships, says ships | What ships, says ships. What does not, says that too. |
| 20 | 02:16 | 17.3s | cherry-wine.vercel.app — An agent cannot approve its own work | Every claim here is checkable, and an agent cannot approve its own work. |

## Continuous read

One agent, one unbroken run, doing the whole job.

Cherry hands a visiting agent its tools, straight from the page.

One call creates the project and the mission.

It records the source, and every claim it records is untrusted by default.

Derivation produces a real five-step workflow, each step cited to the source.

Now the boundary. get_skill returns approval_required, and the export tools are not registered at all.

The agent hands over a link. The decision happens on Cherry’s own screen.

Approved, and pinned to this exact revision.

Execution opens. The agent writes real files.

Verification fails, honestly, on the placeholder it left behind.

It repairs the file, runs the same checks again, and they pass.

Only now do the exports open: a bundle, a receipt, and an archive.

This is the aperture the page registers.

Eleven tools. Seven always on, and the rest only when the state earns them.

One row per registered closure, and a live call log beside it.

You can see exactly what the agent asked for.

A real host did this too: ChatGPT desktop, in Work mode.

It fetched the aperture and called the tools. The row says Validated because it happened.

What ships, says ships. What does not, says that too.

Every claim here is checkable, and an agent cannot approve its own work.

## Muxing the finished voiceover

```bash
ffmpeg -i public/media/demo/cherry-demo-final.mp4 -i voiceover.mp3   -c:v copy -c:a aac -b:a 192k -shortest   public/media/demo/cherry-demo-final-voiced.mp4
```
