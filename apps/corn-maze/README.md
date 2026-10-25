# Moonlight Motion

A local Halloween motion playground for an Apple Silicon Mac, a webcam, and a TV. This folder includes the built application, a Mac ARM64 Node runtime, and all vision model/WASM assets. Google Chrome is already installed on this Mac and is the tested browser.

## New in 1.1: Corn Maze Quest

Choose **Corn Maze Quest** in the control room, then start your camera. Reach a hand into a glowing corn target and hold it there for about half a second. The corn attaches to that hand; carry it into any basket and hold briefly to deposit it. Work together to collect six ears across three clearings. Reach for left/right signs to choose a path, open optional mystery boxes on side trails, and find the glowing exit.

The ring around your hand shows grab/deposit progress. This uses wrist position from body tracking, not a pinching or closed-fist gesture. Two or three people can share the objective; overlapping bodies may still confuse tracking. Losing tracking releases a held cob without losing already deposited corn. No points advance on frozen camera frames.

For an immediate test without a webcam, turn on **Mouse practice**, move the pointer onto the player, hover over corn, then move it to a basket. No mouse button is required. Practice uses the same rules. Turn it off and Start camera to switch back to people. **Restart round** starts again from the entrance.

See **[CORN-GAME.md](CORN-GAME.md)** for game controls, rules, limitations, and the video inspiration. Travel through the corn rows is animated; running, jumping, and obstacle collisions are not measured in this version. The hands actually control pickups, deposits, boxes, and path selection.

**Updating from v1:** stop the old launcher's server with Control-C, launch this folder's **Start Playground.command**, and reload both admin and player windows. Old browser tabs keep old code until reloaded. A player reload starts a new round; an admin reload preserves the currently running player's round.

## Start playing

1. Keep this whole folder together. In Finder, double-click **Start Playground.command**.
2. The launcher opens the control room in Chrome at **http://127.0.0.1:4317**. Keep its Terminal window open while playing.
3. Click **Open player**. A separate player window appears. The animated ghosts are a clearly labeled scene demo.
4. Click **Start camera** in either window. Allow camera access in Chrome. If macOS asks, allow Google Chrome under **System Settings → Privacy & Security → Camera**.
5. Choose your webcam under **Video input**. Place the two windows side by side for the first test. The admin stage monitor shows a small, slightly delayed copy of the actual player.
6. Stand far enough back that everyone’s entire body fits. In the three free-play scenes, wave for magic, raise both hands for bats, or make a small hop for candy. In Corn Maze Quest, use the grab-and-carry controls described above. Use the control-room buttons or keys **1**, **2**, and **3** to trigger effects at any time.

The first camera start loads the local model; allow several seconds. A camera overlay remains visible during loading or if tracking fails. The display reports detected poses, not a guaranteed count of everyone present.

To finish, click **Stop camera**, close the player, then press **Control-C** in the launcher's Terminal window. Closing the active player releases its camera stream. No video or audio is recorded. Audio capture is disabled.

## Put the player on your HDMI TV

1. Connect the TV by HDMI or your USB-C/HDMI adapter.
2. In **System Settings → Displays**, use the TV as an **extended display**. Arrange its position relative to the Mac screen.
3. Open the player as a separate window. Drag it onto the TV before entering fullscreen.
4. Click the player's **Fullscreen** button or press **F**. Move the pointer away; controls fade after a few seconds. **Esc** exits fullscreen.
5. Leave the control room on the Mac. Select scenes, switch cameras, adjust appearance, or launch effects there. These actions do not exit the TV's fullscreen view.
6. If macOS hides the other screen when entering fullscreen, enable **Displays have separate Spaces** in the Mac's Desktop & Dock / Mission Control settings, or use a maximized player window for the initial test. macOS may require signing out after changing that setting.

Use the TV's Game/PC picture mode if available to reduce display delay. Avoid screen mirroring for the two-window setup. Set your Mac's display/sleep preferences for the event; the player requests a screen wake lock when supported, but this is not a substitute for checking sleep settings.

## Worlds and controls

- **Corn Maze Quest:** an interactive team game with branching corn paths, grab-and-carry collectibles, mystery boxes, and an escape celebration.
- **Pumpkin Hollow:** warm dusk, glowing pumpkins, a haunted house, drifting fog, bats, and stars.
- **Enchanted Grove:** a teal forest variation with mint moonlight.
- **Midnight Magic:** violet night skies and moonlit scenery.
- **Magic cutout:** places the combined detected human foreground into the scene.
- **Camera overlay:** includes the entire camera view, framed by the scene and effects. Use this if costumes or overlap make someone disappear.
- **Glowing silhouettes:** fills the combined foreground with a soft color gradient.
- **Movement effects:** toggles gesture-triggered effects in the three free-play scenes. Corn Maze Quest uses its own hand interactions and suppresses these automatic effects. Manual effects remain available in every scene.
- **Lighter load:** reduces inference frequency. The stage animation is independent of the vision worker.
- **Pause:** freezes scene time and the last composited camera image. The camera remains open until you click Stop camera. You can resize or move a paused player.

Shortcuts: **1** candy, **2** bats, **3** magic, **Space** pause/resume in the control room; **F** fullscreen in the player. Controls ignore these keys while editing a form field.

## People, costumes, and fallback behavior

The local MediaPipe Pose Landmarker is configured for **up to three poses**. Its segmentation outputs are merged into **one foreground mask**. This app does not promise separate, reliable person masks or identity tracking. Short-lived pose IDs use nearest torso matching and can swap when people cross.

