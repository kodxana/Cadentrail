# Cadentrail architecture

Single-origin React/TypeScript workstation served by FastAPI on port 8000. Projects and assets live under `/workspace/yue2-daw`. SQLite WAL stores authoritative versioned project documents, revisions, durable jobs and assets; JSON snapshots make backups inspectable. Immutable originals, derived files and per-generation artifacts never overwrite favorite takes. Compare-and-swap revisions reject stale browser saves.

The browser uses a musical quarter-note timebase, Canvas timeline and piano roll, command/patch history, a bounded audio-segment cache, scheduled Web Audio nodes and AudioWorklet metering. Peak caches, not full audio decoding, drive opening and drawing projects. Transport time comes from the audio clock; React does not animate every sample. Audio scheduling and AI execution have separate processes and failure domains.

Python manages media conversion, pyramidal peaks, spectrograms, analysis and exports. A durable queue dispatches to one resident YuE2 subprocess on the initial 24 GB tier. Cancellation terminates the process to release CUDA memory; the next job reloads. Queued jobs survive restart; interrupted jobs fail explicitly and can be retried without duplicating completed candidates. Required music and companion checkpoints load from immutable Docker layers. Optional models download into persistent storage only after consent, guarded by a lock.

Model integration targets the official `yue2_infer-0.1.5` wheel, inspected from Hugging Face. Planning, semantic generation, synthesis and decode are distinct stages. Full/melody/off composition modes and provided ABC are supported. Edited scores regenerate a whole candidate; no sample-exact inpainting is implied. Default VAE is `m-a-p/YuE2-Vae`; no quantization. GPU metrics must be measured in this application before claiming support.

ABC remains authoritative until explicitly converted. Conversion uses music21 and reports unsupported semantics; visual edits export a normalized score. Keep original ABC and generation artifacts for audit and recovery. MIDI uses the same internal notes. Quantization and tempo changes are explicit, never inferred from uncertain beat estimates.
