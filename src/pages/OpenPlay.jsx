import { useState } from 'react';
import { LEVELS, fmtDate, fmtTime, isUpcoming, sortSessions, todayStr, toMin, useClockTick, useCourtStore } from '../court-queue/CourtQueue.jsx';

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export default function OpenPlayPage() {
  const [s, update] = useCourtStore();
  useClockTick();
  const [f, setF] = useState({ date: todayStr(), start: '18:00', end: '20:00', sport: 'Pickleball', level: 'All levels', note: '', repeat: 0 });
  const setField = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const valid = f.date && f.start && f.end && toMin(f.end) > toMin(f.start);

  const add = () => {
    if (!valid) return;
    const { repeat, ...base } = f;
    const sessions = Array.from({ length: +repeat + 1 }, (_, k) => ({
      id: Date.now() + k, ...base, date: addDays(f.date, 7 * k), note: f.note.trim(),
    }));
    update((x) => ({ ...x, schedule: [...(x.schedule || []), ...sessions] }));
    setF((v) => ({ ...v, note: '' }));
  };

  const all = sortSessions(s.schedule || []);
  return (
    <div className="cq">
      <div className="cq-head"><h1>Open play schedule</h1></div>
      <div className="cq-card">
        <h2>Add a session</h2>
        <div className="cq-row">
          <input type="date" value={f.date} min={todayStr()} onChange={setField('date')} aria-label="Date" />
          <input type="time" value={f.start} onChange={setField('start')} aria-label="Start time" />
          <span className="cq-mut">to</span>
          <input type="time" value={f.end} onChange={setField('end')} aria-label="End time" />
          <select value={f.sport} onChange={setField('sport')}><option>Pickleball</option><option>Badminton</option></select>
          <select value={f.level} onChange={setField('level')}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        </div>
        <div className="cq-row" style={{ marginTop: 8 }}>
          <input type="text" value={f.note} placeholder="Note (optional): fee, bring your own paddle…" onChange={setField('note')} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <select value={f.repeat} onChange={setField('repeat')} aria-label="Repeat">
            <option value={0}>Once</option>
            <option value={3}>Weekly, 4 weeks</option>
            <option value={7}>Weekly, 8 weeks</option>
            <option value={11}>Weekly, 12 weeks</option>
          </select>
          <button className="primary" disabled={!valid} onClick={add}>Add session</button>
        </div>
        {!valid && <div className="cq-mut" style={{ marginTop: 8 }}>The end time must be after the start time.</div>}
      </div>

      <div className="cq-card">
        <h2>Sessions ({all.length})</h2>
        {all.length === 0 && <div className="cq-mut">No sessions yet.</div>}
        {all.map((x) => (
          <div className="cq-item" key={x.id} style={isUpcoming(x) ? undefined : { opacity: 0.5 }}>
            <span>
              {fmtDate(x.date)} · {fmtTime(x.start)} – {fmtTime(x.end)}
              <span className="cq-mut"> · {x.sport} · {x.level}{x.note ? ` · ${x.note}` : ''}{isUpcoming(x) ? '' : ' (past)'}</span>
            </span>
            <button className="small" aria-label="Delete session" onClick={() => update((y) => ({ ...y, schedule: y.schedule.filter((z) => z.id !== x.id) }))}>✕</button>
          </div>
        ))}
        {all.some((x) => !isUpcoming(x)) && (
          <div style={{ marginTop: 10 }}>
            <button className="small" onClick={() => update((y) => ({ ...y, schedule: y.schedule.filter(isUpcoming) }))}>Clear past sessions</button>
          </div>
        )}
      </div>
    </div>
  );
}
