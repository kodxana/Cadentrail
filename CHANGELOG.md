# Cadentrail changelog

Product changes by version, newest first. Open Guide → What's new in the app to browse and search this history.

Entries describe behavior at the time of each release. Early versions used the working title YuE2 Studio. Historical dates are omitted where no consistent record is available.

## 0.4.11 — The story of each update

Browse the changes that shaped your workstation.

### Added

- A dedicated What's new changelog, available from Guide and About in every experience.
- Search updates by version or feature, filter Added, Improved or Fixed, and browse the full documented history.

### Improved

- The in-app history and downloadable source changelog share one release catalogue, with a packaging check to keep them in sync.

## 0.4.10 — Bring your own agent

A clear starting point for working with your own creative assistant.

### Added

- Visible Agents access in Creation, Listen and Radio.
- Guided setup for Codex, Claude Code and other MCP clients, project-aware task suggestions, connection activity and Runpod reconnection help.

### Improved

- Keep your selected agent and task draft when visiting API setup.
- Instrumental projects offer arrangement help; unsaved project edits must be saved before copying a task.

## 0.4.9 — Reconnect after a Pod change

Keep your agent connection useful when your workstation address changes.

### Added

- An offline reconnect kit containing the companion skill and persistent workstation identity, without tokens or songs.

### Improved

- Runpod skills help your agent find and verify the replacement Pod, then update its existing MCP URL while preserving the connection name and credentials.
- Reconnect instructions and the recovery download appear before installation details. A client reload may still be needed.

## 0.4.8 — Runpod skills companion

Connect creative work with Runpod infrastructure tools.

### Added

- A Runpod section with official skill setup, a downloadable Cadentrail companion, editable starter briefs and deployment guidance.
- Agents can discover the same Runpod guide through an MCP tool and resource.

### Improved

- Runpod credentials remain in the agent's separate connection; Cadentrail does not collect your Runpod API key.

### Fixed

- Integration pages fit phone widths without overflowing.

## 0.4.7 — API and agent integrations

Let compatible agents work with the same projects and queue.

### Added

- API & Integrations with connection examples, access tokens, live API reference, agent guidance and activity.
- Named access tokens with operation permissions, expiry, one-time display and revocation.
- MCP tools for projects, lyrics, music, scores, stems, visuals, exports, jobs, models and Radio.

### Improved

- Agent requests preserve project revisions and use durable identities to avoid duplicate work after a lost reply.
- Optional model downloads require permission and explicit approval of the requested models.

## 0.4.6 — Instrumentals and melody guidance

More useful music directions and a clearer assistant workflow.

### Added

- A trained Mothersuperior instrumental adapter, included in the image, with Original YuE2 available as a fallback. Unwanted vocal sounds are still possible.
- Optional experimental Hum-to-Song: record, upload or select a short melody and inspect its detected score.
- Visible New and Projects controls with search, current-project marking and archived-project access.

### Improved

- Separate Description, Lyrics and Instrumental Arrangement assistance, with independent draft review.
- Lyric language follows the requested direction and style, including Japanese/J-pop, with an explicit saved override and wrong-language retries.
- Automatic videos use audio-reactive visuals for instrumental takes instead of aligning retained unsung lyrics.
- Runtime, six model sets and application files have separate reusable Docker layers.

### Fixed

- Project switching waits for a successful save, and edited Studio scores are protected from accidental replacement.

## 0.4.5 — Clearer generation expectations

Understand what the model can guide and what can vary.

### Added

- Visible notes for takes affected by score-planning or audio-ending limits, with a reviewable Prepare new take action.

### Improved

- Rendering presets describe actual processing effort instead of promising quality. Custom Studio settings remain visible.
- Revised takes explain that a new whole-song recording is created while the original stays intact.
- Vocal direction, requested lyric language and About 3 min / About 5 min lengths explain model limitations.

## 0.4.4 — Learn as you create

An integrated handbook and optional tours of the real controls.

### Added

- Guide and F1 access to a searchable handbook covering creation, Studio, Listen, Radio, Visuals, exports and workstation care.
- Six optional workspace tours with pause, resume and replay, offered on first launch.

### Improved

- Help works in fullscreen Listen and during Radio playback, with phone-friendly contents and tour controls.

### Fixed

- Studio tour highlights remain responsive while its meters update.

## 0.4.3 — Saved stations and playback recovery