The automated model test detected three copies of a reference person placed side by side and checked foreground pixels in each third of the image. That demonstrates the three-pose pipeline, not reliable detection of three real children in costumes. A tighter synthetic arrangement missed one subject during development. Occlusion, very small people in frame, long capes, unusual masks, dark or busy backgrounds, and fast motion can reduce accuracy.

When there is no recent usable cutout, the full camera overlay appears automatically. GPU errors or invalid GPU masks cause a clean CPU worker retry. If background workers cannot initialize, a slower main-thread CPU compatibility mode is attempted. If vision remains unavailable, camera overlay and manual effects still work. A single person's missed detection while others are tracked cannot be detected reliably; choose Camera overlay if needed.

Gesture effects use image-space wrist and hip movement with per-person cooldowns. Hops are a hip-rise heuristic, not a calibrated jump measurement. Camera shake, crouching, or crossing subjects can still trigger effects. Turn off Movement effects or lower sensitivity if necessary.

## Test before Halloween

1. **One screen:** start the demo, open the player, switch all four worlds, trigger all effects, pause/resume, and resize both windows. Try Corn Maze Quest with Mouse practice using the quick game check in CORN-GAME.md.
2. **Camera:** start, switch between the built-in and USB camera, stop, and start again. Unplug/reconnect the USB camera and confirm that the message and input selector let you recover.
3. **One person:** use cutout mode, check left/right mirroring, raise hands, wave, and hop. Try silhouette and camera-overlay modes.
4. **Two, then three people:** space everyone apart, keep full bodies visible, try simultaneous gestures, then overlap/cross. Check the displayed detection count and each person's visibility. Try the actual costumes.
5. **Offline:** turn Wi-Fi off and disconnect Ethernet. Reload both windows and start the camera again while the launcher keeps running. There should be no model download or sign-in.
6. **HDMI:** move player to the extended TV display, enter fullscreen, and operate the admin window for several minutes. Check that no person is cropped by TV overscan and that the scene reacts promptly.
7. **Reconnection:** close and reopen the admin window; scene/settings should return. Closing the active player lets a second already-open player take over. If the local server stops, camera capture pauses; restart the launcher to reconnect.

Live, costumed 2–3-person performance and physical HDMI behavior still need this in-person check. Automated results are recorded in TEST-RESULTS.md.

## Troubleshooting

**The player does not open:** allow pop-ups for this local Chrome address, then click Open player again. A second player waits while the first owns the camera. Close an old player to let the waiting one take over.

**The camera was denied:** allow Chrome in macOS Camera privacy settings and the site's camera permission, then stop/start the camera. A browser restart may be needed after changing macOS permissions.

**A saved camera is unavailable:** choose Default camera or another input. Device IDs can change when a browser profile changes or a camera is replaced.

**People vanish or edge quality is poor:** choose Camera overlay. Improve framing and spacing; avoid backlighting. This is the most dependable event fallback because it does not remove camera pixels.

**Motion is slow:** select Lighter load, close other heavy apps, reduce webcam resolution in its own utility if necessary, and try a direct HDMI connection. Inference timing and stage FPS are different measurements; stage FPS is not end-to-end camera latency.

**Connection is reconnecting:** keep the launcher running. Both windows must use the same local address and port. Do not mix localhost and 127.0.0.1 bookmarks. Use http://127.0.0.1:4317 for both.

**Launcher is blocked after copying to another Mac:** this is a local, unsigned folder, not a notarized Mac app. Open the launcher from Finder using the Mac's normal Open controls, or run `bash "Start Playground.command"` from this folder in Terminal. The bundled runtime is for Apple Silicon Macs; Intel Macs need a compatible Node runtime. This folder was created locally and tested on this Mac.

## Offline design and privacy

Only the player reads camera frames. Inference happens in a local browser worker using the bundled model and WASM files. The local server binds to 127.0.0.1, validates messages, keeps settings authoritative, assigns one active player, and sends fresh state on reconnect. Effects are transient and never replayed after reconnection.

A small JPEG preview is sent from the player to the admin through the local server in memory. Frames, previews, pose coordinates, and masks are not written to disk. Only non-recording configuration is saved in `data/runtime-state.json`; camera activation is not restored after server restart. The application has no remote fonts, telemetry, cloud service, sign-in, or CDN requests. Chrome itself is a separate application and may make its own background connections; the app does not depend on them.

## Source and repeatable checks

The app is plain TypeScript and Canvas, built with Vite, with a small Node/WebSocket server. The source, lockfile, asset installer, and tests are included. No installation or build is needed to play this prepared copy.

For development, using Node 22 or newer:

```sh
npm ci
npm run assets
npm run build
npm start
```

The first two commands use the internet. The asset installer verifies the pinned model hash and copies the pinned local MediaPipe runtime/WASM files. Subsequent startup is offline. `npm run dev` is available with the local server running; use the production server for actual play and offline verification.

```sh
npm test
node tests/browser-smoke.mjs
POSE_FIXTURE=/absolute/path/to/pose.jpg node tests/vision-smoke.mjs
POSE_FIXTURE=/absolute/path/to/pose.jpg node tests/player-vision-smoke.mjs
```

Browser tests use installed Google Chrome. Close real player windows before running tests; they exercise settings and synthetic camera inputs. `vision-smoke` creates its own temporary local development server. The other browser tests use the running production app on port 4317. Test inputs are synthetic or a locally supplied reference image; they do not require turning on your real webcam. See test files for fixture provenance and assertions.

Third-party notices are in THIRD-PARTY-NOTICES.md. Model provenance, SHA-256 hashes, and the model card are under `public/models/` and copied into `dist/models/`.
