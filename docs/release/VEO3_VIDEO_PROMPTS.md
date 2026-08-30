# Veo 3 prompt pack — Cherry Wine site clips

Every clip is **illustration, not proof**: no readable UI, no fake dashboards, no on-screen text
(the site renders real DOM for all operational state). Generate at 1080p, 24 fps unless noted.
Shared look, paste at the top of every prompt:

> STYLE BLOCK: cinematic product film, near-black wine-dark background (#150609 into deep
> maroon #2b0812), glossy photoreal 3D cherry in saturated crimson and pink (#e02350, #ff7d9d),
> soft cream highlights (#ffdfe9), wet specular reflections, fine floating droplets, gentle pink
> rim-light glow, shallow depth of field, premium and playful, no text, no logos, no watermarks,
> no user interfaces, no screens, no hands, no people.

---

## 1. HERO LOOP — "The cherry awakens" (landing hero background)
Placement: hero section background, behind the tagline. 8s, 16:9, must loop seamlessly.

> STYLE BLOCK. A single glossy dark-red cherry with a green stem floats in a black-maroon void,
> slowly rotating. Pink light pulses softly from within, like a heartbeat. Micro-droplets orbit
> it. In the final second the internal glow brightens just before the loop restarts. Slow 10-degree
> orbital camera drift, macro lens, seamless loop.

## 2. THE SPLIT — "Robot core reveal" (hero interaction moment / video opener)
Placement: demo-video opener; optional hero hover state. 6s, 16:9.

> STYLE BLOCK. The glossy cherry trembles, then splits cleanly into two juicy halves with a burst
> of fine pink mist and suspended droplets. Inside, a small round obsidian-black orb with two soft
> glowing white oval eyes wakes up, blinking once, radiating a warm pink aura. The halves hover
> beside it like open doors. Slow-motion at the split, then settle. Centered macro shot, slight
> push-in.

## 3. CREW CONSTELLATION — "One becomes five" (Crew page divider / video beat)
Placement: crew section illustration. 8s, 16:9.

> STYLE BLOCK. The glowing robot-core orb pulses, and five smaller orbs bud off it like drops of
> mercury, each catching a different subtle tint — rose, amber, mint, lavender, sky — while staying
> in the same crimson world. They arrange into a slow-orbiting constellation around the cherry
> halves, connected by faint threads of pink light. Wide macro shot, gentle parallax.

## 4. THE HANDOFF — "Work travels as light" (Inbox / delegation beat)
Placement: inbox section illustration. 6s, 16:9.

> STYLE BLOCK. A bead of glowing pink liquid detaches from the largest orb and travels along a thin
> luminous thread to a smaller orb, which brightens as it absorbs it and starts to spin faster.
> Droplets scatter at the moment of arrival. The camera tracks the bead in shallow focus, macro.

## 5. THE SEAL — "Proof is stamped" (Proof / receipt beat)
Placement: proof section illustration; video climax. 5s, 16:9.

> STYLE BLOCK. A translucent disc of rippling cherry-juice glass descends over a small cluster of
> droplets, pressing them into a perfect crystalline wafer that flashes once with cream-white
> light, then cools into a faceted ruby coin spinning slowly. Dramatic but soft, macro, slight
> overhead angle.

## 6. THE FAILURE OPENS — "Honest repair" (verification beat)
Placement: demo-video beat for the honest-failure moment. 5s, 16:9.

> STYLE BLOCK. The spinning ruby coin develops a visible hairline crack with a quiet glass *tink*;
> it splits open gently, revealing a dull grey droplet inside. The robot-core orb leans in, its
> white eyes narrowing with focus; a fresh crimson droplet replaces the grey one and the coin
> re-seals brighter than before. Macro, intimate lighting.

## 7. SKILLS THAT TRAVEL — "The suitcase" (Carry beat)
Placement: carry/export section illustration. 6s, 16:9.

> STYLE BLOCK. The ruby coin shrinks and drops into a tiny glossy cherry-red travel case with cream
> piping, which snaps shut with a satisfying click and glides away along a ribbon of pink light
> into the darkness, leaving a trail of droplets. Side-tracking macro shot.

## 8. ROUTINE CLOCKWORK — "It runs on schedule" (Routines beat)
Placement: routines section illustration. 8s, 16:9, loopable.

> STYLE BLOCK. Around the closed travel case, faint concentric rings of pink light tick like a
> minimalist clock face made of droplets; every full revolution, the case pulses and emits one
> bead of light that floats upward. Hypnotic, calm, seamless loop, overhead macro.

## 9. VERTICAL TEASER — mobile/social (optional)
Placement: social teaser. 8s, 9:16.

> STYLE BLOCK. Vertical composition: the cherry splits (as in clip 2) in the upper third, the five
> tinted orbs cascade downward like slow rain in the middle third, and the ruby coin seals with a
> flash at the bottom third. One continuous tilt-down camera move.

---

## Integration notes (for when you hand the clips back)
- Files land in `public/clips/` as H.264 MP4 (or WebM/VP9), ≤ 4 MB each after compression
  (`ffmpeg -crf 30` is usually enough); hero loop also as a poster JPEG for reduced-motion users.
- They will be wired as `muted loop playsinline` background/inline video, lazy-loaded,
  `prefers-reduced-motion` swaps to the poster frame — nothing blocks interaction.
- Labelled "illustration" in the release evidence; no clip is presented as product proof.
