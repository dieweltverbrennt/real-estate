# Hero header luminance tables

`js/hero-scrub.js` colours the header (ink or white text, plus a soft shade behind white headings) from how bright
the hero video is behind it. It doesn't read the video's pixels while the visitor scrolls. Instead it reads one
precomputed table per video source:

| Video source | Table |
|---|---|
| `img/video/villa-hero.webm` | `img/video/villa-hero-lum-webm.webp` |
| `img/video/villa-hero.mp4`  | `img/video/villa-hero-lum-mp4.webp`  |

Each table is built from **that source's own decoded frames**, because the two encodes differ slightly in brightness.
The page loads only the table for the source the browser actually plays.

**Whenever a hero video file changes, regenerate both tables** (and `CLIP_REL` / `CLIP_BRIGHT` in
`js/hero-scrub.js`, as noted there). A stale table is not detected by the page if the new clip has the same size and
frame count.

## Requirements

- Node.js 22 or newer (uses the built-in `fetch` and `WebSocket`; no npm packages).
- Google Chrome, Chromium or Microsoft Edge installed locally. The script looks in the usual install locations;
  otherwise set `CHROME` to the executable, for example
  `CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.

## Regenerate

Run from the project root:

```sh
node tools/hero-lum/build.mjs                # both tables (WebM and MP4)
node tools/hero-lum/build.mjs --src webm     # only the WebM table
node tools/hero-lum/build.mjs --src mp4      # only the MP4 table
```

It starts a local server for the project and a headless Chrome, decodes every frame of each video, and writes:

- `img/video/villa-hero-lum-webm.webp` and/or `img/video/villa-hero-lum-mp4.webp`
- `tools/hero-lum/manifest.json`: fingerprints (SHA-256) of each video and of the table built from it.

Each source takes about two minutes.

## Check that the tables match the videos

```sh
node tools/hero-lum/build.mjs --check
```

This writes nothing. For each source it decodes the current video again and reports PASS/FAIL for:

- the table file is present and has the expected size;
- the video and the table are unchanged since the table was built (against `manifest.json`);
- the table's values match the current video (within the WebP compression error, typically mean 1.6, max ~17 on a 0–255 scale).

The two sources' tables are so similar that the value check alone can't tell them apart (a swapped pair passes it).
The fingerprint checks catch swaps and re-encoded videos, so keep `manifest.json` in step by always regenerating
with `build.mjs`. It also notes whether rebuilding gives a byte-identical file. A different Chrome version may encode slightly
differently, which is harmless as long as the value check passes. The exit code is 0 when all checks pass.

## Table format (must match `js/hero-scrub.js`)

- Greyscale WebP, quality 0.85, 160 px wide, 5922 px tall.
- **Mean luminance** (0.2126 R + 0.7152 G + 0.0722 B, as the browser decodes the frame) of every unique frame. Frames
  `5k+1` repeat frame `5k` in this clip and are skipped, which leaves 233 frames.
  - Frame `u`, video rows 0–383 (where the header sits while the hero is pinned): 16×16 px cells, stored as 160×24 px
    at rows `24u … 24u+23`.
  - Frame `u`, video rows 384–1439 (only reached while the hero scrolls away): 128×96 px cells, stored as a 20×11 px
    block at `x = 20·(u mod 8)`, `y = 24·233 + 11·floor(u / 8)`.
- The builder refuses clips that aren't 2560×1440 with 292 frames. The layout constants (`BK`, `BAND`, `AKX`, …) in
  `build.html` and the `LUM_*` constants in `js/hero-scrub.js` must stay in step. A clip with a different size, frame
  count or repeat pattern needs both updated together.

## How the page uses it (summary)

- The table is requested once the video has loaded its metadata, so the source is confirmed. It's fetched at low
  priority, decoded off the main thread (`createImageBitmap`) and read once in small slices.
- If the table hasn't arrived when the header needs its first decision, that one decision reads the video, exactly
  as before. Later decisions wait for the table.
- If the table is missing, has the wrong size or can't be decoded, or the clip isn't the expected one, the header
  reads the video as before (slower, but the result is the same).

## Files

- `build.mjs`: the command-line driver (static server with HTTP Range, headless Chrome over the DevTools protocol).
- `build.html`: the page that decodes the frames and builds a table (runs inside Chrome).
- `manifest.json`: written by `build.mjs`; used by `--check`.