Keep station ideas and recover live listening more reliably.

### Added

- Save, load, rename, update and remove station settings without saving temporary songs.

### Improved

- Changing station direction cancels obsolete unfinished Radio work while preserving the current broadcast and crossfade.
- Returning from background or a network interruption refreshes the live position, with a Join live fallback when needed.

### Fixed

- Stale events cannot publish obsolete songs or restart an old generation direction.
- Radio continues to reject seeking and skipping through native media controls.

## 0.4.2 — Change the station while listening

Move from J-pop to classical without restarting your session.

### Added

- Adjust station changes description, vocals and lyric language during playback.
- Explicit lyric-language selection and automatic language hints from genres and descriptions.

### Improved

- Automatically join the current live station. Mute affects only local listening; Stop Radio ends the broadcast.
- New-direction music replaces unbroadcast buffered audio once ready. Written-language checks retry mismatched lyrics.

### Fixed

- Rejoining after missing songs clears expired audio decks before returning to the live position.

## 0.4.1 — Recovery and workflow reliability

Protect work and make maintenance easier.

### Added

- Unsaved-draft recovery with restore, download and explicit conflict resolution.
- Verified project backup downloads and restore as new projects.
- Workstation model management with installed/partial states, guarded optional removal and download progress.
- Mothersuperior real-audio v4, Demucs and Sortformer weights included alongside the core music models.
- Lyric timing review tools, a short video preview, export preflight and adjustable effect tails.

### Improved

- Listen publishes media metadata and controls to the operating system.
- Heavy editors load separately and Library refreshes follow relevant changes.

### Fixed

- Repeated requests after a lost response no longer create duplicate expensive jobs.
- Reauthentication preserves the loaded editor; event sockets expire with their sessions.

## 0.4.0 — Personalization and live Radio

A third way to enjoy the workstation.

### Added

- An optional welcome name stored in your browser, and matching Creation, Listen and Radio navigation.
- A live Radio station generated from your description, with fresh songs, background preparation and a four-second crossfade.
- Server-managed live timing and temporary-song cleanup; Radio music stays out of the Library and continues after closing the tab.

### Improved

- Longer composition targets and model reuse when GPU memory permits.

### Fixed

- Radio's two crossfade decks no longer interrupt each other.
- Complete songs no longer receive a false generation-length warning.

## 0.3.11 — Complete the shared interface

Carry the listening-room design through the rest of the workstation.

### Improved

- Entry and recovery screens, download prompts, dialogs, effects, automation, waveforms, files, queues and advanced tools share the same visual language.
- Phones keep advanced editing under More → Open Studio.

### Fixed

- Removed the old Studio minimum-width overflow.
- Dialogs contain keyboard focus and restore it on close. About shows the actual package version.

## 0.3.10 — One visual language

Creation and Listen feel like parts of the same product.

### Improved

- Shared logos, artwork-derived atmosphere, typography, colors and controls across Create, Studio, Visuals and Library.
- Show lyrics replaces artwork with synchronized lyrics and playback controls; Hide lyrics restores the cover on phones and desktop.
- Small-screen project actions remain scrollable and reachable.

### Fixed

- Creation navigation stays above the persistent player.
- Narrow Studio inspectors and visual editors retain their controls; short landscape layouts no longer collapse editors.

## 0.3.9 — Duet lyrics and live VRAM

Better lyric tools and useful GPU visibility.

### Added

- Selectable hybrid song alignment using Qwen recognition/alignment and a Whisper cross-check.
- Editable voice suggestions with Sortformer, named duet roles and Together lines. Automatic singer assignment still needs review.
- Left/right duet lyrics and overlapping active lines in listening and rendered videos.
- Live GPU memory, activity and temperature in place of the footer storage checker.

### Fixed

- Repeated choruses are matched in sequence instead of jumping to a later chorus.
- Manual timing edits made during alignment are preserved; new results remain in history.

## 0.3.8 — Creation and Listen

A dedicated listening room alongside the full workstation.

### Added

- Creation / Listen mode switching, large artwork, synchronized lyrics, fullscreen and a quiet artwork-only view.
- Listen has its own Library search, favorites, queue and song actions.

### Improved

- Music keeps playing through mode changes while Creation retains its project and editor state.

### Fixed

- Listening shortcuts and file drops cannot modify the hidden Creation workspace.

