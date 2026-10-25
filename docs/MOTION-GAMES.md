# Continuous Motion Games

Open **Play Motion Games.app** on the Desktop. The installed application is `~/Applications/Simple Playground Motion Games.app`. It opens a local control room and player in Chrome. Keep the launcher open; **Quit Playground** stops the server it owns. Spooky Host and Corn Maze remain separate applications.

## Three worlds, one game

| World | Collectibles | Gentle obstacles |
| --- | --- | --- |
| Escape from Monkey Island | Bananas, amber gems, luminous seed pods | Mossy branches, logs and vine-wrapped seed balls |
| Escape from Shark Depths | Pearls, starfish, bubbles | Coral arches, low reef beams and jellyfish |
| Alien Attack | Energy cells, crystals, miniature planets | Saucers, low space beams and asteroids |

The worlds use an original generated raster library: layered painted/3D environments, transparent edge scenery, props, independent character poses, collectibles, obstacles, atmosphere and celebratory effects. Blue-and-gold macaws, friendly sharks and small alien explorers animate at the margins and react to play. Jungle mist, underwater light and passing sea life, and space dust and distant craft move behind participants. The requested monkey sprite was blocked by generation moderation and is not included; the jungle actor is a macaw. Source boards, prompts and deterministic runtime extraction are versioned under `art-source/worlds-v2/`. The 59 optimized runtime images total about 4.9 MB.

Mechanics, speeds and contact areas are identical in all worlds. Switching in the control room changes the current objects' skin without resetting their positions, tracking or interaction progress. The road and edge scenery move continuously, including when empty. Three grab beats are followed by one isolated body challenge. Default useful grabs arrive about 2.6 seconds apart during grab sequences; a duck, hop or dodge passage has a longer readable window, so the gap across that passage is about 7 seconds. The Challenge pace slider ranges from 5-second grabs (Relaxed) to 2-second grabs (Lively); body passages remain at least 4.4 seconds apart. Changes affect future events. One action is visible at a time, missed events never stop play, and no contradictory actions overlap. These are original game timings, not measured from a reference video.

Either confident wrist overlapping a glowing collectible ring on two fresh observations causes one short confetti burst. Wrist contact does not require visible hips or head. The visible hand and object rings use the same geometry as the hit test. Ducking modestly below a passing overhead obstacle or side-stepping a falling obstacle can trigger a sparkle. Low horizontal hurdles use an upward curve cue: a small body rise or gentle hop counts; standing up from a small knee bend is sufficient. Jump detection is a pose-rise heuristic, not reliable proof of airborne feet. Body actions require the relevant tracked landmarks and motion; head-only movement cannot earn a rise reward. Collisions, disappearance, stale/uncertain wrists and first-sample appearances earn nothing. There are no penalties, scores, timed rounds, jumpscares or instructions to run or make high jumps. Operator celebration buttons remain available as an explicit manual override.

## Setup and controls

1. Open the player, then choose **Start camera** in the control room when ready. Select the desired **Video input**. The camera starts off every launch; microphone input is never requested.
2. Keep up to three full bodies visible with room between people. Check **Mirror camera** against the display and try reaching into a glowing collectible. Gentle ducks, side-steps and a small rise from a knee bend are enough.
3. Move the player onto an extended TV display and click the scene once to enable music and fullscreen. **F** enters fullscreen without unlocking audio. **Esc** exits. All labels, errors, camera controls and setup instructions stay in the control room; the player always remains text-free.
4. Switch worlds any time in the control room. Choose **Camera overlay** if masks, costumes or overlap make cutouts unreliable. **Glowing silhouettes** and **Magic cutout** use one combined foreground mask.
5. **Challenge pace**, **World music** volume and **Mute music & musical rewards** are live controls. Original jungle, underwater and space scores are synthesized locally, fade between themes and include brief success accents. Sound uses the Mac’s selected audio output. Pause, lost player ownership, disconnection and hidden player tabs silence music; reopening a player requires a fresh click.
6. **Tracked interactions** disables automatic rewards without stopping scenery. **Run background only** stops the camera while keeping objects moving. **Pause** freezes the display; **Stop camera** releases capture. Use the launcher's **Quit Playground** to finish.

Admin shortcuts **1**, **2**, **3** trigger confetti, a color burst and sparkles; **Space** pauses. Player **F**, **Enter**, **Space** or a direct click enters fullscreen. Form editing ignores admin shortcuts.

## Local processing and separation

Motion Games uses port **4328**, bundle ID `com.local.simpleplayground.motiongames`, and settings under `~/Library/Application Support/Simple Playground Motion Games`. Its launcher skips credential loading entirely, hides credential menus and rejects credential command modes. The server rejects host actions and the Spooky Host scene. It never needs a key or paid model calls. Start only one application's real camera at a time.

Camera frames, pose coordinates and masks remain in memory. The server binds to loopback, checks same-origin requests and grants capture to one player. Only non-recording settings persist; camera activation does not. Departed/uncertain people lose interaction history immediately, and stale tracking is cleared after 300 ms. Mirroring, camera changes, pause and disconnect clear interaction history so old motion cannot award a hit. Pose identities are temporary and can swap when people cross; this is not face recognition.

## Cutout stability

The installed model remains MediaPipe Pose Landmarker Lite (tasks-vision 0.10.32), configured for up to three poses and a combined foreground mask. Pose interaction is independent of the mask. The compositor retains the exact source-image/mask pair during short stable dropouts (up to 120 ms), smooths only uncertain edges, and fades to camera overlay on longer failure. Empty people clear after 120 ms; significant movement/person-count changes during missing-mask frames clear immediately; no source pair is kept beyond 350 ms. Recovery from fallback needs consecutive usable masks. A single empty GPU mask no longer restarts Motion Games tracking; three consecutive empty masks trigger CPU recovery.

This reduces pipeline-induced flashing, but cannot make the lightweight model robust to every costume, background, occlusion or difference in person scale. Native Apple Vision and recurrent matting remain unbenchmarked alternatives, not included upgrades.

## Verification and rehearsal

Automated tests cover collection, duck/dodge/rise rewards and non-rewards, empty flow, entry/exit, stale/occluded tracking, three participants, mirror/aspect mapping, theme changes with active interactions, text-free output, camera selection, pause and cleanup. Browser checks use fake camera input and synthetic landmarks; stage FPS is not live inference latency. Model assets and the bundled runtime are verified during packaging.

Before the event, rehearse on the actual camera and TV with one, then two or three people in their costumes. Check lighting, reach alignment, mirroring, duck/dodge/rise clearance, overlap, camera unplug/recovery and scene changes. Use Camera overlay when cutouts are unreliable. The synthetic checks do not establish live costume accuracy, separate person masks, physical HDMI behavior or sustained event performance.

## Interaction repair

The first Motion Games release showed confident wrist rings but required a confident head, both shoulders and both hips before evaluating any grab. A cropped/uncertain body could therefore block visible hand contact. Its catch area was also smaller than the visible rings. The repair separates wrist collection from body actions, shares rendering/collision eligibility and radii, and accepts confirmed visible overlap without requiring an invisible entry edge. Browser regressions reproduce the old failure and verify both hands, mirrored input, 4:3/portrait cameras, varied windows and Retina scaling against the actual production player. Stale, absent and uncertain wrists still cannot collect.
