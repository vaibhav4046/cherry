# Skill catalog — third-party attribution

Everything under `public/catalog/` is **third-party Agent Skill content redistributed under its
own license**. Cherry did not author any of it and does not present it as an approved method.

A catalog entry is reference material. It is not a SkillGraph, it is not installed, and nobody has
approved it. It becomes a skill in a workspace only when someone calls `install_catalog_skill`,
which imports the upstream text as a lesson and runs Cherry's ordinary derivation over it — the
result is a **draft** that still requires a human approval, and its evidence cites the upstream
file by repo, path and SHA-256.

## Collections

| Collection | Upstream repository | License | Published by |
|---|---|---|---|
| `cybersecurity` | [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) | Apache-2.0 | community |
| `workflows` | [wshobson/agents](https://github.com/wshobson/agents) | MIT | community |
| `anthropic-official` | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Apache-2.0 | Anthropic |
| `trailofbits` | [trailofbits/skills](https://github.com/trailofbits/skills) | CC-BY-SA-4.0 | Trail of Bits |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Apache-2.0 | community |
| `ponytail` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | MIT | community |
| `caveman` | [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) | MIT | community |
| `obsidian` | [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) | MIT | community |

> The `cybersecurity` collection's repository is *named* `Anthropic-Cybersecurity-Skills` but is
> published by the community account `mukul975`, **not** by Anthropic. It is listed here with its
> real publisher so the name cannot imply an endorsement that does not exist.

## Obligations carried

- **Apache-2.0 / MIT** — the copyright notice and license travel with each entry. Every catalog
  record stores `repo`, `license`, `publisher`, `upstreamPath` and a SHA-256 of the exact text
  shipped, and `install_catalog_skill` prepends that attribution to the imported text itself so it
  survives export.
- **CC-BY-SA-4.0** (`trailofbits`) — redistributed verbatim with attribution. Cherry does not
  publish adaptations of this material.

## Reproducing this catalog

`node scripts/build-skill-catalog.mjs` rebuilds it from locally installed skill collections. Line
endings are normalised to LF before hashing, so a recorded SHA-256 describes the exact bytes this
catalog ships rather than the upstream file's platform-specific form.

Content excluded on purpose: collections without a redistributable LICENSE file.
