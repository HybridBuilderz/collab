# AGENTS.md — Jenni's Keyboard

Static single-page 3D keyboard: `index.html`, `styles.css`, `main.js`. No build step, no package manager, no tests, no CI, no git.

## Run it

Serve over HTTP; opening `index.html` via `file://` fails (ES module + importmap are CORS-blocked).

```powershell
python -m http.server 8000   # then http://localhost:8000
```

Verification is manual: click **open the lid**, play keys, exercise the control bar.

## No toolchain

No `package.json`, linter, formatter, typechecker, test runner, or install step. Do not add dependencies or a build pipeline unless asked — the app is intentionally three hand-edited files.

## Runtime dependencies are CDN-pinned (no `node_modules`)

| Dependency | Version / source | Used for |
| :--- | :--- | :--- |
| Tone.js | 14.8.49, cdnjs | global `Tone`, all audio |
| Three.js | 0.160.0, jsdelivr | `importmap` → `import * as THREE from 'three'` |
| Google Fonts | Cormorant Garamond, Jost | `<link>` |
| Salamander samples | `tonejs.github.io/audio/salamander/` | grand piano, fetched at runtime |

The page needs internet. A failed `three` fetch stops `main.js` from running at all (blank stage, dead controls). Audio stays silent if the sample host is unreachable. `state.audioReady` stays false until `Tone.loaded()` resolves, and instrument/metronome controls no-op until then.

## Architecture (all in `main.js`)

- **Range**: `START_OCTAVE = 2`, `NUM_OCTAVES = 5` → C2–C7, `TOTAL_WHITE = 36`. Keys are procedural (`buildKeys`, `buildBody`) — there are no model/image assets. `keyByNote` maps note name → mesh; `mesh.userData.note` is what sounds.
- **Camera**: `CAM_UNIT` + `CAM_BASE` define a fixed pitch; `frameCamera()` picks `camDist` from `camera.aspect` so `VISIBLE_WHITE` (16) keys fill the width. Called from `resize()`. Do not reintroduce fixed `CAM_H`/`CAM_D`.
- **Sliding**: `state.panX` / `panTarget` / `maxPan`. Drag on empty canvas, mouse wheel, the scrollbar (`scrollJump`), and the `−8ve`/`+8ve` buttons (`shiftOctave`) all change it. `visibleWidth()` drives `maxPan`, the scrollbar and the range label — keep it in sync with `frameCamera()`.
- **Lock while playing**: input is Pointer Events only (no separate `touch*`/`mouse*` listeners, so no compatibility-mouse cross-talk). `pressKey()` calls `cancelPans()`, and a new pan only starts when `pressed.size === 0`. The wheel, scrollbar and `−8ve`/`+8ve` all bail out while a key is held, so the bed never moves during play.
- **Controls**: instrument (`grand`/`epiano`/`synth`/`musicbox`), volume, metronome + BPM (`Tone.Transport.scheduleRepeat('4n')`), record/playback (`performance.now()` deltas + `setTimeout`), key labels, sustain, fullscreen.
- **Labels**: HTML divs in `#kb-labels`, re-projected every frame at `KEY_L * 0.8`; white keys only.
- **Theme**: `:root` custom properties in `styles.css`; 3D palette is hardcoded material colors in `main.js`.

## Gotchas

- `Tone.start()` must run inside the **open the lid** click handler (mobile autoplay policy). The gate hides immediately; `initAudio()` loads samples in the background, so early key presses can be silent.
- Grand samples are 2 per octave (C, F#); `grandUrls()` covers octaves 1–7, which spans the C2–C7 bed.
- `setInstrument()` silently no-ops if `instruments[name]` does not exist yet (audio not initialised).
- Recording is capped at `REC_MAX_SECONDS` (60 s); playback is cancelled by the next user `pointerdown`.
- `toggleFullscreen()` is guarded by `fsBusy` — it awaits `requestFullscreen()`, so rapid clicks otherwise interleave. `.fake-fullscreen` is the fallback (iOS Safari, iframes, blocked permissions); its selectors must stay in sync with `styles.css`.
- The old `transpose()` is gone: octave buttons now pan the bed instead of rewriting note names.
- Personalization edit points are in `index.html` (hero name/subtitle, the `<!-- Manuel: ... -->` message, signature) — everything else is instrumentation.
