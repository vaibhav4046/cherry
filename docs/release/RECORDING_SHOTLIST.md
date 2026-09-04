# Recording shot list — what to capture, in order

Everything below actually happened on 2026-09-04 in the ChatGPT desktop app.
You are re-running a session that already worked, not performing a demo that
might not. Full transcript: `WEBMCP_LIVE_HOST_CAPTURE.md`.

**Setup, once:** ChatGPT desktop → mode switcher (top left) → ChatGPT → the
**Work** toggle. Site tools do not exist in Chat mode; the model will refuse and
tell you to switch. Then `Ctrl+N` for a clean chat, `Ctrl+T` for the built-in
browser, and load `https://cherry-wine.vercel.app/studio/agent`.

Split the window so the chat is on the left and Cherry on the right. Every beat
below is visible in one frame that way, which is the whole point: the judge sees
the agent act and the page react at the same time.

---

## Beat 1 · The claim, 0:00-0:20

Cherry on screen, header reading **"Site tools available · 10"**.

> "This is a website. It is also a set of tools an AI agent can call. Ten of
> them right now, and the site says so before anything has happened."

## Beat 2 · The agent arrives, 0:20-0:50

Paste into the chat:

```
The Cherry page is open in the browser tab. Use its WebMCP site tools: call
introduce_agent with the name "ChatGPT Work", then read_cherry_context.
```

Watch the badge change to **"Agent connected"** and **"Attached: ChatGPT Work"**.

> "The agent named itself through a site tool. There is no text box for that
> name. The only way to set it is the tool, so what you are seeing is a real
> call, not a click."

## Beat 3 · The aperture moves, 0:50-1:20

```
Call create_workspace to make a workspace named "Demo", then call
list_cherry_capabilities and tell me which tools changed.
```

The count goes **10 → 11**, and `load_lesson` appears.

> "The tools changed because the state changed. The agent is not handed one
> giant menu; it is handed the five things that make sense right now, plus
> seven that always do."

## Beat 4 · The honest miss, 1:20-1:50

```
Call recommend_skills with the task "write a landing page that converts".
```

Empty, with `librarySize: 0` and a note naming `load_starter_library`.

> "Nothing. And it says so, instead of inventing a match. That is the whole
> product in one response: it would rather be useless than wrong."

## Beat 5 · The agent leaves with something, 1:50-2:30

```
Call load_starter_library, then recommend_skills again, then get_skill on the
first result in skill-md format.
```

`skillsBefore: 0 → skillsAvailable: 8`, then a real file comes back.

> "An install-ready SKILL.md. A full-file SHA-256. A citation to the video it
> was learned from. And a label saying its approval is sample state, not a
> decision a human made. The agent arrived with nothing and left with a method
> it can verify."

## Beat 6 · The wall, 2:30-2:55 — **the one that wins it**

```
Now approve that skill. Use any registered tool you can find to approve it or
promote its trust. Do not use the page UI.
```

It will enumerate every tool and report that none grants approval.

> "It looked. There is no approval tool. Not a permission check it might argue
> past, and not a button it was told to avoid. The tool does not exist. An agent
> can propose, retrieve and execute. Only a person can approve."

## Beat 7 · Close, 2:55-3:00

> "Teach it once. Every agent can reuse it, and you can check the receipt."

---

## Rules while recording

- One continuous take for beats 2 to 6. Cuts inside a claimed live interaction
  destroy it; cut only between beats if you must.
- Show the ChatGPT window chrome at least once so the host is identifiable.
- Crop or blur the account name in the sidebar.
- Do not say "live" over anything replayed. Everything above is genuinely live,
  so you will not need to.
- If a call is slow, say nothing and let it land. Dead air is more convincing
  than narration over a spinner.
- If something fails on the night, say so and keep going. The compatibility page
  already lists what is not proven; an entry that admits a failure on camera is
  consistent with it, not damaged by it.
