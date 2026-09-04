# Preloaded skill catalog — what it is, and what it is not

**Status: shipped and live.** Verified on `https://cherry-wine.vercel.app` on 2026-09-04.

## The defect this closes

Live-host product testing (see `WEBMCP_LIVE_HOST_CAPTURE.md`) found `recommend_skills` — the tool
the whole entry rests on — returning empty twice, for two different reasons:

1. A fresh browser has an empty cross-workspace library, so first contact was a dead end.
2. Even with eight sample skills installed, a task with no lexical overlap correctly returned
   nothing, because `rankSkillsForTask` drops zero-score entries on purpose.

Shipping eight labelled samples fixed (1) narrowly. It did not fix the real problem: a brand-new
browser had almost nothing worth recommending.

## What shipped

**1058 third-party Agent Skills**, preloaded as static assets, from eight permissively-licensed
repositories:

| Collection | Skills | Upstream | License | Publisher |
|---|---:|---|---|---|
| `cybersecurity` | 753 | mukul975/Anthropic-Cybersecurity-Skills | Apache-2.0 | community |
| `workflows` | 180 | wshobson/agents | MIT | community |
| `trailofbits` | 80 | trailofbits/skills | CC-BY-SA-4.0 | Trail of Bits |
| `anthropic-official` | 27 | anthropics/claude-plugins-official | Apache-2.0 | Anthropic |
| `ponytail` | 6 | DietrichGebert/ponytail | MIT | community |
| `caveman` | 6 | JuliusBrussee/caveman | MIT | community |
| `obsidian` | 5 | kepano/obsidian-skills | MIT | community |
| `impeccable` | 1 | pbakaus/impeccable | Apache-2.0 | community |

> The `cybersecurity` repository is *named* `Anthropic-Cybersecurity-Skills` but is published by the
> community account `mukul975`, **not** by Anthropic. It is labelled with its real publisher
> everywhere it appears so the name cannot imply an endorsement that does not exist.

Collections without a redistributable LICENSE file were **excluded**, not shipped: `ecc` (198
skills) and any marketplace lacking a license. Attribution obligations are recorded in
`public/catalog/NOTICE.md`.

## What a catalog entry is NOT

This is the part that matters for judging.

- It is **not** a skill Cherry authored, derived, or discovered.
- It is **not** installed, **not** approved, and **not** in the library.
- `get_skill` **cannot resolve a catalog id.** Handing an agent ids that do not resolve was the
  specific failure mode rejected during design.

A catalog entry is reference material with provenance: upstream repo, license, publisher, path, and
a SHA-256 of the exact bytes shipped.

## How it becomes a real skill

`install_catalog_skill` deliberately runs the **ordinary** pipeline, not a shortcut:

```
upstream SKILL.md → lesson → transcript (source: user_upload) → deterministic derivation
                  → DRAFT SkillGraph with evidence citing the upstream file
```

Writing a SkillGraph straight into IndexedDB would have been three lines shorter and would have
fabricated a graph nobody derived, with no evidence trail. The install prepends the attribution to
the imported text itself, so the licence travels with the content through export.

The result is a **draft**. Nobody has approved it.

## The aperture did not grow

Cherry's claim is a small, state-aware tool surface. Adding a catalog could easily have broken it.

- `GLOBAL_TOOLS` is still **exactly 7** (asserted in `tests/cherry/skill-catalog.test.ts` and three
  pre-existing places).
- Every state stays within the **5 contextual tool** bound.
- Discovery costs **zero** new tools: `recommend_skills` is already global, and searches the catalog
  only when the installed library misses.
- `install_catalog_skill` takes the one free slot in `empty`, and creates its own workspace — which
  is what lets a cold start work in a single call.

Measured live: **12 registered tools** (7 global + 5 contextual). Unchanged from before.

## Verification performed

All values below were returned by real calls, not reconstructed.

**Catalog served on production**

```
$ curl -sI https://cherry-wine.vercel.app/catalog/manifest.json | grep -i content-type
Content-Type: application/json; charset=utf-8
LIVE totalSkills: 1058 collections: 8
```

A 200 is not proof here — Cherry's SPA rewrite answers 200 for any path. The check is
`Content-Type: application/json`, and the parsed body.

**Cold start on production**, stand-in host, `librarySize: 0`:

```json
recommend_skills { task: "harden a kubernetes cluster against privilege escalation" }
→ { librarySize: 0, recommendationCount: 0,
    catalogSkills: [
      { catalogId: "cybersecurity/detecting-privilege-escalation-in-kubernetes-pods", score: 18 },
      { catalogId: "cybersecurity/detecting-aws-iam-privilege-escalation",            score: 12 } ] }
```

`recommendations` stays empty on a miss — a catalog hit is never dressed up as an installed match.

**Install and read back** (local dev, same build):

