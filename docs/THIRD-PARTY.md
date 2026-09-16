# Third-party components

This is an original application assembled with standard libraries. The original application code uses Apache-2.0 (see ../LICENSE). Model, dependency and any adapted upstream material retain their own licenses; publishing a container does not remove their conditions. Consult the installed distribution metadata and upstream license text before redistribution or commercial deployment.

| Component | Purpose | Upstream |
|---|---|---|
| YuE2-3B / YuE2-Vae | Main music model / waveform decoder; CC BY-NC 4.0 model terms | https://huggingface.co/m-a-p/YuE2-3B |
| Official yue2-infer 0.1.5 | Checked inference wheel | https://huggingface.co/m-a-p/YuE2-3B/tree/main |
| Demucs 4.0.1 | Auxiliary four-stem separation | https://github.com/facebookresearch/demucs |
| React, Vite, TypeScript, Immer, Lucide | Browser application | https://react.dev/ / https://vite.dev/ / https://www.typescriptlang.org/ / https://immerjs.github.io/immer/ / https://lucide.dev/ |
| abcjs / music21 / mido | Notation and MIDI interchange | https://paulrosen.github.io/abcjs/ / https://www.music21.org/ / https://mido.readthedocs.io/ |
| FastAPI / Uvicorn / SQLite | API, server and persistence | https://fastapi.tiangolo.com/ / https://www.uvicorn.org/ / https://sqlite.org/ |
| PyTorch / torchaudio | CUDA tensor runtime | https://pytorch.org/ |
| NumPy / SciPy / SoundFile / Pillow | Audio preprocessing and visualizations | https://numpy.org/ / https://scipy.org/ / https://python-soundfile.readthedocs.io/ / https://python-pillow.github.io/ |
| FFmpeg | Decoding, mastering and export | https://ffmpeg.org/ |
| DM Sans / Manrope | Locally bundled fonts; retain their OFL notices | https://fontsource.org/fonts/dm-sans / https://fontsource.org/fonts/manrope |

The Debian FFmpeg binary has its own build configuration and license obligations, which can include GPL components. Corresponding Debian source packages are available from https://sources.debian.org/src/ffmpeg/ and the Debian package repositories. CUDA libraries retain NVIDIA's license terms. Review actual package contents if redistributing the image.

