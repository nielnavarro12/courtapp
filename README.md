# Court Queue

Match queue for badminton / pickleball with a TV display.

## Run

```bash
npm install
npm run dev
```

- Control page: http://localhost:5173/
- TV display:   http://localhost:5173/tv  (open in a second window or on the TV screen, then click "Tap to start")

## How it works

1. Add players (comma separated). 
2. Press **Call match** on a free court: 4 players are drawn and split into two random pairs.
3. The TV shows the "Now calling" screen (with voice), then the pickleball court with the players.
4. When the match ends, press the winning pair: the TV shows the congratulations screen,
   and (with auto-call on) the next match is called on that court.

Matchup modes: next 4 in line, random 4, or winners with winners / losers with losers.

## Pages

| Route | What it does |
|---|---|
| `/` | Dashboard: courts right now, stats, and the next 14 days of rentals and open play |
| `/queue` | Run the queue: add players, call matches, pick winners |
| `/rentals` | Book a court: pick court, date and time slots, see a day timeline, cancel rentals |
| `/open-play` | Schedule open play sessions (optionally repeating weekly) |
| `/ads` | TV & ads: header title, ad playlist (video / image / YouTube), scrolling announcements |
| `/tv` | TV display (no navigation) |

## TV layout

```
+-----------------------------------------------+
| Header (club name, clock, players waiting)    |
+--------------+--------------------------------+
| Ads panel    |  Courts (vertical) + Up next   |
| (video,      |  (alternates with the open     |
|  images)     |   play schedule)               |
+--------------+--------------------------------+
| Scrolling announcements                       |
+-----------------------------------------------+
```

Manage the ads on the **TV & ads** page. To use your own video files, copy them into `public/ads/` and add
`/ads/yourfile.mp4` to the playlist (portrait videos fit the panel best). With no ads the courts use the full width;
with no announcements the bottom bar is hidden.

## Rentals

Rentals are bookings for one court on one date from a start to an end time (30-minute slots, 06:00 to 22:00;
change `OPEN_MIN` / `CLOSE_MIN` / `SLOT` in `CourtQueue.jsx`). Overlapping bookings on the same court are rejected.
While a rental is active the court is skipped by the queue and the TV shows **RENTED** with the hours and
renter name. A free court with a rental later today shows "Rented from ..." on the TV.

## Open play schedule

On the control page, add sessions (date, start and end time, sport, level, optional note).
The TV alternates between the court board (25 s) and the Open Play Schedule (12 s) while there are
upcoming sessions. Past sessions disappear from the TV automatically. Untick **Show schedule on TV**
to keep the court board on screen all the time.

## Syncing control and TV

State is saved in localStorage and synced with `BroadcastChannel`, so the control page and the TV
page must be open in the **same browser** (e.g. a laptop with the TV as a second screen).

To drive a TV on a **different device**, replace the persistence/listener code inside
`useCourtStore()` in `src/court-queue/CourtQueue.jsx` with your backend (WebSocket, Firebase,
Supabase realtime...). The rest of the app does not change.

## Build

```bash
npm run build     # outputs to dist/
npm run preview
```
