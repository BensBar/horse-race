# Golden Cup Classic 🏇

A premium, broadcast-quality horse racing game built with pure HTML, CSS, and JavaScript. Designed to feel like a TV sports broadcast on a 4K television while working beautifully on mobile devices including iPhone Safari.

## How to Play

1. Open `index.html` in any modern browser (or visit the GitHub Pages deployment)
2. Review the race card — 8 horses with names, jockey colors, and odds
3. Press **START RACE**
4. Watch the 3-2-1-GO countdown
5. Enjoy the race — horses move with realistic pacing, lead changes, and dramatic finishes
6. See the full finishing order with times
7. Press **RACE AGAIN** for another race

## Features

- **Broadcast-style presentation** — Live banner, timer, current leader, live standings sidebar
- **8 unique horses** — Each with distinct stats: speed, stamina, acceleration, burst chance, recovery, consistency, and running style (front-runner, closer, mid-pack)
- **Realistic race simulation** — Delta-time physics, stamina drain, speed bursts, running style curves, natural lead changes
- **Cinematic sequences** — Animated countdown, dramatic finish, winner celebration
- **Sound effects** — Web Audio API synthesized bell, hoofbeats, crowd ambience, victory fanfare
- **Responsive design** — Scales from iPhone SE to 4K TVs with clamp()-based sizing
- **Fullscreen mode** — Dedicated button for TV display
- **Mute toggle** — Easy audio control
- **Touch-friendly** — Large buttons, no hover-only interactions
- **No dependencies** — Pure HTML, CSS, and JavaScript; runs as a static site

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Page layout and structure |
| `styles.css` | Visual design, animations, responsive layout |
| `game.js` | Race engine, UI updates, sound system, controls |

## Technical Notes

- Race simulation uses `requestAnimationFrame` with delta-time for smooth, frame-rate-independent animation
- Positions are percentage-based (0–100%) and converted to visual CSS transforms
- Sound is fully synthesized via Web Audio API oscillators — no external audio files needed
- CSS custom properties power the theming and responsive scaling
- State machine manages game flow: IDLE → PRE_RACE → COUNTDOWN → RACING → FINISHING → RESULTS

## Next Upgrades

- **Betting mode** — Place virtual bets before each race with a bankroll system
- **Announcer commentary** — Text-based play-by-play during the race ("Thunder Strike takes the lead!")
- **Weather conditions** — Rain, mud, wind affecting horse performance differently
- **Jockey stats** — Individual jockey skill ratings that modify horse performance
- **Tournament mode** — Series of races with cumulative scoring
- **Season mode** — Multiple race days with horse progression and injuries
- **Photo finish logic** — Close-up animation for extremely tight finishes
- **Multiplayer party mode** — Each player picks a horse, shared screen viewing
- **Persistent stats** — localStorage-based race history and win/loss tracking
- **Better horse art** — SVG or sprite-based horse animations with leg movement
- **Oval track view** — True overhead or 3D perspective track with cornering
- **Custom horses** — Name and color your own horse entries
- **Race replays** — Rewatch the last race with slow-motion finish