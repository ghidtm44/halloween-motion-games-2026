# Showcase provenance

These visuals are documentation captures of the actual application renderers included in this source snapshot. They are not concept art or recordings of real guests.

| File | What it shows | Input and limits |
| --- | --- | --- |
| `../media/hero.png` | A designed overview composed from actual renderer stills | Text and layout are documentation graphics; the app's Player remains text-free. |
| `../media/motion-games.gif` | A 12-second jungle → underwater → space sequence; five collision rewards | Two featureless avatars and synthetic landmarks feed the real `HalloweenScene.observe` / `WalkupPlay` / renderer path. No camera model runs. This demonstrates rendering and collision behavior, not tracking accuracy. |
| `../media/spooky-host.gif` | A 6-second attention, thinking, speaking and farewell animation | Simulated gaze and speech energy drive the real `HostScene`. No AI-generated line or actual audio is represented. |
| `../media/{jungle,depths,space,spooky-host}.png` | Full-resolution stills used in the overview | Same synthetic captures as the GIFs. |

No camera, microphone, personal media, private control-room UI, credentials or paid API calls are used. External requests are blocked in the capture browser. Both GIFs are silent. The capture observed zero browser errors and zero external requests.

The loops preserve elapsed time. Motion Games is encoded at 640×360 / 10 fps; Host is 720×405 / 12 fps. Their small frame rates and GIF color palettes are documentation optimizations, not the application's display rate or full visual fidelity. Runtime animation is captured at 1280×720, with five 60 Hz simulation steps between each 12 fps capture. Five rewards are counted by the actual reward callback; none are injected directly.

## Reproduce

Install the active app's dependencies and pinned assets as described in the root README. Google Chrome, Node.js 22+ and FFmpeg must be available. From the repository root:

```sh
node docs/showcase/capture.mjs
bash docs/showcase/encode.sh
node docs/showcase/hero.mjs
```

The capture starts its own isolated loopback Vite server and headless Chrome session. It neither connects to nor changes an installed app. Raw frames and the capture report go to the ignored `apps/simple-playground-v1/work/showcase/` directory. The scripts overwrite only their named showcase output files. FFmpeg runs locally without a network service.

`media-manifest.json` records the delivered media dimensions, duration and SHA-256 hashes. Regeneration can differ slightly across browser/font/encoder versions; compare the actual renders as well as the metadata. The hero uses only renderer stills and system fonts.

## What remains a live rehearsal

These assets do not prove camera/costume accuracy, segmentation quality, physical HDMI behavior, actual speaker quality, AI grounding, humor quality, or live provider latency. No claim of phoneme-level lip sync is made: the Host jaw responds to speech amplitude. See the operator guides for real-event setup and limitations.
