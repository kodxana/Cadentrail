# Music adapters in Cadentrail 0.4.6

## Instrumental music

Choose **Instrumental** in Create, or request an instrumental/classical station in Radio. Automatic engine selection uses Mothersuperior’s trained instrumental AR adapter. It sends arrangement section tags through the lyrics channel instead of prose. Written lyrics remain in the project. Optional section chips give composition guidance, not exact durations. Melody + chords planning is recommended. An explicitly selected vocal direction takes precedence over automatic genre inference. Vocal descriptions such as “duet with an instrumental intro” retain their lyrics; mentioning only an instrumental intro or bridge does not select an instrumental song.

Advanced controls → Music engine → Original YuE2 provides the original path. Vocal songs use original YuE2 automatically. Switching adapter sets discards the resident pipeline and reloads the original checkpoint before applying the selected adapters. It never subtracts rounded BF16 deltas. Repeated jobs with the same adapter set can reuse the resident model.

## Hum-to-Song (experimental)

Create → Sound → Start with a hummed melody accepts microphone recording, file upload or project audio. Select 3–30 seconds and choose a tempo. Local librosa pYIN estimates a monophonic melody and rejects quiet or poorly voiced input. A simple score quantizes notes at the chosen tempo. This implementation does not include the upstream SheetSage2 model and should not be treated as a benchmark of its transcription quality.

The default continues the opening score through YuE2’s existing planner; the alternative uses only the detected melody as its supplied score. The optional combined Hum-to-Song adapter conditions acoustic synthesis on the hum’s sine carrier at four model depths. It includes its real-audio initialization already, so that initialization is not applied twice. Its FP32 midpoint solver follows the adapter example, while using the packaged engine’s bounded acoustic chunks.

Hum guidance uses melody planning for the new take. An edited Studio score blocks the job until the user explicitly detaches the hum or turns off score reuse. Detaching does not delete source audio. Microphone access requires HTTPS or localhost and a supported browser. Recordings automatically stop after 30 seconds.

The hum is guidance for the opening melody and phrasing, not voice cloning, an exact melody guarantee, or a duration setting. Pitch detection confidence is not a final-song quality score. The feature is experimental, particularly for noisy, polyphonic, or rhythmically free input.

## Models and provenance

The 139,502,088-byte native instrumental adapter is included in the Docker image. Hum-to-Song is a separately approved 421,613,360-byte download on persistent storage. Both checkpoints are pinned to reviewed revisions, verified by SHA-256, loaded through safetensors and validated before modifying the model. Unknown files and arbitrary adapter paths are not accepted.

Project generation settings retain the engine choice, separate instrumental sections and optional hum asset/region/tempo/mode/influence. Each candidate records adapter identities, revisions, digests and licenses; hum takes also record their source, extracted score and pitch confidence summary. Generation artifacts remain in the project’s named Files view. Jobs retain a generation snapshot for retries. Portable restore and duplication remap hum references along with other audio.

The bundled music engine is unchanged. Adapter jobs use its PyTorch path so a separately loaded alternative backend cannot silently ignore the adapter.

Both community adapters are by Mothersuperior, under CC BY-NC 4.0. See [third-party notices](THIRD-PARTY.md) for the exact sources, license links and modifications. The application does not grant additional rights to the model weights.

## Image compatibility

`Dockerfile.patch` copies the tested runtime into a shallow release stage, then adds each of the six core and companion model sets as a separate reusable layer, followed by one application layer. The validated layout has nine layers, including BuildKit's empty working-directory layer. The fresh-build Dockerfile uses the same release layout. Startup, health checks, CUDA settings and the persistent volume are declared explicitly. Run `python scripts/check_image_layout.py IMAGE` before publication; the gate rejects excessive layer counts. Add `--audit` to stream the actual archive and verify that model files appear exactly once, model layers contain no application files and only one layer contains the application. This changes packaging rather than model weights. The build uses Dockerfile 1.20 [multi-stage copy support](https://docs.docker.com/reference/dockerfile/#copy---from).
