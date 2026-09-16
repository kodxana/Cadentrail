# Cadentrail — A DAW for YuE2

**Created by Madiator2011 · Built for Runpod**

From an idea to a finished song, in one browser workstation. Describe your sound, write or generate lyrics, choose a voice direction and compare YuE2 takes. Open that same project in Studio to edit its score, arrange clips, mix, master and export. Add artwork and create a music video without leaving the project.

## What is included

- Guided Create workflow and a full Studio workspace sharing the same projects.
- Visible generation-limit notes, rendering-effort presets and clear guidance for whole-song revisions, vocals and lyric language.
- YuE2 music generation with saved seeds, editable ABC scores and candidate history.
- Arrangement, piano roll, chords, mixer, effects, automation, stems and mastering.
- Optional GPU lyric assistance and artwork; server-rendered music videos and correctable lyric timing.
- Persistent Library, named files, visible job progress and portable project exports.
- Creation, immersive Listen and live Radio with original temporary songs, longer compositions, crossfades, live genre changes, named saved stations, explicit lyric languages and playback recovery.
- Optional personal welcome name and first-use tour stored in your browser.
- Integrated searchable handbook, six workspace tours, contextual help and F1 access on desktop and phone.

## Deployment

Image: `madiator2011/cadentrail:0.4.11`. Choose **Secure Cloud**. Expose `8000/http`, retain `/workspace` and use the Runpod HTTPS proxy. The application does not need a desktop or Jupyter.

YuE2, its audio decoder, Mothersuperior real-audio v4, the trained instrumental adapter, Demucs and NVIDIA Sortformer 2.1 are baked into the image. Optional models download only after the user confirms their names and sizes. See `docs/MODEL-SETUP.md` for the included revisions and download behavior.

`docs/runpod-template.json` contains the template configuration. It contains no default password. The container starts in open-access mode and the application guides users to set their own optional `DAW_PASSWORD` in the Pod environment. Open access includes the API; [password setup and protected routes](ACCESS.md) explains both modes. The template starts private so its listing can be reviewed before publication.

Validated GPU: RTX 4090 with 24 GB VRAM. Allocate at least 24 GB host RAM, preferably 32 GB or more and an 80 GB persistent volume. Optional models stay in persistent storage after their first approved download. The core music models load directly from the image. Keep `DAW_STORAGE=/workspace/yue2-daw` when upgrading an existing installation.

Set `DAW_STORAGE_VOLUME_ROOT=/workspace` and `DAW_STORAGE_CAPACITY_GB=80` to match that volume. If you resize the volume, update the capacity setting and restart the app. Storage status measures actual files across the volume, including optional model caches and refreshes every 15 seconds. The allowance uses decimal GB, as configured in the template. Bundled models outside `/workspace` do not consume that allowance. A download rechecks usage before starting. Runpod's shared filesystem totals are never presented as your Pod's free space; without a configured allowance, the UI shows measured usage and “allocation unavailable.” This is file usage accounting, not a provider billing or quota API.

## Attribution and scope

Cadentrail is independent software by Madiator2011, made for Runpod. It is not an official YuE2 or Runpod product and does not imply endorsement. The music engine is [YuE2-3B by m-a-p](https://huggingface.co/m-a-p/YuE2-3B).

Model terms include CC BY-NC 4.0. This template does not grant commercial model rights. Generation length, exact lyrics and vocalist identity are model-dependent. High-quality demos demonstrate particular outputs, not a guarantee for every generation. See `CREDITS.md` and `docs/THIRD-PARTY.md` in the source package.
