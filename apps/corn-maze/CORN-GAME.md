# Corn Maze Quest

A cooperative game for the same local webcam, Mac, and TV setup. Gather **six glowing corn cobs**, choose your way through the maze, and find the Moonlight Meadow. Two optional mystery boxes reward exploring the side paths. Everyone shares the harvest and the win.

This original scene follows the interactive movement-game brief and the [video supplied as a gameplay reference](https://www.youtube.com/watch?v=TW_iuVf0Fs8). The video, its music, characters, and artwork are not copied or bundled. Playing the game does not contact YouTube or any other online service.

## First test on the Mac

1. Start **Start Playground.command**, keep its Terminal window open, and open the player from the control room. See [README.md](README.md) for the full setup guide.
2. Select **Corn Maze Quest** in the control room.
3. For a camera-free check, enable **Mouse practice**, then move the pointer over the actual player stage. Hover over a corn cob until its ring fills; move it down to a basket and hold there briefly. Clicking is not needed.
4. Start the camera to play with your body. Starting the camera exits mouse practice. Allow Chrome's camera permission if asked and select the desired video input.
5. Keep everyone's head, hands, and hips in frame. Separate the players enough that their arms remain visible. The colored hand cursors should follow your wrists; they are the interaction points.

The practice pointer is one test hand. It checks the game and display setup; it does not test the camera or multi-person tracking.

## Reach, carry, and explore

- **Grab:** reach a hand to a glowing corn cob and hold it there for about half a second. A filling ring confirms that the game sees your hand. The cob attaches automatically.
- **Carry:** move that hand down to any of the three baskets. Hold it inside the basket briefly to deposit the cob. Other players can carry different cobs at the same time.
- **Choose a path:** after clearing the area, reach to a path sign and hold for about three quarters of a second. One player's choice moves the whole team. If two choices finish together, the game accepts one.
- **Travel:** the scene prompts everyone to run in place during the animated journey. Keep a hand visible so the journey can continue. The current version does not measure running cadence or require actual running.
- **Open a mystery box:** hold a hand on the box until the ring fills. It opens immediately with a bonus effect; it does not need carrying to a basket. Use the back sign to return to the fork.
- **Win:** collect all six cobs, then choose the glowing exit from Harvest Hollow. The two mystery boxes are optional bonuses.

This release uses a wrist's position and a short hold to grab. It does **not** detect finger pinching, closed fists, or physical contact. It has route choices and timed travel, but no posture-based obstacle collision, ducking challenge, or jump-over-obstacle mechanic yet.

If a hand disappears or its tracking position jumps sharply while carrying, the cob returns to its original spot so someone can grab it again. Deposited corn and opened boxes stay collected for that round. There is no timer or life penalty.

## Control room and TV

Keep the control room on the Mac and move the player to the HDMI TV as an extended display. Enter fullscreen in the player with its button or **F**. The control room can restart the round and change scenes without taking the TV out of fullscreen. Its game readout shows the current area, corn count, bonuses, and instruction.

Use the round restart control for each new group. Pause stops game progress and clears unfinished hand holds. Resume, then reach for the cob again. Scene changes, camera changes, or input changes can release carried objects so stale hand positions do not claim an object.

The active player owns the current maze run. Reopening the control room retains the current run while the player remains open. Reloading, closing, or replacing the active player starts a new run; game progress is not saved to disk. The server remembers scene and control settings, including the latest round-reset token, and a reconnect receives their current values rather than replaying old reset actions. Restarting the server leaves camera capture off until a new local action starts it.

## Tracking and fallback

The same local pose model tracks up to three people, with up to six wrist cursors. Short-lived pose IDs can swap when players overlap or cross, so this is a shared team score rather than an individual player score. The cutout remains one combined foreground mask; reliable separate person masks are not claimed.

Choose **Camera overlay** if costumes or overlap make someone's cutout disappear. Overlay preserves the camera picture but does not repair missing pose detection. If the model cannot find usable hands, the game waits: use mouse practice to continue a camera-free demonstration. Manual scene effects remain available.

For the event, test one player first, then two and three together in the actual costumes and lighting. Check that each wrist cursor matches the mirrored camera image, try carrying two different cobs at once, and let one person leave and reenter the frame. Real-world camera reliability and physical HDMI behavior still require this local check.

## Quick game check

1. Collect the two cobs at Moonlit Gate. Confirm that a cob counts only after it reaches a basket.
2. Try a side path, open its mystery box, and return. Confirm that the box stays open and the corn count does not increase for a bonus.
3. Collect the remaining corn, reach the exit, and confirm the shared celebration.
4. Restart the round from the Mac while the player stays fullscreen. Confirm that corn, bonuses, and the area return to the start.
5. Pause during a hold, resume, and check that a fresh hold is required. Briefly hide a carrying hand and confirm that its cob returns for another attempt.
6. Reopen the control room and confirm that the current round is still visible. Reload the player and confirm that it begins a fresh round.
7. Turn off Wi-Fi, reload both windows while the launcher remains open, and repeat a camera and mouse-practice check. All game, model, and scene assets are local.
