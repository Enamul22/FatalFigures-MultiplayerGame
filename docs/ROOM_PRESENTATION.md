# Playing-room refinements

Fatal Figures **1.0.0**, in **Enamul22/FatalFigures-MultiplayerGame**. The landing page, scoring rules, privacy protocol, database schema, practice strategies and replay format are unchanged. The only game-pacing change is immediate final completion, described below. No new runtime dependencies, cloud resources or deployment are involved.

## A table-first interface

The CSS/SVG oval room fills the available width. Brighter, larger geometric avatars have distinct accent colours. Shorter desktop windows fit the complete table beneath the timer. Every original match seat is keyed by its UUID and stays in position through elimination. Eliminated seats retain their last phase score, dim their avatar and extinguish their light.

Each avatar has two equally prominent cards: **FIGURE** on the left and a contrasting **PHASE TOTAL** on the right. A current choosing window shows a blank or sealed figure card, never an old revealed number. Private choices never enter the scene props or public DOM. Cards reveal only server-resolved records; timeout and winner labels remain explicit. The table centre retains the latest target or Circle winner with its phase/round or tiebreak label. During a new input window this is explicitly labelled **PREVIOUS RESULT**.

There is no permanent ledger or separate latest-results panel. **Calculation & scoring details** opens a local dialog with starting handicaps, round deductions, totals, the latest exact calculation and tie commitment. **History & replay** remains available. This keeps optional detail accessible without another persistent results table.

The timer, phase/round heading and audio controls sit above the room in an unblurred sticky dashboard. Only `RoomClock` subscribes to a 200ms display timer; the memoized scene has no countdown subscription. Phone layouts retain readable paired cards, names, YOU/BOT tags and statuses, with scrolling instead of panels covering input controls.

Central dialogs cover briefings, private entry, own receipt, reveals, tiebreaks, elimination, champion, rules and optional details. They support Escape, keyboard focus trapping/restoration and scrolling on short screens. A visible **Leave room** button has a 44px minimum touch target and an active-match confirmation.

## Submission and reconnection

A successful committed-lock acknowledgement closes private entry automatically. An authoritative public locked status is also proof of commitment. Neither requires a close-button click. Ordinary updates keep entry closed for the same round; the next eligible round opens a fresh entry window. Players can reopen only their own read-only locked receipt.

Server rejection leaves input editable and shows an error beside the controls. An acknowledgement timeout reports uncertainty and offers **Sync committed choice**, rather than inventing a receipt. Disconnected entry is disabled; resume/sync retrieves the actual stored choice. A final lock may immediately replace entry with the simultaneous reveal or champion dialog because the server has already resolved the round.

Live public changes trigger short card arrival/flip, score/target/winner highlights and fading eliminated light. They finish in at most 650ms. Reduced motion disables them. Reconnect, refresh, resync and return from a hidden tab start from a quiet effects baseline; missed effects and input cues are not replayed. Nothing waits for an animation or audio callback to submit or advance play.

## Continuous licensed audio

The local background asset is **Dark Things Loop** by **iamoneabe**, explicitly released under **CC0 1.0**. See the [source, licence, voluntary credit, checksum and local legal code](../web/public/audio/README.md). No track is hotlinked. Original synthesized cues remain for input opening, lock, reveal, elimination and champion.

Sound starts muted unless previously enabled. A user gesture creates/resumes the audio context. One looping media element plays quietly throughout every active-match stage, including choosing, waiting, reveal and intermission. There is no per-snapshot or per-phase track recreation, position reset or track stacking. A gain envelope fades in the bed; master volume changes are smoothed. Mute and an independent **Background music** switch pause the bed at its current position. Leaving, ending the match or hiding the tab stops/pauses it appropriately. Reconnecting does not change stored volume or start another track.

A distinctive two-note cue plays when a new eligible input window opens live. Spectators, eliminated/withdrawn seats and nonparticipants in a tiebreak receive no input cue. Initial refresh/resume does not replay it. Audio API absence, blocked resume/play or file failure reports an unavailable/enable-audio state while gameplay continues. No microphone permission is requested, and no game action awaits audio.

## Immediate final completion

The server resolves all three main rounds with the unchanged exact scoring and performance comparison. If the final main round establishes a unique loser, its resolved choices, elimination, champion, final timestamp and finished status are committed in the same transaction. There is no final reveal timer, intermission or phase-end wait before the champion announcement.

If the main final remains tied, its reveal still completes normally before the required tiebreak opens; the redundant intermission is skipped. When that tiebreak resolves, the existing exact comparison and, only if necessary, committed fallback draw complete in the same transaction as the champion. The champion dialog includes those final revealed choices and outcome. No champion is inferred prematurely in the client.

Earlier phases retain their normal timing. Production choosing windows remain 90s main / 30s tie, with 20s main reveals, 10s intermissions, 15s briefings and 10s earlier-phase elimination screens; earlier ties retain their 15s reveal. The all-timeout/tied-final ceiling is now **28m05s** for five starters (35s less), within the unchanged 30-minute watchdog. Completed state, history and independently verifiable replay survive refresh/reconnect.

## Verification and screenshots

Local build and **50 engine/database/transport/restart tests** passed. The browser suite has **14 scenarios**, covering:

- Desktop and 390×844 phone/touch layouts, native validation, keyboard/modal focus, reduced motion, visible timer and controls clear of the sticky dashboard.
- Friend starts at 2, 3, 4 and 5 seats, own private receipts, public choice secrecy, fixed seats, disconnect/rejoin, refresh without deadline extensions or replayed effects, previous-result labels and optional calculation details.
- Zero scene DOM mutations during isolated countdown ticks; full five-session Chromium/Firefox ladder, spectator/elimination states, extinguished lights, replay and rematch; completed computer play.
- Actual local media playback advancing across stages without restarts, real synthesized cues, volume/mute, background toggle, reconnect without new track objects, stop on leave, missing AudioContext, rejected browser resume and failed local media loading.
- Ordinary and tied/drawn finals (also while help/details are open): the first authoritative snapshot after the decisive lock is finished, with final figures; refresh retains champion and replay; the current host can open a rematch.
- A transport-corrupted choice rejected by the real server leaves editable input; retry closes it. Lost lock acknowledgement plus withheld snapshots reports uncertainty; sync recovers the actual committed result. Leave confirmation can be cancelled or accepted.

All browser fixture timers and data are isolated to the game-only `*_test` database. The engine suite uses the production timing constants. The seeded 4,000-match simulation and replay verification were rerun after the final timing change.

Updated views:

- [Revealed table](screenshots/14-oval-table-revealed.png)
- [Phone entry](screenshots/15-oval-room-phone-entry.png)
- [Phone sealed table](screenshots/16-oval-room-phone-sealed.png)
- [Champion with retained seats](screenshots/17-fixed-seats-champion.png)
- [Champion dialog and final choices](screenshots/10-results-desktop.png)

Screenshots were visually inspected, and a production-timed five-seat computer room was reviewed in Chrome. Phone checks use touch emulation; physical phone keyboards and speaker/headphone loudness are not claimed. No hosting deployment was performed.
