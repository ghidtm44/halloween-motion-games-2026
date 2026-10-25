# Simple Playground

The current offline playground has three original worlds with identical continuous motion play: **Escape from Monkey Island**, **Escape from Shark Depths**, and **Alien Attack**. Reach into glowing collectibles, gently duck under passing obstacles, or side-step falling ones for brief celebrations. There are no rounds, scores, game-over screens, or player text. The road keeps moving when nobody is present; one large challenge appears roughly every 8–10 seconds. Either hand can collect, even when hips are cropped out. A small rise from a knee bend can clear low hurdles.

See [the Motion Games guide](../../docs/MOTION-GAMES.md) for setup, controls, interaction rules, and rehearsal limits. The separate **Simple Playground Motion Games.app** uses port 4328 and its own settings. The installed Spooky Host and Corn Maze applications remain separate.

For development, use Node 22 or newer:

```sh
npm ci
npm run assets
npm run build
PLAYGROUND_EDITION=motion PORT=4328 npm start
npm test
node tests/motion-browser.mjs
```

Dependencies and verified vision assets require internet during installation. The Motion Games edition runs entirely locally afterward, with no API key or online service. Camera startup is always explicit. It processes up to three poses and a combined foreground mask; real costumes, occlusion, and TV alignment still need an in-person rehearsal.

Browser tests launch isolated Chrome with synthetic camera/tracking fixtures, temporary state, and blocked external requests. They never require a real webcam. Test results from prior revisions are historical; current evidence is reported with each local build.

Third-party notices are in THIRD-PARTY-NOTICES.md. Pinned model provenance and hashes are under public/models/. Original Halloween scenes remain recoverable through Git history but are no longer selectable in the current playground. Saved selections migrate to the jungle world while preserving other settings.

## Spooky Host on the TV

For the current Halloween crystal-ball performance, see [the host guide](../../docs/SPOOKY-HOST-BRIEF.md). Select Spooky Host, open the player on the TV, and click the ball once for voice/fullscreen. Start camera and press **Start watching** in the control room. Auto reacts to visible guests and scene changes; the performance-tone slider moves from kid-friendly wonder to cheeky after-dark banter. The oracle makes short, snarky costume/action-specific roasts and playful challenges. It observes up to three recent frames per turn (about 1.2 seconds), with a three-second request minimum and five-second follow-ups. The separate **NSFW · adults-only comedy** switch requires an active session and operator confirmation, permits stronger language/non-graphic innuendo, and resets off on Stop/Quiet/new sessions. Mixed or uncertain audiences stay clean; no sexual remarks about guests. **Voice magic** adds adjustable local reverb/echo to AI speech; use **Dry voice** to bypass. Scripted rehearsal retains its installed local voice without effects. The rescue panel can welcome a group, invite a visual challenge, give one farewell, or go quiet until explicit Resume. All captions and controls stay on the Mac. Camera and AI always start off.
