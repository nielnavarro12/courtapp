import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  activeBooking, bookingsOn, fmtDate, fmtTime, isPastBooking, isUpcoming, nextBooking, todayStr, toMin, useClockTick, useCourtStore,
} from '../court-queue/CourtQueue.jsx';

const DAYS_AHEAD = 14;
const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Dashboard() {
  const [s] = useCourtStore();
  useClockTick();
  const [filter, setFilter] = useState('all');
  const today = todayStr();
  const limit = addDays(DAYS_AHEAD);

  const rentalsToday = bookingsOn(s, today).filter((b) => !isPastBooking(b));
  const openToday = (s.schedule || []).filter((x) => x.date === today && isUpcoming(x));
  const playing = s.courts.filter((c) => c.m).length;
  const rentedNow = s.courts.filter((c) => activeBooking(s, c.n)).length;

  const items = [
    ...(s.bookings || []).filter((b) => !isPastBooking(b)).map((b) => ({ kind: 'rental', key: `r${b.id}`, ...b })),
    ...(s.schedule || []).filter(isUpcoming).map((x) => ({ kind: 'open', key: `o${x.id}`, ...x })),
  ]
    .filter((x) => x.date <= limit && (filter === 'all' || x.kind === (filter === 'rentals' ? 'rental' : 'open')))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const days = [];
  items.forEach((x) => {
    const last = days[days.length - 1];
    if (last && last.date === x.date) last.items.push(x);
    else days.push({ date: x.date, items: [x] });
  });

  return (
    <div className="cq">
      <div className="cq-head">
        <h1>Dashboard</h1>
        <div className="cq-row">
          <Link className="cq-btn primary" to="/rentals">Book a court</Link>
          <Link className="cq-btn" to="/open-play">Add open play</Link>
          <Link className="cq-btn" to="/queue">Run the queue</Link>
        </div>
      </div>

      <div className="cq-stats">
        <div className="cq-stat"><span>{playing}</span>courts in play</div>
        <div className="cq-stat"><span>{rentedNow}</span>courts rented now</div>
        <div className="cq-stat"><span>{s.q.length}</span>players waiting</div>
        <div className="cq-stat"><span>{rentalsToday.length}</span>rentals left today</div>
        <div className="cq-stat"><span>{openToday.length}</span>open play left today</div>
      </div>

      <div className="cq-card">
        <h2>Courts right now</h2>
        <div className="cq-courts">
          {s.courts.map((c) => {
            const rb = activeBooking(s, c.n);
            const nb = nextBooking(s, c.n);
            return (
              <div className="cq-court" key={c.n}>
                <div><b>Court {c.n}</b> · {c.m ? 'Open play: playing' : rb ? 'Rented' : 'Open play: free'}</div>
                {c.m && <div className="cq-mut">{c.m.p1.join(' & ')} vs {c.m.p2.join(' & ')}</div>}
                {rb && <div className="cq-mut">{fmtTime(rb.start)} – {fmtTime(rb.end)} · {rb.name}</div>}
                {nb && <div className="cq-mut">Next rental: {fmtTime(nb.start)} – {fmtTime(nb.end)} · {nb.name}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cq-card">
        <div className="cq-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Schedule · next {DAYS_AHEAD} days</h2>
          <div className="cq-row" role="group" aria-label="Filter">
            {[['all', 'All'], ['rentals', 'Rentals'], ['open', 'Open play']].map(([k, l]) => (
              <button key={k} className={`small${filter === k ? ' on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        {days.length === 0 && <div className="cq-mut">Nothing scheduled. Add a rental or an open play session.</div>}
        {days.map((d) => (
          <div key={d.date} className="ag-day">
            <div className="ag-date">{fmtDate(d.date)}</div>
            {d.items.map((x) => (
              <div className="ag-row" key={x.key}>
                <span className="ag-time">{fmtTime(x.start)} – {fmtTime(x.end)}</span>
                <span className={`ag-badge ${x.kind}`}>{x.kind === 'rental' ? 'Rental' : 'Open play'}</span>
                <span>
                  {x.kind === 'rental'
                    ? <><b>Court {x.court}</b> · {x.name}{x.note ? <span className="cq-mut"> · {x.note}</span> : null}</>
                    : <>{x.sport} · {x.level}{x.note ? <span className="cq-mut"> · {x.note}</span> : null}</>}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
