import { useCallback, useEffect, useRef, useState } from "react";
import { AdPanel, Ticker } from "./TvAds.jsx";
import "./courtQueue.css";

const banner = "./images/profile.jpg";
/* =====================================================================
   State + sync
   The control page writes; the TV page listens. Sync uses localStorage +
   BroadcastChannel, so it works across tabs/windows on the SAME browser
   (e.g. laptop with the TV as a second screen). For a TV on another
   device, replace `persist` / the listeners in useCourtStore with your
   backend (WebSocket, Firebase, Supabase realtime...). Nothing else changes.
   ===================================================================== */
const KEY = "court-queue-state-v1";
const CHANNEL = "court-queue";

const initial = {
  q: [], // waiting players: { n: name, r?: 'W' | 'L' }
  courts: [
    { n: 1, m: null },
    { n: 2, m: null },
  ], // m: { p1: [a, b], p2: [c, d] }
  ev: null, // last announcement: { id, type: 'call' | 'win', ... }
  sport: "Pickleball",
  voice: true,
  auto: true,
  rejoin: true,
  mode: "fifo", // fifo | rand | wl
  bookings: [], // court rentals: { id, court, date, start, end, name, note }
  schedule: [], // open play sessions: { id, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', sport, level, note }
  rotate: true, // TV alternates between the court board and the schedule
  ads: [], // TV ad playlist: { id, type: 'video' | 'youtube' | 'image', url, title, seconds }
  announcements: [], // TV scrolling messages: { id, text }
  adsOn: true,
  adsPct: 30, // width of the ads panel, % of the screen
  adFill: false, // crop ads to fill the panel instead of fitting inside it
  adSound: false,
  tickerSpeed: 12,
  club: "", // optional TV header title
};

const shuffle = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

const load = () => {
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return initial;
  }
};