```json
install_catalog_skill { catalogId: "cybersecurity/analyzing-email-headers-for-phishing-investigation" }
→ { skillId: "sg-01M1NE76WT3DS1T0D68GS749JS", status: "draft", approved: false,
    workspaceCreated: true, evidenceCount: 1,
    source: { repo: "mukul975/Anthropic-Cybersecurity-Skills", license: "Apache-2.0",
              path: "analyzing-email-headers-for-phishing-investigation/SKILL.md",
              sha256: "b2164607a56224c0" } }

get_skill { skillId, format: "summary" }  → { status: "draft", revision: 2, sample: false }
get_skill { skillId, format: "skill-md" } → isError: true
  {"error":"approval_required",
   "message":"Exports require a human approval at the exact current revision",
   "details":{"status":"draft","revision":2,"approvedRevision":null}}
```

**The authority boundary holds on the new path.** An agent can search the catalog, install from it,
and read a summary. It cannot export the file, because no human has approved that revision — and
there is no tool that would let it try.

**Index and shard fetch, in a real browser:**

```json
{ indexSize: 1058,
  hits: [{ id: "cybersecurity/analyzing-email-headers-for-phishing-investigation",
           score: 17, on: ["description:analyze", "name:phishing"] }],
  fetchedChars: 11769, repo: "mukul975/Anthropic-Cybersecurity-Skills", license: "Apache-2.0" }
```

**Tests:** 774 unit tests pass, including 9 new catalog tests that assert the aperture bound, the
license allowlist, graceful degradation when the assets are unreachable, and that a no-overlap query
returns nothing rather than a confident guess.

## Cost

- `index.json` 424 KB (**105 KB gzipped**), fetched once, only when a search actually happens.
- 24 hash-sharded content files, ~444 KB each; exactly one is fetched per skill opened.
- Nothing is fetched at boot. A browser that cannot reach the catalog degrades to the previous
  behaviour rather than failing.

## Hostile pass, and what it found

An independent adversarial pass drove the live tool surface with 17 malformed calls plus the full
journey. It found **three defects, two of them in this feature**, both of the same class — a tool
describing itself inaccurately, which an agent then acts on:

1. `install_catalog_skill`'s not-found error said *"Use search_skill_catalog first."* **That tool
   does not exist** — it was renamed during design when search folded into `recommend_skills`. Fixed,
   and a test now walks every "call X" string in these modules and fails if X is not a real
   definition, so this cannot recur.
2. `recommend_skills` counted catalog matches **before** `appendIfBounded` trimmed them to the byte
   budget, announcing three entries while returning two. The note is now written from the array that
   actually shipped.
3. The same note named `install_catalog_skill` unconditionally, though it is only offered in `empty`.
   It now checks the active tool names and only names a call the caller can actually make.

What the pass could **not** break, and confirmed: 17 malformed calls returned structured errors with
zero throws, zero hangs and zero stack traces; path traversal was treated as an opaque id; no tool
matching `/approv|grant|trust|promote/` exists in any state; **no call sequence flips a skill to
approved**; every response stayed within the 1500-character bound.

## Derivation quality, measured

Derivation is built for speech, and markdown defeated it three separate ways: syntax hid the sentence
(`- Parse the headers` opens on `-`, not a verb), blocks joined with single newlines arrived as **one
segment** because `parsePlainText` splits on blank lines, and YAML front matter was read as prose.
Before the fix, **every** install produced the single "Review the lesson material" fallback node.

Measured after the fix, installing a deterministic sample spread across all eight collections:

| | |
|---|---:|
| Attempted | 36 |
| Installed successfully | **36** |
| Failures | **0** |
| Derived a real multi-step workflow | **29 (81%)** |
| Still a thin 1-step draft | 7 (19%) |

Step distribution: `10 steps → 13 skills`, `6 → 6`, `5 → 3`, `4 → 2`, `3 → 3`, `2 → 1`, `1 → 7`.

The remaining 19% are command-heavy documents whose real actions live inside fenced code blocks,
which are deliberately dropped rather than flattened into junk steps. That is a real limitation and
is **not** claimed to be solved.

One hard failure was fixed along the way: any document containing `-->` (an HTML comment) was sniffed
as SRT by the transcript parser, yielded zero cue blocks, and failed the install outright with
"No transcript segments could be parsed". `obsidian/obsidian-markdown` was one such file.

## Reproducing

```bash
node scripts/build-skill-catalog.mjs
```

Rebuilds from locally installed collections. Line endings are normalised to LF before hashing, so a
recorded SHA-256 describes the exact bytes shipped rather than the upstream platform-specific form.

*Build gotcha worth recording: JavaScript's regex `.` excludes `\r`, so every CRLF `SKILL.md` parsed
as having no front matter at all. The first build silently produced a 27-skill catalog instead of
1058, with no error.*
