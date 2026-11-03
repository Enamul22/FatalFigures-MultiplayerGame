# At the table

Choose a whole number from **0–100**. Lock it before the shared countdown ends.
A successful lock is a durable, final choice. You see your own figure; everyone
else sees only a lock indicator until all figures reveal together. Refresh in the
same tab restores your seat. The clock continues through disconnects.

## The four phases

Begin at the rule for the actual player count. Three main rounds, then exactly
one elimination, then a new rule. Two-player rooms begin with the circle tutorial.

| Seats                | Rule                                  | Worked example                               |
| -------------------- | ------------------------------------- | -------------------------------------------- |
| 5 · The Crowd        | Mean × 4/5                            | 20, 35, 40, 50, 80: average 45, target 36    |
| 4 · The Balance      | Median × 9/10                         | 10, 30, 70, 90: middle average 50, target 45 |
| 3 · The Extremes     | (min + max)/2 × 7/10                  | 10, 35, 90: midpoint 50, target 35           |
| 2 · The Final Circle | Next 50 clockwise lose to your number | 0 beats 34; 34 beats 68; 68 beats 0          |

A target uses **all timely submitted numbers**, including duplicates. Missing
numbers do not become zero. Even medians average the middle two submissions.
The exact fraction chooses winners; the rounded display does not.

## Deductions and precedence

In statistical phases, a valid unique figure loses one point for every eligible
player strictly closer to the target. Shared distances share competition rank.
For example, with three distinct picks 15, 55, 85 in The Extremes, target 35:
15 and 55 each lose zero; 85 loses two. There is no join-order tiebreak.

Apply these cases in this order before multiplying by **1, 1, 2** for rounds 1–3:

1. No submissions: everyone times out; no target/winner.
2. One submission: that seat wins by forfeit with zero loss and no target/distance.
3. Statistical collisions: each duplicated pick is ineligible and loses active
   seats minus one. Duplicates still affect the target. No extra surcharge.
4. Remaining statistical picks: competition-rank loss. One eligible unique pick
   among collisions wins normally. All collisions means no eligible winner.
5. Timeout: lose active seats, worse than any ordinary loss.

In the circle, equal picks draw with zero deduction. A winner loses zero, loser
one, timeout two. A timely player wins by forfeit if the opponent misses. Both
missing means both time out. Statistical collision invalidation does not apply.
Round 3 doubles every deduction, including timeout/duplicate penalties.

## Fresh handicaps, not accumulated lives

First phase: all start at zero. Later phases: best surviving performance starts at
0, second at −1, third −2, fourth −3. This applies **once**, replacing all previous
numerical losses. Phase total = starting handicap + three main-round deductions.
There is no −10 life threshold and never several eliminations at once.

Rank by higher phase total, then lower multiplier-weighted exact accuracy cost
for statistical phases; circle secondary rank uses more main-round wins. Accuracy
uses real target distance for valid normal picks, administrative 101 for duplicate
or timeout, and administrative zero for a sole forfeit winner. The last two are
not displayed as measured distances. Truly tied survivors share competition-rank
handicaps: two tied best and a third worse start **0, 0, −2**. Tiebreak-only choices
do not invent new survivor performance differences. A better semifinal survivor
normally starts the final at 0 against −1.

## Bounded bottom ties

Only players tied for the worst main-phase performance enter one tiebreak. It
uses the same phase formula over those participants; a final uses the circle.
Earlier-phase tiebreaks have a single 45-second budget: 30 choose + 15 reveal.
A final tiebreak announces the champion as soon as its result is resolved and committed.
Rank its loss, then true accuracy (or circle wins). It does not alter phase totals.

If still tied, draw **only among the still-tied candidates**. A secret independent
phase seed was committed before choices. After elimination the seed is revealed;
SHA-256, stable seat ordering and rejection sampling make the draw reproducible.
History offers a verification download. This checks the announced fallback;
it does not remove the need to trust the server operator.

## Timing and outcomes

90 seconds choosing + 20 reveal + 10 score/intermission per main round; locks may
reveal early. Each phase has a 15-second rule briefing and 10-second elimination
screen in earlier phases. The decisive final reveal immediately commits and
announces the champion, including any required tiebreak/fallback result; there is
no redundant final intermission or elimination screen. A tied main final still
reveals before the required tiebreak. Four phases + four possible tiebreaks now
fit within **28m05s** for five starters.
No host pause, reconnect extension or animation acknowledgement gate exists.

If everyone leaves, a room records Abandoned after 60 seconds. Infrastructure
failure can record Interrupted, preserving acknowledged choices and resolved
history without awarding a made-up champion. The 30-minute hard watchdog also
interrupts a broken match. Practice is labelled separately from human matches.

## Replay and another round

Eliminated players watch revealed action and cannot submit. The replay shows
figures, formula/target, distances, collisions/timeouts, deductions, handicaps,
phase ranks, tiebreaks, commitments and eliminations. Download it before closing
your tab. The host opens a new lobby for a rematch; humans opt in by readying again.
New match ID, all initial scores zero, old history preserved.
