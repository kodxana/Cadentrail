# Generation expectations

Create, Studio and Radio use the same YuE2 engine. Instrumental generation and experimental Hum-to-Song have separate [adapter behavior and limitations](MUSIC-ADAPTERS.md). Features depend on the packaged runtime; a newer upstream model description does not change an installed version.

## Rendering presets

| Display name | Saved key | Acoustic steps |
|---|---|---:|
| Fast | `fast` | 16 |
| Standard | `balanced` | 32 |
| Extended | `high` | 48 |
| Maximum effort | `maximum` | 64 |

Standard is recommended. These settings change acoustic synthesis effort, not a measured quality score. More steps can take longer without producing better lyrics, composition or vocal casting. Radio retains its two existing options, Standard and Extended. Its saved station recipes still use the original keys. If Create's saved preset and actual synthesis steps disagree after a Studio edit or inherited take, the selector shows Custom Studio settings and preserves the parameters until the user chooses a preset.

## Limits and incomplete takes

Candidate notes come from the actual truncation metadata. An ABC flag concerns the score plan; a semantic flag concerns the generated audio ending. Both flags produce a combined note. A legacy boolean flag produces a general ending note. Missing, false or malformed metadata does not produce a warning. The absence of a flag does not certify that a take has a good ending.

The note keeps playback and download available. Prepare new take loads a reviewable revision with its parent reference; it does not automatically generate. Radio uses its existing incomplete-song flag and retains live playback without adding skip, seek or pause.

Duration remains composition-dependent. Radio's three- and five-minute targets request an arrangement; they are not trimming, looping or exact-duration guarantees. Pre-generation context-budget estimates are not available.

## Revisions and voices

Revising lyrics, score or style asks YuE2 to generate a new whole-song recording. An unchanged part is not guaranteed to retain its original audio. Source takes, media and lineage stay saved. Score reuse follows the existing revision workflow.

Vocal direction guides the style. Duet or alternating requests can vary in singer identity and line assignment; instrumental requests can still produce vocal sounds. These controls do not expose independent singer stems or deterministic casting.

## Language

Radio's language choice directs its lyric writer and music request. Its existing written-language check does not verify sung pronunciation. The live station therefore labels this as Requested lyrics. In Create, write lyrics in the desired language and include it in the music description. Sung-language verification is not available.

## Studio and the model

| Action or control | What it does |
|---|---|
| Generate | Creates a new complete stereo take from the description, lyrics or instrumental direction, enabled score/hum reference and generation settings. |
| Import MIDI | Adds editable note parts. Review tempo, meter and playback limitations before importing. It does not enable a YuE2 reference. |
| Choose melody for YuE2 | Saves a selected pitched clip or loop region as ABC. Melody only excludes project chord symbols; Melody + project chords includes them in the same range. |
| Use saved ABC for next take | Explicitly enables the saved ABC reference. Piano-roll or chord edits must be applied again to update that snapshot. |
| Studio preview instrument | Selects a built-in synth for playback and browser audio export. It does not choose YuE2’s instrument or load the source MIDI’s sound bank. |
| Clip edits, mixer and automation | Change the Studio arrangement and supported mix rendering. They are not sent to YuE2 as instrument instructions. |
| Separate stems | Estimates parts from existing audio with Demucs. This can leave bleed and artifacts; it does not generate isolated instruments. |
| Render audio | Exports the current arrangement using the selected supported renderer, without running YuE2. |
| Inspect score | Opens a take’s generated ABC without changing the active project reference. Use this score for next take is a separate action. |

Per-track AI rendering and replacement of a selected audio region are unavailable. A solo-instrument style prompt is a request for the whole generated take, not an independent instrument slot. A selected melody is guidance: YuE2 can alter notes, phrasing, instrumentation and timing. A generated score is not a transcription of every instrument in the finished audio.

Studio’s MIDI playback uses five simple synth types. Original General MIDI sound banks, sustain/expression/pitch-bend controllers and tempo maps are not reproduced. Import review reports these limits. Retain the source MIDI when its full performance data matters.

Invalid enabled score references are blocked before queue submission and remain switchable off. A hum and a separate ABC reference cannot be enabled together. GPU availability and optional-model requirements still apply to supported generation operations.
