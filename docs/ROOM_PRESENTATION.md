# Playing-room presentation upgrade

Fatal Figures **1.0.0**, in the existing repository. This is a presentation change:
no server, rule-engine, database schema, protocol, production timer, scoring,
practice strategy or replay format changed. The landing markup and its desktop /
phone screenshots remain identical. No new dependencies, hosting or cloud data
changes are involved.

## Room and state

The oval table, perspective floor, light cones, geometric avatars and sealed cards
are CSS/SVG. Seats use the **original match roster**, keyed by seat UUID; changing
phase rankings never changes a player's position. Every eliminated seat remains,
with its final phase score, dimmed avatar and extinguished light. Each surviving
seat shows its current phase total. The compact scoreboard explicitly separates
starting handicap, deductions from main rounds and phase total, retaining the last
completed phase for eliminated seats.

The timer and scoreboard are outside the dimmed scene, in a sticky dashboard.
Only `RoomClock` subscribes to the 200ms display timer. The memoized scene has no
countdown subscription and stable seat keys. Number-input changes affect only the
entry dialog; they do not pass private values into the scene or scoreboard.

Central dialogs cover briefings, private entry, own locked receipt, simultaneous
reveal, tiebreak participation/watching, elimination and final outcomes. Rules and
the circle tutorial also use the local room dialog during play, keeping authority
information visible. Dialogs support Escape, focus trapping/restoration, native
number validation and touch scrolling on short screens. Dismissing a dialog never
pauses the game. Lock acknowledgement closes entry immediately; a read-only own
receipt can be reopened before reveal. When everyone locks, the server may reveal
immediately instead of holding a cosmetic sealed-card screen.

`latestRevealed` derives from resolved main/tiebreak records only. Its separate
panel keeps the most recent result until a newer result arrives, labelled with
its exact phase and main-round number or tiebreak. It remains available while the
next private round or new phase is choosing. Details reuse the existing exact
calculation/deduction display. On phones the result is below the scene rather
than a floating panel over number-entry controls.

## Effects and reconnects

Live public changes trigger short card arrivals, flips, winner/target glow, score
highlights and a fading eliminated spotlight. Effects finish in at most 650ms;
no `animationend`, audio completion, client-ready acknowledgement or waiting gate
can authorize or postpone a game action. Server deadlines remain authoritative.
Reduced motion disables animation/transition and uses the same immediate state.

A reconnect, full snapshot resync, page refresh or return from a hidden tab starts
from a quiet baseline. It does not replay missed card flips, eliminations, audio
or the circle tutorial. The current dialog, seat status and authoritative result
are rendered immediately. There is no reconstruction of private opponent inputs.

## Optional synthesized audio

No music files, show assets, external audio service or additional license is
required. Web Audio oscillators and gain envelopes produce original short lock,
reveal, elimination/champion cues and a quiet optional intermission pulse.

Sound starts muted unless the player previously enabled it. Browser context
creation/resume occurs through user gestures, never as a prerequisite for sending
a number. Mute, volume (0–100%) and an intermission-suspense checkbox are available;
preferences contain no identity or secret game data. Suspense begins only on a new
live intermission, is bounded by its existing deadline, and stops on stage change,
disconnection, hiding the tab, muting or leaving the room. Enabling it midway does
not replay the missed beginning. Failed or missing Web Audio reports that audio
is unavailable and leaves gameplay usable. No microphone permission is requested.

## Components

- `web/main.tsx`: existing transport/session orchestration, unchanged landing and
  lobby; passes public snapshot plus the seat's own receipt to the room.
- `web/presentation.tsx`: existing rules, circle tutorial, reveal calculations and
  replay views, extracted without changing their content or replay semantics.
- `web/room/MatchRoom.tsx`: current-stage dialogs and live-only effect baseline.
- `RoomScene.tsx`: memoized oval room and stable seats; public revealed cards only.
- `RoomClock.tsx`: isolated display countdown, with no authority over submissions.
- `RoomPanels.tsx`: compact scoreboard, retained result and audio controls.
- `RoomDialog.tsx`: local dialog focus, close and short-screen scroll handling.
- `audio.ts`, `model.ts`, `room.css`: optional sound, public view derivations and
  styles scoped to the playing room.

## Verification and screenshots

The existing 47 engine, PostgreSQL, real-Socket.IO-client and process-restart
checks remain applicable. The browser suite now has **10 scenarios**:

- Existing desktop/phone, five-session Chromium/Firefox ladder and computer-play
  completion tests, updated for the local room dialogs and closed-entry behaviour.
- Separate friend-room starts at 2, 3, 4 and 5 seats. Each checks sealed public
  payloads, own receipt, disconnect/rejoin, refresh with the same deadline, no
  missed effects, stable seat positions and retention of round 1 during round 2.
- A DOM mutation observer verifies zero mutations inside the scene while its
  independent countdown runs. The full ladder retains five seats, four dimmed
  eliminated avatars, extinguished lights, champion, replay and fresh rematch.
- Phone/touch layout at 390×844, reduced motion, a visible scoreboard/timer outside
  the blur, controls clear of the sticky dashboard, and missing Web Audio.
- Gesture-enabled real Web Audio oscillator scheduling, volume, mute, optional
  intermission pulses, and a rejected `resume()` permission path with successful
  lock afterwards.

Browser-only fixture timers are now 12s choosing / 2s reveal / .7s intermission,
1.2s briefing, 1.5s elimination, and 9s + 1.5s tiebreak, to allow UI inspection.
These are confined to the isolated `*_test` browser database and test entrypoint.
**Production is still 90 / 20 / 10 seconds, with the same original phase budget.**

Room screenshots 04–06 and 08–10 show updated dialogs. Additional views:

- [Revealed oval table](screenshots/14-oval-table-revealed.png)
- [Phone entry](screenshots/15-oval-room-phone-entry.png)
- [Phone sealed table](screenshots/16-oval-room-phone-sealed.png)
- [Champion with retained eliminated seats](screenshots/17-fixed-seats-champion.png)

Automated audio checks exercise real browser synthesis APIs and failure handling;
physical speaker/headphone loudness and a physical phone keyboard are not claimed.
Phone checks use touch emulation. Hosting remains a manual review/deployment step.
