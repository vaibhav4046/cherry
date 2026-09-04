# WebMCP human attestation: what actually reaches the page

**Researched:** 2026-09-04 · All sources fetched that day · **Scope:** whether any browser or host
mechanism gives a web page verifiable proof that a human, rather than a model, approved an action.

## 1. Verdict

No. Nothing in the WebMCP specification, the Model Context Protocol specification, or any shipped
host surface delivers a page a trustworthy attestation that a human confirmed an action. WebMCP's
tool callback receives only the tool input and an `AbortSignal`; it learns nothing about who or what
invoked it. The only confirmation-shaped thing in the WebMCP spec is `consequentialHint`, which is a
boolean the *page* declares to the *agent*, and nothing flows back. MCP elicitation returns
`{action: "accept"}` with no proof of origin, and the MCP spec itself says client-supplied user
identity can be forged. Chrome's `chrome.debugger` extension API exposes the CDP `Input` domain,
which means input events the page sees can be produced without a human touching anything. Cherry
must therefore keep treating its own UI, driven by a person in a real browsing session, as the only
approval boundary, and must keep the browser handoff (a deep link into Cherry's approval screen)
rather than accepting any host-mediated "the user confirmed" claim.

## 2. What we checked

### WebMCP specification draft

`https://webmachinelearning.github.io/webmcp/` (fetched 2026-09-04)

Draft Community Group Report, dated 3 September 2026, editors from Microsoft and Google.
Full-text search of the rendered spec returns **zero occurrences** of: `user activation`,
`transient activation`, `attestation`, `isTrusted`, `elicit`, `requestUserInteraction`, `provenance`,
and `navigator.modelContext`. The API is `document.modelContext`.

The tool execution callback is defined as:

```
callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options);
dictionary ToolExecuteCallbackOptions { required AbortSignal signal; };
```

The spec's own prose for that dictionary describes `signal` as "An AbortSignal that communicates when
the execution of the tool has been cancelled." That is the entire contract. There is no caller
identity, no confirmation record, no token.

The one confirmation-adjacent feature is `consequentialHint` in section 6.4.4, described as a signal
so clients can "selectively enforce mandatory user confirmation prompts before executing high-stakes
tools". Direction matters: the page tells the agent a tool is dangerous. The agent is under no
verifiable obligation, and the page is told nothing about what the agent did with the hint. The spec
frames its own section 6.4 items as mitigations, and states elsewhere that there is "no guarantee
that a WebMCP tool's declared intent matches its actual behavior", which is the mirror image of the
same trust gap.

### WebMCP explainer / README

`https://raw.githubusercontent.com/webmachinelearning/webmcp/main/README.md` (fetched 2026-09-04)

Design goal line 87 states the aim to "Enable human-in-the-loop workflows". The Open Questions
section, line 480, is decisive on status:

> "Exploring a way for a tool to prompt the user for confirmation when tools require explicit user
> authorization."

It points at issues #165 and #50 and a hypothetical `ModelContextClient` interface. So page-initiated
user confirmation is **proposed and unresolved**, not specified and not shipped. Note that
`docs/explainer.md` and `docs/proposal.md` do not exist on `main` (both returned HTTP 404); the
GitHub contents API shows `docs/` currently holds only `service-workers.md`. The README is the
explainer.

### Chrome DevTools Protocol, WebMCP domain

`https://chromedevtools.github.io/devtools-protocol/tot/WebMCP/` (fetched 2026-09-04)

An experimental `WebMCP` CDP domain exists with `invokeTool`, `cancelInvocation`, `enable`,
`disable`, and events `toolInvoked` / `toolResponded`. `invokeTool` takes a frame id, tool name, and
input object. Nothing in the parameter list carries a user-confirmation field. This confirms the
agent path bypasses the page's UI entirely: a tool call is not a click.

### Chrome agent security guidance

`https://developer.chrome.com/docs/agents/security` (fetched 2026-09-04)

Guidance is addressed to agent authors, not page authors. It says "A responsible agent should keep
the human-in-the-loop and implement requests for confirmation as needed." That is a should for the
agent. The page has no way to check compliance. The document does not describe any signal delivered
to the page, and its threat model runs the other direction: it tells agents to defend themselves
against untrusted page content.

### MCP specification, elicitation (current revision 2026-07-28)

`https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation` (fetched 2026-09-04)

Also checked the 2025-06-18 revision at
`https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation` (fetched 2026-09-04).

The response the server receives is `{"action": "accept" | "decline" | "cancel", "content": {...}}`.
There is no signature, no nonce, no client attestation, no channel binding to a human act. The
Security Considerations section requires servers to bind elicitation requests to client and user
identity, and says clients **SHOULD** implement user approval controls. Everything protective is a
client-side SHOULD.

The load-bearing sentence for Cherry is in the "Identifying the User" subsection:

> "Servers MUST NOT rely on client-provided user identification without server verification"

with the stated reason that it "can be forged". If the identity of the responder cannot be trusted,
the fact that a response arrived cannot be trusted as evidence a human produced it either. The three
response actions are documented in terms of what the user did ("User explicitly approved and
submitted with data"), but that is a description of intent, not a verifiable claim.

URL mode elicitation, new in 2025-11-25, is the closest thing to a real escape hatch, and it works by
*leaving* the client: the server sends a URL, the client gets consent to open it, and the actual
interaction happens out of band in the browser where the server can identify the user by session
cookie. The spec is explicit that the client "is not directly informed of the outcome". That is
architecturally the same shape as Cherry's deep-link handoff, and it is instructive that the MCP spec
reaches for it precisely when the in-band answer is not trustworthy enough.

Note also: WebMCP does not implement elicitation at all. Zero occurrences in the spec draft. So this
mechanism is not even available to a WebMCP page today.

### MCP specification, top-level security principles

`https://modelcontextprotocol.io/specification/latest` (fetched 2026-09-04, resolves to 2026-07-28)

States plainly:

> "While MCP itself cannot enforce these security principles at the protocol level"

followed by a list of SHOULDs for implementors. Consent in MCP is a host responsibility and an
honour system, by the spec's own admission.

### OpenAI Apps SDK security and privacy

`https://developers.openai.com/apps-sdk/guides/security-privacy` (fetched 2026-09-04)

Instructs developers to "Use the host's confirmation prompts for destructive actions" and to require
"human confirmation for irreversible operations". Both are instructions to lean on the host's UI. The
page documents no signed token, no attestation, and no proof-of-approval payload delivered to the MCP
server or app. Confirmation is a host behaviour, not a server-verifiable fact. We found no OpenAI
documentation describing a verifiable approval artifact; if one exists it is not in the security and
privacy guide.

### Chrome extension debugger API

`https://developer.chrome.com/docs/extensions/reference/api/debugger` (fetched 2026-09-04)

Lists the CDP domains an extension may attach to. `Input` is in the available list, alongside DOM,
Network, Runtime and others. An extension holding the `debugger` permission can therefore dispatch
input at the browser level rather than through `dispatchEvent`.

### HTML Standard, user activation

`https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation` (fetched 2026-09-04)

See section 3 below for the quoted definitions.

### MDN, `Event.isTrusted` and `navigator.userActivation`

`https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted` (fetched 2026-09-04)

`https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userActivation` (fetched 2026-09-04)

See section 3.

### What we could not confirm

We did not find a normative, primary statement that events injected via CDP `Input.dispatchMouseEvent`
carry `isTrusted = true`. The CDP reference page contains zero occurrences of the word "trusted". The
claim circulates widely in Chromium mailing-list threads and automation-tool documentation, but we are
not citing it as spec fact. It does not change the conclusion: as shown below, `isTrusted` is defined
against the *user agent*, not against a human, so a browser-integrated agent is inside the trust
boundary by construction whether or not CDP is involved.

## 3. What the browser actually gives us

Two signals exist, and both are weaker than they look.

### Transient and sticky user activation

HTML Standard, section 6.4:

> "An activation triggering input event is any event whose isTrusted attribute is true"

restricted to `keydown` (excluding Esc and reserved shortcuts), `mousedown`, `pointerdown` with
pointerType `mouse`, `pointerup` with a non-mouse pointerType, and `touchend`. When one fires, the
user agent sets `last activation timestamp` on the window and its same-origin ancestors and
descendants.

The page reads this through:

```
interface UserActivation {
  readonly attribute boolean hasBeenActive;  // sticky
  readonly attribute boolean isActive;       // transient
};
```

`isActive` is true only within the transient activation duration, which the spec says "is expected be
at most a few seconds". `hasBeenActive` is true for the life of that Document after the first
interaction.

What this proves: some qualifying input event with `isTrusted = true` was delivered to this window
recently, or at some point. That is all.

What it does not prove:

- **Not which element.** Activation is a per-window flag, not a per-control receipt. A click anywhere
  on the page, including a scrollbar drag start or an unrelated button, sets it. Reading
  `navigator.userActivation.isActive` inside an approval handler tells you the window was poked in
  the last few seconds, not that anyone pressed the approval control.
- **Not what the person believed they were approving.** No payload, no target, no binding to the
  revision, mission, or artifact under review.
- **Not a human.** See below.

### `Event.isTrusted`

MDN's definition is the important one, and it does not say what people assume it says:

> "true when the event was generated by the user agent (including via user actions and programmatic
> methods such as HTMLElement.focus())"

and false when dispatched via `EventTarget.dispatchEvent()`. `HTMLElement.click()` also yields false.

`isTrusted` therefore means *the user agent produced this event*. It does not mean *a human produced
this event*. Everything that is the user agent, or that the user agent has admitted into its input
pipeline, sits on the trusted side of that line.

### What can still be forged, precisely

| Actor | Can it produce `isTrusted = true` / user activation? | Can the page tell? |
|---|---|---|
| Human clicking Cherry's approve button | Yes | No, only that *something* trusted happened |
| Page script calling `el.click()` or `dispatchEvent` | No, `isTrusted` is false | Yes, this one is detectable |
| Extension content script using `dispatchEvent` | No, the isolated world still goes through `dispatchEvent` | Yes |
| Extension with the `debugger` permission driving the CDP `Input` domain | The `Input` domain is available to it per Chrome's own docs; events enter below the DOM layer | No |
| Automation harness (CDP, WebDriver-backed drivers) | Same path as above | No |
| The WebMCP host / browser agent itself | It does not need to. `WebMCP.invokeTool` calls `execute()` directly, skipping the UI entirely | No |

The last row is the one that matters most for Cherry. A WebMCP tool call never touches the DOM. The
spec notes that the browser's agent "uses a different internal mechanism" to retrieve tools, distinct
from the in-page `getTools()` path. So a tool handler that consults `navigator.userActivation` is not
checking whether a human approved; it is checking whether the page happened to have been clicked
recently, which an agent-driven session can trivially satisfy and which an honest human workflow can
trivially fail (approval screen open for more than a few seconds, keyboard-only navigation edge
cases, and so on).

Conclusion for section 3: user activation and `isTrusted` are useful as a cheap anti-accident and
anti-naive-script guard. They are not authentication, they carry no payload, and they are not
evidence of human intent. They must never be the thing standing between an agent and an approval.

## 4. Cherry's resulting design rule

**Rule.** Because no trusted human-confirmation attestation reaches the page, Cherry accepts exactly
one human-approval boundary: a decision taken in Cherry's own UI, in a real browsing session, by a
person operating that session. No WebMCP tool, no MCP elicitation response, no host confirmation
dialog, and no user-activation check may substitute for it or unlock it.

Concretely, this keeps the existing contract intact and explains why it is drawn where it is:

1. **Agents request, humans grant.** Approvals, evidence trust promotion, and memory activation stay
   human-only code paths. `transitionWorkItem` continues to refuse `SUCCEEDED` for agent actors
   (D-016). A tool that approves must not exist, not even behind a flag.
2. **The handoff stays.** When an agent reaches a decision point, the correct response is
   `request_human_action` / `request_skill_approval` plus a deep link into Cherry's approval screen,
   so the person lands on the exact revision under review. This is the same architecture MCP's own
   URL mode elicitation adopts when it needs an interaction the client must not be able to fake.
   Do not replace it with an in-band confirmation exchange.
3. **Approvals bind to the exact revision.** Already true, and it is load-bearing here: since we
   cannot verify *who* approved through any protocol channel, the value of an approval comes entirely
   from what it is bound to and from the ProofEvent ledger recording it. Any edit invalidating the
   approval must stay non-negotiable.
4. **Do not add activation checks as a security control.** If `navigator.userActivation` is used
   anywhere, it must be labelled as UX hygiene, never as proof, and never as the sole gate. A comment
   saying so is cheaper than someone later mistaking it for authentication.
5. **`consequentialHint` is advertising, not enforcement.** Setting it on Cherry's consequential
   tools is correct and worth doing, because it helps well-behaved agents. It must not change what
   Cherry itself permits.

**If an attestation ever ships.** Should WebMCP resolve issue #165 or #50 with a real mechanism, or
should a host publish a signed approval artifact, Cherry must not trust it on sight. Before it could
replace or supplement the manual boundary, all of the following would need to hold, and each would
need to be verified against the shipped normative text, not a blog post or a release note:

- The artifact is **cryptographically signed** by a key the page can verify against a published,
  rotatable key set, over a channel the calling agent cannot mint tokens on.
- The signature covers **the specific action**: tool name, the full input arguments, the target
  revision or entity id, the origin, and a timestamp with a short validity window.
- It is **replay-resistant**: single-use nonce, or binding to a Cherry-issued challenge that Cherry
  generated for this exact approval.
- It is **channel-bound to the page's origin**, so an attestation obtained for one site cannot be
  presented to Cherry.
- The normative text states plainly **what the browser guarantees about the human act**, for example
  that the confirmation UI was rendered by the user agent outside page and agent control, that its
  contents matched the signed payload, and that automation and extension paths cannot produce it.
  Absent that last clause, the attestation only proves the host said so.
- There is a **conformance test** (the WebMCP spec already points at a WPT suite at
  `https://wpt.fyi/results/webmcp`) demonstrating the guarantee, and at least one shipped engine
  passing it.

Until every one of those holds, the answer stays: a person, in Cherry, on the screen showing what
they are approving.

## 5. Review date

Re-check by **2026-12-04**, and immediately if any of the following happens: WebMCP issue #165 or #50
closes, the `ModelContextClient` interface lands in the spec, a `requestUserInteraction`-style API
appears in the draft, the WebMCP spec ships a mitigation that flows a signal from agent to page, the
CDP `WebMCP` domain loses its Experimental marker, or a host publishes a confirmation attestation
format.

This surface is moving fast. The spec draft consulted here is dated 3 September 2026, one day before
this research, and the current MCP revision (2026-07-28) already changed elicitation substantially
from 2025-06-18 by adding URL mode. Anything in this document older than a quarter should be treated
as unverified.
