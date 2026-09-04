# The ChatGPT segment: how to shoot it, and how to splice it in

This is the one shot in the film that cannot be produced from an agent session on this machine.
Screen recording is not available here — the desktop-control tooling returns screenshots only, and
the browser extension that could drive chatgpt.com is not connected. A burst of screenshots would
be a slideshow, not a recording, so none was faked.

Everything else about the segment is already solved: the session has been done for real once, the
exact path is written down below, and the film is cut so the segment drops in at a known seam.

## Shoot it (about three minutes)

Start any screen recorder first — Xbox Game Bar (`Win+Alt+R`) records the foreground window and is
already on this machine. Record at 1280x720 or larger.

1. Open **ChatGPT desktop**.
2. Mode switcher, top left → **ChatGPT** → turn on **Work**.
   Site Tools do not work in Chat mode; the model will say so and refuse.
3. `Ctrl+N` for a clean chat.
4. `Ctrl+T` opens the built-in browser as a **split pane inside the same window**.
5. Type `cherry-wine.vercel.app/studio/agent` and let it load. The badge should read
   **Site tools available**.
6. Prompt, verbatim:

   > Use the site tools on this page. Call `read_cherry_context`, then `list_cherry_capabilities`,
   > then `introduce_agent` with the name "ChatGPT Work — live capture". Then call
   > `load_starter_library`, then `recommend_skills` for "review a YouTube thumbnail", and show me
   > the skill you found with `get_skill`.

7. Let it run to the end. The page's aperture will grow as the state advances, and the
   **Recent tool calls** panel fills with real results.
8. Stop the recording.

**Gotchas that cost time the first time:** clicking the top-left compose icon minimises the window;
the browser pane only renders while ChatGPT is frontmost; and Site Tools are genuinely unavailable
outside Work mode, so a Chat-mode attempt will look like a product failure when it is not.

## Splice it into the film

The cut is `public/media/demo/cherry-demo-final.mp4`. The seam after the intro and the live journey
is where this belongs. With the recording saved as `chatgpt.mp4`:

```bash
ffmpeg -i chatgpt.mp4 -vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1 \
  -r 30 -c:v libx264 -crf 20 -pix_fmt yuv420p chatgpt-720.mp4
```

Then give it the same framing as the rest of the film. Write a `capture.json` beside it with one
beat per moment you want captioned, a matching captions file, and run:

```bash
node scripts/cinema-demo.mjs --in <dir> --source chatgpt-720.mp4 \
  --captions <captions.json> --out chatgpt-cinema.mp4
```

Finally re-run the assembler with the new segment added to the list:

```bash
bash scripts/assemble-final.sh <scratchpad root>
```

## What stands in for it today

`docs/release/WEBMCP_LIVE_HOST_CAPTURE.md` records the session that already happened: ChatGPT
desktop, Work mode, model 5.6, against this deployment. It names the mechanism the host reported
using (`tab.capabilities.get("webmcp")` → `fetchTools()` → `tools.call(...)`), the exact aperture it
received, and the two real defects that session exposed in `recommend_skills` — both since fixed.
The `/compatibility` row is Validated because of that session, not in spite of it.
