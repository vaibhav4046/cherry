# Live WebMCP host capture — ChatGPT Work

Captured 2026-09-04, 04:02 UTC (04:02 local, Windows 11) against
https://cherry-wine.vercel.app/studio/agent, deployed from commit `eabdd37`.

| | |
| --- | --- |
| Host | ChatGPT desktop app, **Work** mode, built-in browser |
| Model | 5.6 Sol, Extra High |
| Surface | WebMCP site tools via `document.modelContext` |
| Page | `/studio/agent` |

This is the row that was previously **Experimental**. It is the one thing the
project had never captured: a real proprietary in-browser WebMCP host invoking
Cherry's registered closures.

## What the page reported before any call

> Site tools available · 10
> Site tools registered, no agent call yet · Phase: No space yet · Page: default

## What the host called

Verbatim, from the host's own account of the mechanism it used:

```
tab.capabilities.get("webmcp")
  → fetchTools()
  → tools.call(...)
```

1. `tools.call("introduce_agent", { name: "ChatGPT Work - live capture" })`
2. `tools.call("read_cherry_context", {})`
3. `tools.call("list_cherry_capabilities", {})`

## The mechanism question, asked and answered

Computer control was available in that session, so "the page changed" is not by
itself proof that a tool ran. The host was asked directly whether it had used
the registered tools or simply driven the UI. Its answer, quoted:

> "Yes. The agent name was set through Cherry's registered WebMCP tool, not by
> clicking or typing in the page UI. [...] Those calls invoke the tools
> registered by the page through `document.modelContext`. Computer control was
> used only to connect to the existing tab and later read the page accessibility
> state for verification. No page controls were clicked, and no text was typed
> into the UI."

The state change corroborates it independently: `introduce_agent` is the only
way to set the attached-agent name. Agent View exposes no input for it, so no
sequence of clicks or keystrokes could have produced the badge below.

## What the page reported after

> Agent connected · 10 tools
> **Attached: ChatGPT Work - live capture** · Phase: No space yet · Page: default

## What the tools returned

Product state `empty`; workspace none ("No workspace exists"); phase
"No space yet"; page `default`; pending approvals none; agent
"ChatGPT Work - live capture"; registered tools 10.

The ten registered names, exactly as returned:

```
read_cherry_context      list_skills            start_apprenticeship
list_cherry_capabilities recommend_skills       create_workspace
get_cherry_status        get_skill              create_mission
introduce_agent
```

That is the documented aperture with nothing extra: **7 always-on tools plus 3
contextual tools** for the `empty` state. The bound is 7 + at most 5, and an
empty workspace offers 3 of those 5.

## What this capture does and does not prove

It proves registration, invocation and state mutation through
`document.modelContext` in a real proprietary host, and that the aperture the
documentation describes is the aperture the host actually sees.

It does not prove the full learn → approve → retrieve journey. No skill was
derived and no human approval was exercised in this session, so the approval
boundary remains covered by tests and by the stdio capture in which
`approve_skill` does not exist. Those rows keep their existing labels.
