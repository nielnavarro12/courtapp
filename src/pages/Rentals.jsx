import { useState } from 'react';
import {
  CLOSE_MIN, OPEN_MIN, SLOT, addBooking, bookingConflict, bookingsOn, fmtDate, fmtTime, isPastBooking,
  nowMin, removeBooking, toHHMM, toMin, todayStr, useClockTick, useCourtStore,
} from '../court-queue/CourtQueue.jsx';

const SLOTS = Array.from({ length: (CLOSE_MIN - OPEN_MIN) / SLOT }, (_, i) => OPEN_MIN + i * SLOT);
const DURATIONS = [[30, '30 min'], [60, '1 h'], [90, '1.5 h'], [120, '2 h'], [180, '3 h']];
const hrs = (min) => `${min / 60}`.replace(/\.0$/, '') + ' h';

function Timeline({ s, date, court, onPick }) {
  const span = CLOSE_MIN - OPEN_MIN;
  const ticks = [];
  for (let m = OPEN_MIN; m <= CLOSE_MIN; m += 120) ticks.push(m);
  return (
    <div className="tl">
      <div className="tl-row">
        <span className="tl-name" />
        <div className="tl-bar tl-axis">
          {ticks.map((m) => <span key={m} style={{ left: `${((m - OPEN_MIN) / span) * 100}%` }}>{fmtTime(toHHMM(m)).replace(':00', '')}</span>)}
        </div>
      </div>
      {s.courts.map((c) => (
        <button key={c.n} className={`tl-row${c.n === court ? ' on' : ''}`} onClick={() => onPick(c.n)} aria-label={`Select court ${c.n}`}>
          <span className="tl-name">Court {c.n}</span>
          <div className="tl-bar">
            {bookingsOn(s, date, c.n).map((b) => (
              <div key={b.id} className="tl-seg" title={`${fmtTime(b.start)} – ${fmtTime(b.end)} ${b.name}`}
                style={{ left: `${((toMin(b.start) - OPEN_MIN) / span) * 100}%`, width: `${((toMin(b.end) - toMin(b.start)) / span) * 100}%` }}>
                {b.name}
              </div>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function RentalsPage() {
  const [s, update] = useCourtStore();
  useClockTick();
  const [court, setCourt] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [sel, setSel] = useState(null); // { a: start minute, b: end minute (exclusive) }
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);

  const day = bookingsOn(s, date, court);
  const taken = (m) => day.find((b) => toMin(b.start) <= m && m < toMin(b.end));
  const past = (m) => date === todayStr() && m + SLOT <= nowMin();
  const blocked = (m) => !!taken(m) || past(m);
  const free = (a, b) => { for (let x = a; x < b; x += SLOT) if (blocked(x)) return false; return b <= CLOSE_MIN; };
  const reset = () => { setSel(null); setMsg(null); };

  const clickSlot = (m) => {
    if (blocked(m)) return;
    setMsg(null);
    if (!sel || sel.b - sel.a > SLOT || m < sel.a) return setSel({ a: m, b: m + SLOT });
    setSel(free(sel.a, m + SLOT) ? { a: sel.a, b: m + SLOT } : { a: m, b: m + SLOT });
  };
  const setDuration = (d) => sel && free(sel.a, sel.a + d) && setSel({ a: sel.a, b: sel.a + d });

  const book = () => {
    if (!sel || !name.trim()) return;
    const b = { court, date, start: toHHMM(sel.a), end: toHHMM(sel.b), name: name.trim(), note: note.trim() };
    if (bookingConflict(s, b)) return setMsg({ bad: true, t: 'That time overlaps another booking.' });
    update((x) => addBooking(x, b));
    setMsg({ t: `Booked Court ${court} on ${fmtDate(date)}, ${fmtTime(b.start)} – ${fmtTime(b.end)} for ${b.name}.` });
    setSel(null); setName(''); setNote('');
  };

  const upcoming = [...(s.bookings || [])].filter((b) => !isPastBooking(b)).sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
  const hasPast = (s.bookings || []).some(isPastBooking);

  return (
    <div className="cq">
      <div className="cq-head"><h1>Court rentals</h1></div>

      <div className="cq-card">
        <h2>Book a court</h2>
        <div className="cq-row">
          <select value={court} onChange={(e) => { setCourt(+e.target.value); reset(); }} aria-label="Court">
            {s.courts.map((c) => <option key={c.n} value={c.n}>Court {c.n}</option>)}
          </select>
          <input type="date" value={date} min={todayStr()} onChange={(e) => { setDate(e.target.value || todayStr()); reset(); }} aria-label="Date" />
          <span className="cq-mut">{fmtDate(date)}</span>
        </div>

        <Timeline s={s} date={date} court={court} onPick={(n) => { setCourt(n); reset(); }} />

        <div className="cq-mut" style={{ margin: '12px 0 6px' }}>
          Court {court}: tap a start time, then tap the last slot you need (or pick a duration). Each slot is {SLOT} minutes.
        </div>
        <div className="slots" role="group" aria-label="Time slots">
          {SLOTS.map((m) => {
            const t = taken(m);
            const on = sel && m >= sel.a && m < sel.b;
            return (
              <button key={m} className={`slot${on ? ' sel' : ''}${t ? ' taken' : ''}${past(m) ? ' past' : ''}`}
                disabled={blocked(m)} aria-pressed={!!on} onClick={() => clickSlot(m)} title={t ? `Booked: ${t.name}` : undefined}>
                {fmtTime(toHHMM(m))}
              </button>
            );
          })}
        </div>

        {sel && (
          <div className="cq-row" style={{ marginTop: 12 }}>
            <span className="cq-mut">Duration:</span>
            {DURATIONS.map(([d, l]) => (
              <button key={d} className="small" disabled={!free(sel.a, sel.a + d)} onClick={() => setDuration(d)}>{l}</button>
            ))}
          </div>
        )}

        <div className="cq-row" style={{ marginTop: 12 }}>
          <div className="cq-sel">
            {sel ? <>Selected: <b>{fmtTime(toHHMM(sel.a))} – {fmtTime(toHHMM(sel.b))}</b> ({hrs(sel.b - sel.a)})</> : <span className="cq-mut">No time selected</span>}
          </div>
        </div>
        <div className="cq-row" style={{ marginTop: 8 }}>
          <input type="text" value={name} placeholder="Renter name (required)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && book()} />
          <input type="text" value={note} placeholder="Phone / note (optional)" onChange={(e) => setNote(e.target.value)} />
          <button className="primary" disabled={!sel || !name.trim()} onClick={book}>Book court</button>
        </div>
        {msg && <div role="status" className="cq-msg" style={msg.bad ? { color: '#d9480f' } : undefined}>{msg.t}</div>}
      </div>

      <div className="cq-card">
        <h2>Upcoming rentals ({upcoming.length})</h2>
        {upcoming.length === 0 && <div className="cq-mut">No upcoming rentals.</div>}
        {upcoming.map((b) => (
          <div className="cq-item" key={b.id}>
            <span>
              {fmtDate(b.date)} · {fmtTime(b.start)} – {fmtTime(b.end)} · <b>Court {b.court}</b>
              <span className="cq-mut"> · {b.name}{b.note ? ` · ${b.note}` : ''}</span>
            </span>
            <button className="small" aria-label="Cancel booking" onClick={() => update((x) => removeBooking(x, b.id))}>Cancel</button>
          </div>
        ))}
        {hasPast && (
          <div style={{ marginTop: 10 }}>
            <button className="small" onClick={() => update((x) => ({ ...x, bookings: x.bookings.filter((b) => !isPastBooking(b)) }))}>Clear past rentals</button>
          </div>
        )}
      </div>
    </div>
  );
}
