# Cloud development startup

From the repository root, run `bash .codex/setup.sh` once. It prepares both apps using Node.js 22+, pinned npm dependencies and verified local model/WASM assets. Setup requires access to the npm registry, `storage.googleapis.com` and `raw.githubusercontent.com`. It does not download the Mac Node executable or start an AI session.

Start only the app being developed, in its own terminal:

```sh
cd apps/simple-playground-v1
npm start
```

Simple Playground: `http://127.0.0.1:4318/`; player: `http://127.0.0.1:4318/?view=player`.

The preserved Corn Maze app starts separately with `cd apps/corn-maze && npm start`, on port 4317. Do not replace an occupied port's process. Both servers stay bound to loopback; use only the environment's private browser/preview facilities. Camera access is optional and cloud tests should use synthetic fixtures.

Readiness checks, while the selected server runs:

```sh
curl --fail --silent http://127.0.0.1:4318/api/health
# For a separately running Corn Maze instance:
curl --fail --silent http://127.0.0.1:4317/api/health
```

Expect `ok: true`, `localOnly: true`, `offlineAssetsReady: true`, and no missing assets. Simple identifies `edition: "simple-v1"`. Do not dump `/api/state` into logs: live state may contain preview images and device details. Stop a development server with Control-C in its terminal.

Use `npm run check` in a changed app after code changes. Existing browser/portable tests have Mac-specific assumptions; inspect their targets and use an isolated test server before adapting them. Native AppKit compilation and final `.app` assembly require a Mac and the recipe in `launchers/macos/native/BUILD.md`. Linux build/test success is not a native Mac or physical TV verification.

For an explicitly requested Mac release, synchronize the tested Simple V1 source into the separate native snapshot while retaining `scripts/native-runner.mjs`, then use `bash launchers/macos/native/build-app.sh` locally on the Mac. Add `--desktop-copy` only when Desktop installation is requested. The native launcher reads its saved API credential from macOS Keychain automatically; use the build guide's private import and fresh-process check to provision it. Keep Corn Maze separate. Setup restrictions on editing tracked application files do not prohibit later user-requested development.

Spooky Host is available in Simple V1. Choose that world, open the player, and choose **Scripted rehearsal · offline** with **Operator** control mode (the default), then **Speak**, to try one scripted line without a key or camera. Each click requests one remark; arrivals and timers do not trigger speech in Operator mode. Enable host voice in the player; an installed local voice is used for rehearsal when available, otherwise captions remain available. Start the camera for local group gaze tracking. Selecting the world or starting the camera does not upload images. Live **Speak** starts or reuses a session and requires one fresh camera image per click. Optional **Auto** requires an explicit **Start automatic** action before stable-arrival greetings and bounded follow-ups can run. Changing control modes stops the current session and pending work.

No API credentials are required for setup or scripted rehearsal. For real AI, configure a server-side key through environment secrets as `SPOOKY_HOST_API_KEY` (the cloud secret system reserves `OPENAI_` names), allow `api.openai.com` within restricted access, and start using Node 24+: `NODE_USE_ENV_PROXY=1 npm start`. A local Mac server can also use `OPENAI_API_KEY`. Never put keys in browser variables or repository files. One project key covers image/context understanding, comment generation, moderation and speech when its permissions allow the selected endpoints/models; API usage is billed separately from ChatGPT subscriptions. No external AI call happens until an operator presses **Speak**, or explicitly starts Auto and its presence rules request a remark. An open Operator session never processes images in the background; Auto uses occasional stills, never an AI video stream. See the implementation and operator guide for behavior, current test evidence and live-validation limits.