The redesigned image includes optional [faster-whisper](https://github.com/SYSTRAN/faster-whisper) runtime for Whisper large-v3 alignment; neither replaces YuE2. Other DAWs cited in ARCHITECTURE.md were used as interaction research, not copied implementation or assets.


## Optional models added in the redesign

| Component | Use / terms | Source |
|---|---|---|
| SDXL base 1.0 / Diffusers | Artwork; model OpenRAIL++ terms and Diffusers Apache-2.0 | https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 |
| Qwen3-1.7B / Qwen3-4B / Qwen3-8B | Selectable lyric and prompt assistance; Apache-2.0 models | https://huggingface.co/Qwen/Qwen3-1.7B / https://huggingface.co/Qwen/Qwen3-4B / https://huggingface.co/Qwen/Qwen3-8B |
| faster-whisper / Whisper large-v3 | Conservative lyric alignment; upstream MIT licenses | https://github.com/SYSTRAN/faster-whisper / https://huggingface.co/openai/whisper-large-v3 |
| Mothersuperior real-audio tokenizer v4 | Included tokenizer and NAR adapter; CC BY-NC 4.0 | https://huggingface.co/Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4 |
| MERT-v2-FullSong | Recording features; CC BY-NC 4.0 | https://huggingface.co/m-a-p/MERT-v2-FullSong |
| DejaVu fonts | Server cover/video typography; Debian package font licenses | https://dejavu-fonts.github.io/License.html |

The real-audio implementation follows the published tokenizer architecture, overlap inference and NAR delta application. It pins Mothersuperior revision `f2278a2e005dc4ecc421c53a0929f62b3aeb2280` and MERT revision `d8ba1c745e733b3908ce6ad16ebeb17ac7600a42`. Checkpoints load with `weights_only=True`; the two MERT Python model files at the pinned revision were inspected before integration. Starting in 0.4.1 the unmodified v4 checkpoints are included in the Docker image. MERT remains a separate persistent download. No weights are embedded in the source archive. No training corpus or artist-LoRA weights are bundled.


## Optional song alignment and voice detection (0.3.9)

Qwen3-ASR-1.7B and Qwen3-ForcedAligner-0.6B use Apache-2.0 model terms, as does the Qwen-ASR runtime. NVIDIA NeMo is Apache-2.0; `nvidia/diar_streaming_sortformer_4spk-v2.1` uses the NVIDIA Open Model License (https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/). Source and model attribution: https://github.com/QwenLM/Qwen3-ASR and https://huggingface.co/nvidia/diar_streaming_sortformer_4spk-v2.1 . The optional checkpoints are pinned in `backend/model_manifest.json`; Sortformer 2.1 is included in 0.4.1; recognition and word-alignment weights remain optional downloads. The image installs these dependencies in `/opt/cadentrail/alignment-runtime`, isolated from YuE2. Sortformer is a speech diarization model, not a verified singing-identity classifier. Its voice activity suggestions require review for harmonies and overlapping singers.

## Included companion checkpoint notices (0.4.1)

The image redistributes unmodified, pinned Mothersuperior v4, Facebook Research Demucs htdemucs and NVIDIA Sortformer 2.1 checkpoints with their source attribution above. Full checkpoint SHA-256 values are in `backend/tool_model_manifest.json`. Model license copies are included under `/opt/cadentrail/licenses`: CC BY-NC 4.0 for the YuE2-derived Mothersuperior weights, MIT for Demucs and the NVIDIA Open Model License for Sortformer. These files are independent of Cadentrail application ownership. No artist-trained adapter is included.

## Radio language verification (0.4.2)

`langdetect==1.0.9` supplies offline language profiles and deterministic written-lyric checks (seed 0). Upstream: https://github.com/Mimino666/langdetect ; Apache-2.0. Its installed distribution retains the license/notice. It uses CPU and performs no runtime model download. The detector is a heuristic, not a sung-audio transcription model.


## Instrumental and Hum-to-Song adapters (0.4.6)

- **Mothersuperior / YuE2-instrumental-cot-full-loras** — [source and model card](https://huggingface.co/Mothersuperior/YuE2-instrumental-cot-full-loras), revision `947f2f4b28978b2b6c3e316e6a87925c76bf3c4b`, CC BY-NC 4.0. The unmodified native BF16 instrumental AR adapter is included in the Docker image. No vocal-artist adapter is bundled.
- **Mothersuperior / YuE2-hum-to-song** — [source and model card](https://huggingface.co/Mothersuperior/YuE2-hum-to-song), revision `cd323af53ebf61d613fb3d7717e7c8b9bb67f643`, CC BY-NC 4.0. The combined safe-tensor checkpoint is an optional, explicitly approved download. It already contains the companion real-audio NAR initialization; Cadentrail does not apply that initialization twice.
- **librosa 0.11.0** — [project](https://github.com/librosa/librosa/tree/0.11.0), ISC license (copy in `docs/licenses/librosa-ISC.txt`). Local pYIN extracts a clean monophonic hum. No hosted transcription API is used.

Weights remain under their respective license; Cadentrail does not relicense them. [CC BY-NC 4.0 terms](https://creativecommons.org/licenses/by-nc/4.0/) allow noncommercial sharing and adaptation with attribution. Source, revision and SHA-256 are recorded in the model manifests and generation metadata. The full CC BY-NC 4.0 text accompanies the image.

Implementation changes from the published examples: validated safetensors loading; automatic restoration from stock weights when changing adapter sets; persistent source references; local pYIN-to-ABC instead of the author's SheetSage2 transcription; confidence rejection; bounded original YuE2 acoustic chunks, FP32 midpoint solving for the hum adapter and normal queue/progress/cancellation. Hum guidance is experimental. It is not voice cloning, polyphonic transcription, or a guarantee of exact melody or duration. The upstream model-card results have not been adopted as Cadentrail performance claims.
