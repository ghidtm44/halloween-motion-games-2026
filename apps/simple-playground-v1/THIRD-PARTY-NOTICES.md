# Third-party components

- **Node.js 22.23.1**, Mac ARM64 executable bundled in `runtime/node`. License and bundled third-party notices: `runtime/NODE-LICENSE.txt`. Upstream: https://nodejs.org/
- **MediaPipe Tasks Vision 0.10.32**, Apache License 2.0. Runtime JavaScript and WebAssembly are copied locally from the pinned npm package. Upstream: https://github.com/google-ai-edge/mediapipe . License: `public/models/MEDIAPIPE-LICENSE.txt`.
- **MediaPipe Pose Landmarker Lite, float16, version 1** from Google's model storage. Local file `public/models/pose_landmarker_lite.task`; SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. Model provenance and documentation links are in `public/models/manifest.json`. The upstream model card is included next to it. The app merges masks; it makes no reliable identity or individual-mask claims.
- **ws 8.22.0**, MIT License. Upstream: https://github.com/websockets/ws . License in `node_modules/ws/LICENSE`.
- Development tooling includes TypeScript, Vite, and Playwright. Versions are locked in `package-lock.json`; upstream license files are in installed packages.

All scene artwork is generated procedurally by the app. No external images, fonts, music, characters, or branded entertainment assets are used in the runtime.

Vision smoke tests can use Google's public MediaPipe pose reference image, supplied as a local fixture. That image is test-only and is not part of the user-facing runtime or portable package.