## 0.3.7 — Live scrolling lyrics

Follow the words from top to bottom as a song plays.

### Added

- A live lyric view with active-line centering, reliable word highlighting, timed-line seeking and Follow song.
- Edit timing opens the correct project and recording.

### Improved

- Playback uses the recording's saved lyrics and timing. Uncertain or missing timestamps stay untimed.

### Fixed

- Selecting audio in the timing editor no longer changes the video's audio source. Older alignments remain recoverable.

## 0.3.6 — Clear stale sign-in warnings

Successful sign-in clears the warning it resolved.

### Fixed

- The Sign in to your workstation alert no longer lingers after a successful login.
- Late responses from an older login attempt cannot revive a stale authentication warning.

### Improved

- Login failures stay on the sign-in form; unrelated project errors remain visible.

## 0.3.5 — Library and persistent player

Browse music and keep it playing as you work.

### Added

- Songs, Projects, Favorites, All audio and Archive views with artwork, search, sorting and downloads.
- A persistent bottom player with queue editing, seeking, volume, shuffle, repeat, favorites and Open in Studio.

### Improved

- Candidate comparison uses the same audio stream and preserves the listening position.

### Fixed

- Workspace navigation no longer stops inline listening audio.
- Studio, music listening and video previews coordinate playback; narrow-screen controls and popovers stay reachable.

## 0.3.4 — Optional password and access guidance

Start without a shared password and set your own when needed.

### Added

- Open access by default for fresh installations, with a Runpod password-setup guide and a clear access notice.

### Improved

- A configured password protects private APIs, media, exports and job events as well as the interface.

### Fixed

- Unicode passwords and malformed sign-in requests are handled correctly.
- Private responses avoid shared caching, and Windows line endings no longer break the Linux launcher.

## 0.3.3 — Accurate storage and job progress

Show the storage assigned to the workstation.

### Fixed

- Storage accounting uses actual application files and the configured volume allowance instead of the shared host's free space.
- Hard-linked cache files are counted once and incomplete scans are identified.
- Stem separation clears download progress and reports its real processing stages.

## 0.3.2 — Protect project edits and video timing

Keep late background responses from replacing current work.

### Fixed

- Out-of-order project and asset responses cannot overwrite a newer selection, revision or editing gesture.
- Reopening after a failed save preserves unsaved changes.
- Automatic video checks changed lyrics and overlapping timing before reusing synchronization.
- Truncated Demucs files are not reported as installed, and video retries use the original saved job settings.

## 0.3.1 — Required music models included

Load the core engine directly from the Docker image.

### Added

- YuE2 and its required VAE weights are bundled at verified revisions outside the persistent volume.

### Improved

- An empty persistent cache can resolve the required music models offline. Other model weights remain optional downloads for this release.

## 0.3.0 — Meet Cadentrail

An independent identity: a DAW for YuE2, created by Madiator2011 and built for Runpod.

### Improved

- Cadentrail branding across the browser, application, sign-in, Library, About, packages and Runpod template.
- The rename retains project storage, caches, settings and API paths without converting or duplicating projects.

## 0.2.1 — Guided creation

A focused route from a musical idea to choosing a take.

### Added

- Sound → Words → Performance → Listen, with direct step navigation, a song recap and remembered project progress.

### Improved

- Short directional transitions respect reduced motion. Opening Studio keeps the same project.
- An open lyric draft survives moving between creation steps; generation advances only after the queue accepts it.

## 0.2.0 — Create, Studio and Visuals

A simpler starting experience over the existing music workstation.

### Added

- Simple creation and full Studio views of the same project.
- A writing room with selectable lyric assistance models and reviewable drafts.
- Project-linked artwork, cover design, lyric timing correction, video scenes and automatic music videos.
- Named queue progress and a searchable project file finder.

### Improved

- Visuals use actual audio analysis and server rendering. Unreliable lyric timing produces an identified visualizer instead of invented karaoke timing.
- Existing scores, arrangements, mixes, generation history and original media remain available.

## 0.1.0 — The first workstation

The original browser DAW, released under the working title YuE2 Studio.

### Added

- YuE2 generation, candidate history, persistent projects and a generation queue.
- Multitrack arrangement, piano roll, chord and ABC score editing, MIDI import/export and composition instruments.
- Waveform editing, analysis, mixing, effects, volume/pan automation, stems and audio export.
