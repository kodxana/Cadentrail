# Radio and personalization

Cadentrail 0.4.0 adds Radio next to Creation and Listen. The welcome screen asks for an optional name and offers Creation, Listen, Radio or Open Studio. Your name stays in this browser; it is never sent to the music or lyric models. Use the person button to change or clear it. Existing users see this welcome once. Existing projects do not need conversion.

## Using Radio

1. Describe your station: genres, mood, instruments, language or stories.
2. Choose Vocal direction, Lyric language, a Lyric writer, Rendering preset and Target song length. About 5 min is the default, requesting developed verses, a bridge and a full ending. About 3 min is the shorter option. These guide composition; they do not crop or repeat audio and exact lengths are not guaranteed. Optional writer downloads use the usual named-model consent dialog.
3. Start the station. It takes time to write and generate the first song. If autoplay is blocked, choose Join live.
4. Listen to the broadcast. The next song is generated in the background and fades in over the outgoing song's last four seconds. Controls are volume, mute and Stop Radio. Join live appears only when audio needs a browser gesture or reconnection. Progress is read-only. Radio has no lyrics display, skip or seek; native seek/skip actions are ignored too.
5. Leave Radio, refresh or close the tab whenever you want. The station keeps generating and advancing on the server. Reopen Radio to join the current song at its live position. There is no pause control; mute leaves both the audio clock and the broadcast moving. **Stop Radio** ends the station and cancels its current generation.

One station runs per workstation. Other authenticated browsers can join the same live session. Any authenticated workstation user can adjust or stop it; this remains a personal workstation, not a multi-user broadcast platform. A failed song pauses further generation until Retry. A ready song keeps its original broadcast schedule. Invalid or repeated lyric drafts receive at most three attempts before failure is shown.

## Adjust a live station (0.4.3)

Open **Adjust station** during playback, edit the music description, vocals and lyric language, then choose **Apply direction**. The live session and current song are preserved. For example, choose Classical after starting with J-pop. Automatic vocals follows the genre: plain classical orchestral requests become instrumental, while choir/opera or an explicit singer choice retain vocals. J-pop, Classical and Jazz shortcuts fill editable directions. New music prepares even if the buffer is full; previous unplayed audio stays available as a fallback until the new direction is ready, then it is replaced. A crossfade that has already started is allowed to finish. A queued-direction message stays visible until that direction reaches the broadcast. A song's writing and rendering use one immutable direction snapshot, even if you edit the station mid-generation. Changing direction stops the unfinished writer or music process assigned to the obsolete Radio task. Partial output is removed before work starts on the new direction; stale output cannot become a track. The currently playing audio, completed fallback audio, idle cached models and Creation/export jobs are preserved. The status distinguishes preparation, a ready upcoming direction and the direction currently on air.

Concurrent tabs use a station revision. A stale edit is rejected for review; a repeated identical request does not change the clock or enqueue duplicate work. No model downloads are triggered by changing the description or language.

Radio checks for the current session even while the setup page is open and joins a station started in another tab automatically. It also rejoins after foregrounding or a page return. Browser autoplay restrictions still apply: if sound cannot start automatically, **Join live** enables it at the live position. Space and native pause actions mute; they do not freeze playback. Native play unmutes and rejoins live. Leaving Radio releases local audio ownership without stopping the server session.

## Saved stations (0.4.3)

Open **Saved stations** in Radio setup or during playback. Save the current direction with a name, then load, rename, replace its settings or remove it later. A saved station includes description, lyric writer, vocals, language, quality and length. Loading fills a reviewable setup or opens Adjust station; choose Start or Apply direction to generate music. Any required writer download still needs the usual confirmation.

Saved stations are small records in the existing workstation SQLite database. They survive restarts with the same persistent volume and are shared by authenticated browsers. Concurrent edits use revisions; an outdated edit asks you to reload. Removing a saved station does not stop a broadcast. Audio, generated lyrics and download approvals are never included. Project-only portable backups do not include these workstation-level presets yet.

## Playback recovery (0.4.3)

Returning from background, going online again or using native Play first refreshes the server's live snapshot. The player then joins the current broadcast position. A connection notice offers Reconnect while already buffered audio can continue. Superseded fetches and delayed playback attempts cannot restore obsolete tracks. Audio time events supplement timer-driven crossfades; interrupted audio has bounded resume attempts and a Join live fallback.

