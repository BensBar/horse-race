# Changelog

## [2.0.0] — Broadcast & Track Redesign

### What changed

#### Track & Race Stage
- Added `.race-stage` container that wraps `.track`, giving the racing surface an inset shadow frame that grounds it visually like a sunken arena.
- Replaced the basic crowd stripe with a layered `.track__grandstand` element: tiled radial-gradient dots suggest crowd heads; repeating horizontal lines suggest bleacher rows; a stadium atmosphere gradient and dual flood-light glows complete the backdrop.
- Rails (`.track__rail--top/bottom`) are thicker (7 px) with a shinier metallic gradient and a stronger drop shadow so they read clearly as physical boundaries.
- Track surface (`.track__surface`) sits inside the rails on a turf-green base; each dirt lane uses a two-layer background — a tonal gradient plus a tiled 1 px dot pattern — to mimic churned dirt texture.
- Odd and even lanes use slightly different dirt palettes and offset dot patterns for instant visual lane separation without the need for heavy dividers.
- Each lane adds a subtle top-edge highlight (`::before`) simulating overhead lighting.
- Finish line (`.finish-line`) extends 7 px beyond both rails and shows white CSS `::before`/`::after` pole extensions above and below the surface.

#### Horse Rendering
- Replaced the CSS-only blob (border-radius + pseudo-elements) with a proper SVG horse silhouette embedded inline in each `.horse__body`.
- SVG uses `fill="currentColor"` throughout; colour is supplied by the CSS `color: var(--horse-color)` on `.lane__horse`, so all 8 horses share identical markup and colour is still controlled by the existing per-horse CSS variable.
- Horse anatomy: tail, 4 legs (drawn before the body so the body naturally covers their tops), body, rump connector, neck, head, ear, mane accent, body sheen, saddle cloth, jockey cap, eye, nostril, hooves.
- Gallop animation now operates on two levels: the whole SVG bobs with `gallopBob`, and each leg rect independently swings with `legFF/FN/BF/BN` keyframes using `transform-box: fill-box` and `transform-origin: top center` for natural hinge rotation. Diagonal pairs (ff+bn, fn+bf) are phase-offset to mimic a 4-beat gallop.
- Speed-burst state shortens animation duration and adds an energy glow via `drop-shadow` filter.
- Winner state switches to a pulsing gold `drop-shadow` filter on the SVG instead of a box-shadow on a div.

#### Broadcast Bar
- Slightly stronger gradient background and gold bottom border.
- **Leader change flash**: `updateLeader()` now compares the current leader id against `previousLeaderId`; on a change it removes and re-adds `.leader-change` (forcing CSS animation restart via `offsetWidth` reflow), which scales and re-colours the name gold for 0.55 s.
- **Final-furlong state**: once average race progress exceeds 70% of the finish-line position, `final-furlong` is added to `#race-screen`. This shifts the timer to orange and adds a subtle flicker, raising tension. The class is removed when the race ends.

#### Results Screen
- Winner banner gains a `--winner-color` CSS variable (set inline by JS) that drives the top border colour, so each winner has their own colour accent.
- `showResults()` now populates `#winner-num` (`#N`) and `#winner-odds` (the fractional odds) alongside the name and time.
- A `launchConfetti()` function spawns 90 CSS-animated confetti pieces (circles and rectangles, mixed palette with the winner colour as a hero hue). The container is auto-removed after 5 s and before any subsequent `initRace` call.

#### Accessibility / Performance
- `@media (prefers-reduced-motion: reduce)` disables all CSS animations (gallop, confetti, pulsing, timer flicker, LIVE blink, start-button glow, winner glow).
- No external dependencies added. No canvas rewrite. No frameworks.
- All horse SVGs use `aria-hidden="true"` — lane badges and name labels already provide accessible text.

### What stayed the same
- All race physics and state-machine logic is untouched.
- Horse-position calculation and `--horse-x` CSS variable mechanism unchanged.
- Fullscreen, mute, countdown, standings update, replay flows unchanged.
- Responsive breakpoints preserved (mobile collapses standings to bottom bar, 4K scales base font).

### Recommended next upgrades
1. Replace the SVG horse with a per-horse sprite sheet for true breed/coat variety.
2. Add a starting-gate animation that lifts as `startRace()` fires.
3. Add a photo-finish slow-motion replay at the wire using Canvas.
4. Surface post-race odds movement (winner shortens, others drift) on the results screen.
