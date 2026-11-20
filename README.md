# Jenni's Keyboard

A 3D keyboard for Jenni — five octaves, four sounds, a metronome, and recording, wrapped in the warm dark-and-gold page.

Open `index.html` through a local server and play:

```powershell
python -m http.server 8000   # then http://localhost:8000
```

## Playing

- Tap the keys — chords work, use every finger.
- Drag the dark wood to slide along the keyboard, or use the scrollbar / `−8ve` / `+8ve`.
- The keyboard locks in place while a key is held, so it never slides under your fingers.
- **fullscreen** turns the page into a landscape keyboard; rotate the phone if it asks.

## Controls

| Control | Purpose |
| :--- | :--- |
| sound | grand piano, electric piano, synth keys, music box |
| labels | show note names on the keys |
| sustain | sustain pedal |
| metronome + tempo | click with an adjustable BPM |
| rec / play | record a performance (up to 60 s) and play it back |
| vol | master volume |

Sounds load from a CDN, so the page needs an internet connection the first time.
