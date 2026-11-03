# Local game audio and licence

Background music: **Dark Things Loop**, by **iamoneabe**, published June 30, 2022.

- Author’s source page: https://opengameart.org/content/dark-things-loop
- Original MP3: https://opengameart.org/sites/default/files/dark_things_loop_0.mp3
- Author’s profile: https://opengameart.org/users/iamoneabe
- Licence: **CC0 1.0 Universal**, explicitly linked on the source page.
- Licence terms: https://creativecommons.org/publicdomain/zero/1.0/
- Legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode
- A local copy of the legal code is included as `CC0-1.0.txt`.
- Retrieved and licence verified: November 3, 2026.
- Local file: `dark-things-loop.mp3` (original bytes; no edits).
- SHA-256: `ddbab80963268c0d118abed143db95950bd552fc58e36412b1eb7ff5b7ae70e4`.

CC0 permits copying, modification, distribution and performance, including commercial use, without asking permission. No attribution is required. We voluntarily credit the author here; this does not imply endorsement. The source page also identifies credit as optional. The track is served from this repository’s own `/audio/` directory, never hotlinked. Its licence is independent of the application’s MIT licence.

The background loop is played quietly through a single media element and Web Audio gain, preserving playback position during state updates and reconnects. There is one track throughout all active match stages. Mute, volume and an independent Background music switch are available above the table. Sound must be enabled by a user gesture; autoplay denial, missing APIs and file errors do not affect gameplay. Leaving the room or finishing the match stops the loop. Hiding the tab pauses it at its current position.

Short input-window, lock, reveal, elimination and champion cues are original synthesized oscillator sounds implemented in `web/room/audio.ts`; no externally sourced cue files are used. They are covered by the application’s MIT licence.
