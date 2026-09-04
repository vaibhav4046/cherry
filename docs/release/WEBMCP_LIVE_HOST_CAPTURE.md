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

---

# Second session: the full inversion, and two defects it exposed

Same host and model, 2026-09-04 04:20-04:47 UTC, against the deployed site.
The first session proved the protocol. This one asked whether the product is
worth connecting to, which is a different question, and it initially answered no.

## What the host did

| # | Call | Result |
| --- | --- | --- |
| 1 | `create_workspace` | Created `Live host proof`. Page header changed, phase moved to "Space ready, project drafting" |
| 2 | `list_cherry_capabilities` | Aperture grew 10 → 11: `load_lesson` registered for the new state |
| 3 | `recommend_skills` | **Empty.** Every call reported `ok` |
| 4 | `get_skill` | Not called; there was no id to call it with |

The aperture changing with state is the WebMCP claim, and it held. The rest did
not: the tool the entry is actually built on returned nothing.

## Defect 1 — first contact was a dead end

A fresh browser has an empty cross-workspace library, so `recommend_skills`
correctly matched nothing. Correct is not the same as useful: the site claims it
sends an agent away more capable, and it was sending it away with a suggestion
that a human go and do some work.

Returning the shipped library without installing it was not an option, because
`get_skill` resolves against the local database and the agent would have
received dangling ids. So `load_starter_library` was added, registered only in
the `empty` and `onboarding` states, taking those to four and five tools against
the bound of five. It is not a global tool; seven always-on is a published bound
asserted in four tests.

Re-tested live: the aperture grew 11 → 12, and the call returned
`skillsBefore: 0`, `skillsAvailable: 8`, `sample: true`.

## Defect 2 — a strict miss ended the conversation

With eight skills installed, `recommend_skills` **still** returned empty for
"write a landing page that converts". The host reported it exactly:

> "No tool call failed; Cherry recorded all three as ok. However,
> recommend_skills returned empty despite load_starter_library reporting eight
> available skills, an apparent state or matching inconsistency."

The ranker drops entries with no lexical overlap, deliberately, and a test pins
that: "bake a sourdough loaf" must not surface a thumbnail skill. That is right.
The bug was one layer up. Relevance is the ranker's job; staying useful on a miss
is the tool's job. `recommendations` still comes back empty on a miss, so a miss
is never dressed as a hit, and the payload now carries `librarySize` and
`availableSkills`: the closest entries, unranked, explicitly not claimed to fit,
with ids `get_skill` resolves.

## The journey, after both fixes

Re-tested live in the same host:

```
recommendationCount 0 · librarySize 8
note: "Nothing matched this task, so recommendations is empty on purpose.
       The library does hold 8 skill(s); the closest are listed under
       availableSkills, unranked and not claimed to fit."
availableSkills: Thumbnail design review · YouTube publishing checklist ·
                 YouTube SEO research and packaging
```

The host picked the first id and called `get_skill`:

| Field | Value |
| --- | --- |
| File | `thumbnail-design-review-SKILL.md`, format `skill-md` |
| Revision | 2 |
| Full-file SHA-256 | `f33d299...da26` (delivered as part 1 of 6) |
| Citation | TubeBuddy, "11 Thumbnail Design Hacks Top Creators Use on YouTube", with URL |
| Label | `sample: true`, `approvalKind: synthetic-sample-state` |
| Notice | "Labelled sample state. This file uses a synthetic approval to demonstrate Cherry's boundary; it is not proof of a live human decision. Review and approve your own revision before use." |

That is the inversion the entry claims, performed by a real host: an agent
arrived with nothing and left with an install-ready, source-cited, hash-verified
method it could not have written itself, and the file says out loud that its
approval is sample state rather than this person's decision.

Both defects were found by pointing a real agent at the product and watching it
fail, not by reading the code.
