# Included models and optional downloads

Cadentrail includes the required music weights inside the Docker image. First music generation loads local files; it does not download YuE2 again. The website is available while the GPU worker loads.

| Included model | Pinned revision | Weight bundle size |
|---|---|---|
| m-a-p/YuE2-3B | `29b3558dd46954a0cd9021dc76d5c91864a0f1c7` | 6.77 GiB |
| m-a-p/YuE2-Vae | `9a94e1d0ea9f8087e98f77fa88df4a4068104d2a` | 0.49 GiB |

The model stage downloads only required runtime files and attribution notices, then verifies model weight SHA-256 hashes against upstream manifests. Weights live at `/opt/cadentrail/core-models`, outside `/workspace`, so an empty or existing persistent volume cannot hide them. The image pull is larger by roughly 7.26 GiB before compression. A corrupt or incomplete core bundle fails clearly; the application does not silently redownload it.

## Included companion tools (0.4.6)

| Included tool | Pinned revision / checksum | Weight size |
|---|---|---|
| Mothersuperior real-audio v4 tokenizer and NAR adapter | `f2278a2e005dc4ecc421c53a0929f62b3aeb2280` | 297.5 MiB |
| Demucs htdemucs | SHA-256 `8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4` | 80.2 MiB |
| NVIDIA Streaming Sortformer 4spk v2.1 | `fafaab5faa1617a0ca52d38dd3dc4bd636800d3d` | 449.5 MiB |
| Mothersuperior instrumental AR adapter | `947f2f4b28978b2b6c3e316e6a87925c76bf3c4b` | 133.0 MiB |

These add 1,006,943,093 bytes (960.3 MiB) before compression under `/opt/cadentrail/bundled-tools`. Each core and companion model set has its own Docker layer, separate from the application, so frontend changes can reuse all model layers. Both Dockerfiles use `backend/tool_model_manifest.json`; every checkpoint is SHA-256 checked during build. Included models appear as **Included** in Workstation tools and cannot be removed as a cache. Stem separation reads its included checkpoint directly. Corrupt image files fail clearly instead of triggering a hidden replacement download.

Mothersuperior also needs the separate MERT encoder; inclusion of the tokenizer does not bypass its download consent. Sortformer supplies voice detection to the alignment pipeline; recognition and word alignment still need their own models. Including files on disk does not load every model into VRAM.

## Optional downloads

The first action requiring an absent optional model opens a dialog. It identifies the model, repository, missing download size and free persistent storage. **Download and continue** queues that action with explicit approval. **Cancel** creates no job and downloads no weights. Cached complete models need no repeat prompt. Interrupted downloads can resume through Retry; previously completed candidates remain available.

| Feature | Optional model | Approximate download |
|---|---|---|
| Hum-to-Song (experimental) | Mothersuperior combined hum adapter | 402.1 MiB |
| Artwork | SDXL base 1.0, FP16 | 6.62 GiB |
| Lyrics / prompt assistance | Qwen3 1.7B / 4B / 8B | 3.80 / 7.51 / 15.27 GiB |
| Lyric timing · hybrid | Qwen3-ASR-1.7B + Qwen3-ForcedAligner-0.6B, with Whisper large-v3 cross-check | About 6.10 GiB + 2.88 GiB |
| Lyric timing · legacy | faster-whisper large-v3 | 2.88 GiB |
| Real-recording encoding | MERT-v2-FullSong (v4 tokenizer is included) | 2.36 GiB |

Automatic music videos request missing artwork and alignment models together before starting. Existing artwork and reviewed timing are reused. Video rendering, uploaded artwork, the cover designer, editing, mixing and mastering need no AI weight downloads. Optional GPU tools release the resident music model before loading; they share the existing serialized GPU queue. Video rendering keeps its separate CPU lane.

Downloads show real filenames, byte counts and progress in the queue. Required files and revision pins are recorded in `backend/model_manifest.json`. `GET /api/models` reports included/cached/missing state. An unapproved API request returns HTTP 428 with `detail.code=model_download_required`; the client can repeat the request with `approvedDownloads` containing the indicated model IDs. The worker independently checks approval before any weight transfer. Approval is scoped to the queued request, not a global “download everything” switch.

Without the official Docker image, a development GPU installation also asks permission for absent core weights. CPU-only editing remains available. A source ZIP deliberately excludes weights and credentials; building its Dockerfile produces the full image.

Keep `/workspace` attached across Pod restarts. Deleting a Pod also deletes its host-local persistent volume; use portable exports or a separately managed network volume for retention across Pod deletion. Baked weights are reproducible from the image, but projects still need backups.


Hybrid alignment recognizes sung words, measures their boundaries and cross-checks incomplete lines with Whisper. Optional vocal isolation reuses the Demucs model. Optional voice detection suggests Voice A/B (up to four); it does not identify people or infer gender. Exact timestamps, model/source labels and warnings stay in the project and its timing history. Qwen's word aligner currently supports English, Chinese, Cantonese, French, German, Italian, Japanese, Korean, Portuguese, Russian and Spanish; use the legacy engine for other languages.

The alignment dependencies use a separate virtual environment so the YuE2 dependency versions stay unchanged. NVIDIA Streaming Sortformer 2.1 uses the NVIDIA Open Model License; see THIRD-PARTY.md for attribution and model terms. The offline Sortformer checkpoint is not included.

The one-click music-video workflow shares the manual provider selection and confidence gate. It reuses reviewed hybrid timing, including corrected duet roles, when that timing is already saved. New hybrid timing is a reviewable suggestion, not automatically marked as human-checked.

Instrumental requests automatically use the bundled instrumental adapter unless Original YuE2 is selected. Hum-to-Song needs separate consent and a project recording; its combined checkpoint already includes its real-audio initialization. The two adapters are pinned CC BY-NC 4.0 weights with recorded provenance. See [music adapters](MUSIC-ADAPTERS.md) for the experimental limits and project-preservation behavior.