export function useCourtStore() {
  const [state, setState] = useState(load);
  const ref = useRef(state);
  const chan = useRef(null);

  useEffect(() => {
    chan.current = new BroadcastChannel(CHANNEL);
    const apply = (next) => {
      ref.current = next;
      setState(next);
    };
    chan.current.onmessage = (e) => apply(e.data);
    const onStorage = (e) =>
      e.key === KEY && e.newValue && apply(JSON.parse(e.newValue));
    window.addEventListener("storage", onStorage);
    return () => {
      chan.current.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // update(fn): fn receives the latest state and returns the next one.
  const update = useCallback((fn) => {
    const next = fn(ref.current);
    if (next === ref.current) return;
    ref.current = next;
    setState(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    chan.current?.postMessage(next);
  }, []);

  return [state, update];
}

/* =====================================================================
   Match logic (pure functions: state in, state out)
   ===================================================================== */
const pick = (s) => {
  const idx = s.q.map((_, i) => i);
  if (s.mode === "rand") return shuffle(idx).slice(0, 4);
  if (s.mode === "wl") {
    const t = s.q[0]?.r;
    const group = idx.filter((i) => !t || !s.q[i].r || s.q[i].r === t);
    if (group.length >= 4) return group.slice(0, 4);
  }
  return idx.slice(0, 4);
};

const setCourt = (s, ci, m) =>
  s.courts.map((c, i) => (i === ci ? { ...c, m } : c));

export function callMatch(s, ci) {
  const c = s.courts[ci];
  if (c.m || activeBooking(s, c.n) || s.q.length < 4) return s;
  const ids = pick(s);
  const ps = shuffle(ids.map((i) => s.q[i].n)); // random partners every match
  const p1 = [ps[0], ps[1]];
  const p2 = [ps[2], ps[3]];
  return {
    ...s,
    q: s.q.filter((_, k) => !ids.includes(k)),
    courts: setCourt(s, ci, { p1, p2 }),
    ev: { id: Date.now(), type: "call", court: c.n, p1, p2 },
  };
}

export function finishMatch(s, ci, winner) {
  const c = s.courts[ci];
  if (!c.m) return s;
  const win = winner === 1 ? c.m.p1 : c.m.p2;
  const lose = winner === 1 ? c.m.p2 : c.m.p1;
  return {
    ...s,
    q: s.rejoin
      ? [
          ...s.q,
          ...win.map((n) => ({ n, r: "W" })),
          ...lose.map((n) => ({ n, r: "L" })),
        ]
      : s.q,
    courts: setCourt(s, ci, null),
    ev: { id: Date.now(), type: "win", court: c.n, win },
  };
}

const cancelMatch = (s, ci) => {
  const m = s.courts[ci].m;
  if (!m) return s;
  return {
    ...s,
    q: [...[...m.p1, ...m.p2].map((n) => ({ n })), ...s.q],
    courts: setCourt(s, ci, null),
  };
};

const resizeCourts = (s, count) => {
  let courts = s.courts.slice(0, count);
  let q = s.q;
  s.courts.slice(count).forEach((c) => {
    if (c.m) q = [...[...c.m.p1, ...c.m.p2].map((n) => ({ n })), ...q];
  });
  while (courts.length < count)
    courts = [...courts, { n: courts.length + 1, m: null }];
  return { ...s, courts, q };
};

const AUTO_CALL_DELAY = 8500; // let the congratulations screen finish first

/* =====================================================================
   Rentals (bookings): { id, court, date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM', name, note }
   A court is rented right now when one of its bookings covers the current time.
   Courts without an active booking are open play courts and are used by the queue.
   ===================================================================== */
export const OPEN_MIN = 6 * 60; // first bookable time (06:00)
export const CLOSE_MIN = 22 * 60; // last possible end time (22:00)
export const SLOT = 30; // minutes per booking slot
export const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const clash = (a, b) =>
  a.court === b.court &&
  a.date === b.date &&
  toMin(a.start) < toMin(b.end) &&
  toMin(b.start) < toMin(a.end);
export const bookingsOn = (s, date, court) =>
  (s.bookings || []).filter(
    (b) => b.date === date && (court == null || b.court === court),
  );
export const activeBooking = (s, court) =>
  bookingsOn(s, todayStr(), court).find(
    (b) => toMin(b.start) <= nowMin() && nowMin() < toMin(b.end),
  );
export const nextBooking = (s, court) =>
  bookingsOn(s, todayStr(), court)
    .filter((b) => toMin(b.start) > nowMin())
    .sort((x, y) => toMin(x.start) - toMin(y.start))[0];
export const bookingConflict = (s, b) =>
  (s.bookings || []).find((x) => clash(x, b));
export const isPastBooking = (b) => `${b.date} ${b.end}` < nowStr();
export function addBooking(s, b) {
  if (bookingConflict(s, b)) return s;
  return { ...s, bookings: [...(s.bookings || []), { id: Date.now(), ...b }] };
}
export const removeBooking = (s, id) => ({
  ...s,
  bookings: (s.bookings || []).filter((b) => b.id !== id),
});

// Re-render every 30 s so rentals start/expire on screen without a refresh.
export function useClockTick() {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
}

/* =====================================================================
   Pickleball court (used on the TV page)
   ===================================================================== */
function PickleballCourt({ court, rental, next }) {
  const { m } = court;
  const spot = (name, cls) => <div className={`pn ${cls}`}>{name}</div>;
  return (
    <div className={`pcw${rental ? " rented" : m ? "" : " idle"}`}>
      <div className="ct">
        <div className="kz l" />
        <div className="kz r" />
        <div className="cl a" />
        <div className="cl b" />
        <div className="net" />
        <div className="cname">COURT {court.n}</div>
        {m ? (
          <>
            {spot(m.p1[0], "tl")}
            {spot(m.p1[1], "tr")}
            {spot(m.p2[0], "bl")}
            {spot(m.p2[1], "br")}
          </>
        ) : rental ? (
          <>
    <div className="rent-top">
      <div className="rent-tag">RENTED</div>
    </div>
    <div className="rent-bot">
      <div className="rent-time">
        {fmtTime(rental.start)} – {fmtTime(rental.end)}
      </div>
      {rental.name && <div className="rent-sub">{rental.name}</div>}
    </div>
  </>
        ) : (
          <div className="rent-bot free">
            AVAILABLE
            {next && (
              <div className="rent-sub">Rented from {fmtTime(next.start)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: Math.random() * 100,
  dur: 3 + Math.random() * 3,
  delay: -Math.random() * 5,
  icon: ["🎉", "🏆", "⭐", "🎊"][i % 4],
}));

function Announcement({ ev, sport }) {
  if (ev.type === "call") {
    return (
      <div className="ov call">
        <div className="ov-lbl">Now calling · {sport}</div>
        <div className="ov-court">COURT {ev.court}</div>
        <div className="ov-big">{ev.p1.join(" & ")}</div>
        <div className="ov-vs">VS</div>
        <div className="ov-big">{ev.p2.join(" & ")}</div>
      </div>
    );
  }
  return (
    <div className="ov win">
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="ov-conf"
          style={{
            left: `${c.left}vw`,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
          }}
        >
          {c.icon}
        </span>
      ))}
      <div className="ov-trophy">🏆</div>
      <div className="ov-lbl">Congratulations</div>
      <div className="ov-big" style={{ color: "#ffd84d", marginTop: "2vh" }}>
        {ev.win.join(" & ")}
      </div>
      <div className="ov-vs">Winners · Court {ev.court}</div>
    </div>
  );
}

const spokenText = (ev) =>
  ev.type === "call"
    ? `Now calling. Court ${ev.court}. ${ev.p1.join(" and ")}, versus ${ev.p2.join(" and ")}. Please proceed to court ${ev.court}.`
    : `Congratulations ${ev.win.join(" and ")}! Great match.`;

/* =====================================================================
   TV page: route it at e.g. /queue/tv
   ===================================================================== */
/* =====================================================================
   Open play schedule
   ===================================================================== */
export const pad = (n) => String(n).padStart(2, "0");
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const nowStr = () => {
  const d = new Date();
  return `${todayStr()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const sortSessions = (a) =>
  [...a].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
export const isUpcoming = (x) => `${x.date} ${x.end}` >= nowStr();
export const upcomingSessions = (a) => sortSessions(a.filter(isUpcoming));
export const fmtDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return iso === todayStr() ? `Today · ${label}` : label;
};
export const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};
export const LEVELS = ["All levels", "Beginner", "Intermediate", "Advanced"];

function ScheduleView({ sessions }) {
  const days = [];
  sessions.slice(0, 10).forEach((x) => {
    const last = days[days.length - 1];
    if (last && last.date === x.date) last.items.push(x);
    else days.push({ date: x.date, items: [x] });
  });
  return (
    <div className="tvs">
      <div className="tvs-title">Open Play Schedule</div>
      <div className="tvs-cols">
        {days.map((d) => (
          <div className="tvs-day" key={d.date}>
            <div className="tvs-date">{fmtDate(d.date)}</div>
            {d.items.map((x) => (
              <div className="tvs-row" key={x.id}>
                <span className="tvs-time">
                  {fmtTime(x.start)} – {fmtTime(x.end)}
                </span>
                <span className="tvs-tag">{x.sport}</span>
                <span className="tvs-tag">{x.level}</span>
                {x.note && <span className="tvs-note">{x.note}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
   TV page: route it at e.g. /tv
   ===================================================================== */
export function TvPage() {
  const [s] = useCourtStore();
  useClockTick();
  const [started, setStarted] = useState(false);
  const [ev, setEv] = useState(null);
  const [view, setView] = useState("courts"); // courts | schedule
  const upcoming = upcomingSessions(s.schedule || []);
  const canRotate = s.rotate && upcoming.length > 0;

  useEffect(() => {
    if (!canRotate) {
      setView("courts");
      return undefined;
    }
    const t = setTimeout(
      () => setView((v) => (v === "courts" ? "schedule" : "courts")),
      view === "courts" ? 25000 : 12000,
    );
    return () => clearTimeout(t);
  }, [view, canRotate]);
  const startedRef = useRef(false);
  const lastId = useRef(s.ev?.id); // ignore the announcement that existed on load

  useEffect(() => {
    const e = s.ev;
    if (!e || e.id === lastId.current) return;
    lastId.current = e.id;
    setEv(e);
    setTimeout(
      () => setEv((cur) => (cur?.id === e.id ? null : cur)),
      e.type === "call" ? 9000 : 8000,
    );
    if (s.voice && startedRef.current && "speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spokenText(e));
      u.rate = 0.92;
      speechSynthesis.speak(u);
    }
  }, [s.ev?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    startedRef.current = true;
    setStarted(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
    if ("speechSynthesis" in window)
      speechSynthesis.speak(new SpeechSynthesisUtterance("")); // unlock audio
  };

  // TV layout: header / [ads panel | courts] / scrolling announcements
  const showAds = s.adsOn !== false && (s.ads || []).length > 0;
  const adsPct = s.adsPct || 30;
  const hasTicker = (s.announcements || []).length > 0;
  const mainW = 100 - 4 - (showAds ? adsPct + 2 : 0); // vw left for the courts
  // Vertical courts: one row up to 5 courts (4 with the ads panel), two rows beyond; sized to always fit
  const n = s.courts.length;
  const rows = n > (showAds ? 4 : 5) ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const maxH = (rows === 2 ? 24 : 50) + (hasTicker ? 0 : 6);
  const courtH = `min(${maxH}vh, calc((${mainW}vw - ${perRow * 3.4}vh - ${(perRow - 1) * 2}vw) / ${perRow} * 2.2))`;
  const clock = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="tv">
      {!started && (
        <button className="tv-start" onClick={start}>
          ▶ Tap to start TV display
        </button>
      )}
      <header className="tv-head">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <img src={banner} alt="Banner" className="tv-profile" />
          <b>{(s.club || s.sport).toUpperCase()}</b>
        </div>
        <span>{clock} </span>
      </header>
      <div className="tv-body">
        {showAds && (
          <aside className="tv-ads" style={{ width: `${adsPct}vw` }}>
            <AdPanel
              ads={s.ads}
              sound={!!s.adSound && started}
              fill={!!s.adFill}
            />
          </aside>
        )}
        <main className="tv-main">
          {view === "schedule" ? (
            <ScheduleView sessions={upcoming} />
          ) : (
            <>
              <div className="tv-grid" style={{ "--ch": courtH }}>
                {s.courts.map((c) => (
                  <PickleballCourt
                    key={c.n}
                    court={c}
                    rental={activeBooking(s, c.n)}
                    next={nextBooking(s, c.n)}
                  />
                ))}
              </div>
              <div className="tv-next">
                <b>Up next:</b>{" "}
                {s.q.length
                  ? s.q.slice(0, 12).map((p, i) => (
                      <span key={i}>
                        {i + 1}. {p.n}
                      </span>
                    ))
                  : "—"}
                {s.q.length > 12 && <span>+{s.q.length - 12} more</span>}
              </div>
            </>
          )}
        </main>
      </div>
      {hasTicker && (
        <Ticker items={s.announcements} speed={s.tickerSpeed || 12} />
      )}
      {ev && <Announcement ev={ev} sport={s.sport} />}
    </div>
  );
}

/* =====================================================================
   Control page: route it at e.g. /queue
   ===================================================================== */
export function ControlPage({ tvHref = "/queue/tv" }) {
  const [s, update] = useCourtStore();
  useClockTick();
  const [text, setText] = useState("");
  const set = (patch) => update((x) => ({ ...x, ...patch }));

  const addPlayers = () => {
    const names = text
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!names.length) return;
    update((x) => ({ ...x, q: [...x.q, ...names.map((n) => ({ n }))] }));
    setText("");
  };

  const finish = (ci, winner) => {
    update((x) => finishMatch(x, ci, winner));
    setTimeout(() => {
      update((x) =>
        x.auto && !x.courts[ci]?.m && x.q.length >= 4 ? callMatch(x, ci) : x,
      );
    }, AUTO_CALL_DELAY);
  };

  const move = (i) =>
    update((x) => {
      const q = [...x.q];
      [q[i - 1], q[i]] = [q[i], q[i - 1]];
      return { ...x, q };
    });

  const preview =
    s.q.length < 4
      ? "Need 4 players waiting"
      : s.mode === "rand"
        ? "Random draw of 4 players"
        : `Next: ${pick(s)
            .map((i) => s.q[i].n)
            .join(", ")}`;

  return (
    <div className="cq">
      <div className="cq-head">
        <h1>Queue &amp; courts</h1>
        <div className="cq-row">
          <select
            value={s.sport}
            onChange={(e) => set({ sport: e.target.value })}
          >
            <option>Pickleball</option>
            <option>Badminton</option>
          </select>
          <select
            value={s.courts.length}
            onChange={(e) => update((x) => resizeCourts(x, +e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n > 1 ? "courts" : "court"}
              </option>
            ))}
          </select>
          <a className="cq-mut" href={tvHref} target="_blank" rel="noreferrer">
            Open TV display
          </a>
        </div>
      </div>

      <div className="cq-card">
        <h2>Add players</h2>
        <div className="cq-row">
          <input
            type="text"
            value={text}
            placeholder="Names, comma separated: Anna, Ben, Cara"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlayers()}
          />
          <button className="primary" onClick={addPlayers}>
            Add
          </button>
          <button onClick={() => update((x) => ({ ...x, q: shuffle(x.q) }))}>
            Shuffle list
          </button>
          <button
            onClick={() =>
              update((x) => ({
                ...x,
                q: [],
                courts: x.courts.map((c) => ({ ...c, m: null })),
                ev: null,
              }))
            }
          >
            Reset all
          </button>
        </div>
        <div className="cq-row" style={{ marginTop: 10 }}>
          <label className="cq-check">
            <input
              type="checkbox"
              checked={s.voice}
              onChange={(e) => set({ voice: e.target.checked })}
            />{" "}
            Voice on TV
          </label>
          <label className="cq-check">
            <input
              type="checkbox"
              checked={s.auto}
              onChange={(e) => set({ auto: e.target.checked })}
            />{" "}
            Auto-call next match
          </label>
          <label className="cq-check">
            <input
              type="checkbox"
              checked={s.rejoin}
              onChange={(e) => set({ rejoin: e.target.checked })}
            />{" "}
            Players rejoin after a match
          </label>
          <label className="cq-check">
            <input
              type="checkbox"
              checked={s.rotate}
              onChange={(e) => set({ rotate: e.target.checked })}
            />{" "}
            Show schedule on TV
          </label>
          <select
            value={s.mode}
            onChange={(e) => set({ mode: e.target.value })}
          >
            <option value="fifo">Next 4 in line</option>
            <option value="rand">Random 4</option>
            <option value="wl">Winners with winners, losers with losers</option>
          </select>
        </div>
      </div>

      <div className="cq-card">
        <h2>Courts</h2>
        <div className="cq-mut" style={{ marginBottom: 10 }}>
          Used for the queue:{" "}
          {s.courts
            .filter((c) => !activeBooking(s, c.n))
            .map((c) => `Court ${c.n}`)
            .join(", ") || "none"}
          {s.courts.some((c) => activeBooking(s, c.n)) &&
            ` · Rented now: ${s.courts
              .filter((c) => activeBooking(s, c.n))
              .map((c) => `Court ${c.n}`)
              .join(", ")}`}
          {" · "}Set up rentals on the Rentals page.
        </div>
        <div className="cq-courts">
          {s.courts.map((c, i) => {
            const rb = activeBooking(s, c.n);
            const nb = nextBooking(s, c.n);
            return (
              <div className="cq-court" key={c.n}>
                <div style={{ marginBottom: 8 }}>
                  <b>
                    Court {c.n} · {c.m ? "Playing" : rb ? "Rented" : "Free"}
                  </b>
                </div>
                {c.m ? (
                  <>
                    <div>{c.m.p1.join(" & ")}</div>
                    <div className="cq-mut">vs</div>
                    <div>{c.m.p2.join(" & ")}</div>
                    <div className="cq-row" style={{ marginTop: 10 }}>
                      <button onClick={() => finish(i, 1)}>
                        🏆 {c.m.p1.join(" & ")}
                      </button>
                      <button onClick={() => finish(i, 2)}>
                        🏆 {c.m.p2.join(" & ")}
                      </button>
                      <button
                        className="small"
                        onClick={() => update((x) => cancelMatch(x, i))}
                      >
                        Cancel match
                      </button>
                    </div>
                  </>
                ) : rb ? (
                  <div className="cq-mut">
                    Rented {fmtTime(rb.start)} – {fmtTime(rb.end)}
                    {rb.name ? ` · ${rb.name}` : ""}. Not used for the queue.
                  </div>
                ) : (
                  <>
                    <div className="cq-mut">{preview}</div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="primary"
                        disabled={s.q.length < 4}
                        onClick={() => update((x) => callMatch(x, i))}
                      >
                        Call match
                      </button>
                    </div>
                  </>
                )}
                {nb && (
                  <div className="cq-mut" style={{ marginTop: 8 }}>
                    Next rental today: {fmtTime(nb.start)} – {fmtTime(nb.end)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cq-card">
        <h2>Players waiting ({s.q.length})</h2>
        {s.q.length === 0 && (
          <div className="cq-mut">No players waiting. Add some above.</div>
        )}
        {s.q.map((p, i) => (
          <div className="cq-item" key={`${p.n}-${i}`}>
            <span>
              <span className="cq-mut">{i + 1}&nbsp;&nbsp;</span>
              {p.n}
              {p.r && (
                <span className="cq-mut">
                  {" "}
                  ({p.r === "W" ? "🏆 won" : "lost"})
                </span>
              )}
            </span>
            <span>
              <button
                className="small"
                disabled={!i}
                onClick={() => move(i)}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                className="small"
                onClick={() =>
                  update((x) => ({ ...x, q: x.q.filter((_, k) => k !== i) }))
                }
                aria-label="Remove"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
