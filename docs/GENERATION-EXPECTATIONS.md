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
