# Android / Chrome playback

Use the Runpod HTTPS address in Chrome. Android battery settings and browser background suspension can affect continuous playback. The app cannot override operating-system limits.

## Troubleshooting checks

Use the HTTPS Runpod workstation in Chrome. Note the phone model, Android version and Chrome version; do not include your password or private lyrics in a report.

1. Start a temporary Radio station and wait for music. Lock the phone for one full song transition. Music should continue if Android permits background playback; if interrupted, returning to Radio should join the current live song without replaying an expired track.
2. Use the lock-screen or headset pause action. Audio should mute while the broadcast continues. Play should unmute and join live. Seeking/skipping must not move the station clock.
3. Switch to another app and return after a song transition. Check the current title and live progress; there should be no stale audio or two workspaces playing together.
4. Briefly disable connectivity, then restore it. Buffered audio may continue. Radio should clear its connection message and recover to the current live position, or show a usable Join live action if Chrome requires a tap.
5. Connect/disconnect Bluetooth headphones, then test an incoming call/audio interruption. Check that there is a usable recovery path and that sound does not restart at an old track position.
6. Rotate portrait/landscape, open Saved stations and edit a name with the keyboard visible. Confirm controls remain reachable and there is no horizontal page overflow.
7. Stop Radio in the app. Confirm the server station ends. Closing the tab alone must not stop the server station.

Record each case as pass/fail with the visible symptom and whether Join live recovered it. Android battery settings, network conditions and browser background suspension can affect uninterrupted playback. The application cannot override the operating system's background limits.

## Implementation references

The recovery behavior follows [Web Audio context states](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) and [Media Session playback state](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/playbackState). Optional AudioSession support is feature-detected; core playback does not require it.