Native pause mutes while the broadcast continues; the OS reports paused while muted so it can offer Play to rejoin. Radio still has no pause, skip or seek controls. Phone controls use touch-sized targets and safe-area spacing. Browser emulation covers touch layout and reconnection. Background playback depends on the device and operating system. See [Android playback troubleshooting](ANDROID-PLAYBACK.md).

## Lyric language (0.4.2)

Select an explicit language to override genre hints. **From station description** recognizes named languages and common J-pop/J-rock/K-pop cues; Japanese-script descriptions also select Japanese. An explicit phrase such as “English lyrics” takes precedence over a Japanese genre. With no recognized language cue, it uses English. The resolved language is shown as Requested lyrics on the live station. This describes the request; it does not verify the language or pronunciation in the audio.

The chosen language is instructed in both the Qwen writer and YuE2 generation prompt. Japanese uses native script rather than romaji. Draft length/repetition checks handle unspaced Japanese and Chinese. A small bundled CPU language detector checks the written lyrics; a mismatched or low-confidence draft is rewritten, at most three attempts, before audio generation. Recognition is probabilistic and does not prove sung pronunciation; difficult language cases may need a larger writer or revised description. Intentional bilingual songs are outside this single-language mode.

## Temporary by design

Radio never writes projects, Library assets or durable generation jobs. Session settings and the twelve most recent lyric drafts live in server memory. `DAW_STORAGE/temp/radio` contains the current song, one upcoming song (briefly two during an already-started crossfade after a direction change) and temporary artifacts for the active generation. Raw artifacts are removed after rendering. Playback FLACs are removed when their broadcast ends. Stop removes the station directory; OS-held files are retried during cleanup.

There is no browser lease or inactivity timeout. Generation continues while all tabs are closed and consumes GPU compute until stopped. An application/Pod restart ends the temporary station; startup removes its old temporary directories only after acquiring the existing worker lock. Persistent projects and optional model caches on `/workspace` are unaffected. Radio is excluded from project history, portable exports and the Library.

Station APIs and audio use the existing authentication and same-origin write protection. Audio supports byte ranges for browser streaming, with `private, no-store` caching. There is no skip/advance API. The server clock controls track retirement and the four-second overlap; a browser cannot advance the station timeline.

## Shared engine and GPU memory

The established GPU worker checks durable Creation jobs before Radio work. It fills a bounded two-song buffer rather than spawning another music worker. Creation gets priority between songs; CPU exports retain their separate lane. Starting a normal GPU job releases the optional resident Radio writer.

The selected Qwen writer produces a new title, musical direction and complete lyrics. Recent titles and strongly overlapping lyrics are rejected. YuE2 uses the existing bundled core models, full score planning and 32 acoustic steps for Standard or 48 for Extended. These describe rendering effort; more steps do not guarantee a better song. Audio stays 48 kHz FLAC. Original creation settings and project data are untouched.

On a sufficiently free 24 GB GPU, Radio keeps Qwen3 1.7B or 4B resident and reuses the loaded YuE2 engine. YuE2 retains its built-in stage offloading: it moves the music model to CPU for audio decoding and returns it to GPU for the next composition, without reloading the weights from disk. It checks device-wide free VRAM before and after loading the writer. The 8B writer, smaller GPUs or a busy device use sequential loading. A GPU-memory failure releases the writer and retries the same music request once without shared residency. This is adaptive caching, not a promise that every model combination fits 24 GB. Stop unloads the lyric writer; the normal worker may retain YuE2 for subsequent creation work.

The browser has two streaming audio decks connected to Web Audio gains. Equal-power curves blend them without pausing either deck. The shared playback coordinator prevents overlap with Library/Studio/preview audio. Native media controls follow the live Radio rules and are released when leaving the screen.

## Practical limits

Songs must finish rendering before they can be heard. Generation is not guaranteed to keep up with playback on every GPU, prompt or quality setting; a slow next song or queued Creation work can cause a gap. Radio shows the actual generation stage and progress instead of pretending audio is ready. Web Audio scheduling makes active-tab fades smooth; a suspended browser may need to rejoin the live position when foregrounded.

Long-song targets and vocalist/genre guidance remain model instructions. Recent-lyric checks reduce repetition but do not guarantee worldwide originality, perfect vocal casting or uniqueness forever. Use Creation for songs you intend to keep. Device background-audio behavior, sung-language accuracy and long-session musical variety are not guaranteed.
