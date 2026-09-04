# Cherry demo — voiceover script

This script is generated from the finished video, not written alongside it. Every line below is
the exact text of the subtitle cue at that timecode in `public/media/demo/cherry-demo.mp4`, and
the timings are the measured beat boundaries recorded during capture
(`docs/release/demo-capture.json`). If the video is re-cut, regenerate this file — do not edit
it by hand, or the voice and the picture will drift.

- **Video:** `public/media/demo/cherry-demo.mp4` (clean master, no audio track)
- **Runtime:** 1:43 (102.96 s)
- **Words:** 205 (≈82 s at 150 wpm, leaving ~21 s of deliberate air for the clicks and page loads)
- **Cues:** 16

## Voice direction

Plain, unhurried, and slightly dry. This is a product that refuses to overclaim, so the read should
not oversell it either. No rising inflection at the end of statements. Let the two-second gaps sit;
they are where the viewer reads the screen.

Suggested ElevenLabs settings: Stability 50, Similarity 75, Style 0, Speaker boost off. A measured
British or neutral-transatlantic voice suits the copy. Render at 44.1 kHz mono.

## Script

| # | In | Shot length | On screen | Line |
| --- | --- | --- | --- | --- |
| 1 | 00:00 | 5.0s | Title card: Cherry | Cherry turns a lesson into supervised work an agent can run. |
| 2 | 00:05 | 7.3s | Landing hero: "One task. An entire AI team." | This is the deployed product. One task, and an entire team of agents behind it. |
| 3 | 00:12 | 6.4s | Landing proof rail: tasks, work areas, parallel time, checks | Two tasks. Two work areas. Thirty-four seconds in parallel. Two checks passed. |
| 4 | 00:19 | 5.0s | Landing: how the work is supervised | You set the goal. Cherry plans, runs it, and checks the result. |
| 5 | 00:24 | 5.3s | Title card: neither could publish | The receipt: two agents ran one job. Neither could publish it. |
| 6 | 00:29 | 7.4s | Showcase: recorded run of two agents on one job | A recorded run, verified before it was ever put on this page. |
| 7 | 00:36 | 6.4s | Showcase: the run, step by step | Every step is on the record: what ran, and what it produced. |
| 8 | 00:43 | 5.0s | Showcase: the approval a human had to give | Publishing stops here, because no person had approved it yet. |
| 9 | 00:48 | 6.2s | Title card: WebMCP aperture (stand-in host) | Now WebMCP. Cherry hands a visiting agent its tools from the page. |
| 10 | 00:54 | 8.4s | Agent View: badge reads Agent connected, tools registered | Site tools available: eleven. Seven always on, and stage tools that appear only when the state earns them. |
| 11 | 01:02 | 7.4s | Agent View: the tool table, one row per registered closure | One row per registered closure. These are the real tools, not a description of them. |
| 12 | 01:10 | 5.0s | Agent View: the live call log | And a live call log, showing exactly what the agent ran. |
| 13 | 01:15 | 6.1s | Title card: real ChatGPT desktop capture | A real host did this too: ChatGPT desktop, in Work mode. |
| 14 | 01:21 | 7.4s | Compatibility: the live-host row, Validated | It fetched the aperture and called the tools. That row says Validated because it happened. |
| 15 | 01:28 | 5.0s | Compatibility: what is shipped, what is not | What ships, says ships. What does not, says that too. |
| 16 | 01:33 | 17.3s | Closing card | Every claim here is checkable. And the one thing an agent cannot do is approve its own work. |

## Continuous read

Use this if your voice tool takes one block. The line breaks are the pauses.

Cherry turns a lesson into supervised work an agent can run.

This is the deployed product. One task, and an entire team of agents behind it.

Two tasks. Two work areas. Thirty-four seconds in parallel. Two checks passed.

You set the goal. Cherry plans, runs it, and checks the result.

The receipt: two agents ran one job. Neither could publish it.

A recorded run, verified before it was ever put on this page.

Every step is on the record: what ran, and what it produced.

Publishing stops here, because no person had approved it yet.

Now WebMCP. Cherry hands a visiting agent its tools from the page.

Site tools available: eleven. Seven always on, and stage tools that appear only when the state earns them.

One row per registered closure. These are the real tools, not a description of them.

And a live call log, showing exactly what the agent ran.

A real host did this too: ChatGPT desktop, in Work mode.

It fetched the aperture and called the tools. That row says Validated because it happened.

What ships, says ships. What does not, says that too.

Every claim here is checkable. And the one thing an agent cannot do is approve its own work.

## Muxing the finished voiceover

The master has no audio track, so the voiceover is added, not mixed over anything:

```bash
ffmpeg -i public/media/demo/cherry-demo.mp4 -i voiceover.mp3   -c:v copy -c:a aac -b:a 192k -shortest   public/media/demo/cherry-demo-voiced.mp4
```

If the render comes back longer than 102.96 s, slow the video rather than speeding the voice:
`-filter:v "setpts=<factor>*PTS"`. The cue table above is the reference for what has to stay in sync.
