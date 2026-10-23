import { useState } from 'react';
import { useCourtStore } from '../court-queue/CourtQueue.jsx';
import { detectAdType } from '../court-queue/TvAds.jsx';

const TYPE_LABEL = { video: 'Video', youtube: 'YouTube', image: 'Image' };

export default function AdsPage() {
  const [s, update] = useCourtStore();
  const set = (patch) => update((x) => ({ ...x, ...patch }));
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [seconds, setSeconds] = useState(15);
  const [text, setText] = useState('');
  const ads = s.ads || [];
  const notes = s.announcements || [];

  const addAd = () => {
    const u = url.trim();
    if (!u) return;
    update((x) => ({ ...x, ads: [...(x.ads || []), { id: Date.now(), type: detectAdType(u), url: u, title: title.trim(), seconds: +seconds || 15 }] }));
    setUrl(''); setTitle('');
  };
  const moveAd = (i) => update((x) => {
    const a = [...x.ads];
    [a[i - 1], a[i]] = [a[i], a[i - 1]];
    return { ...x, ads: a };
  });
  const addNote = () => {
    const t = text.trim();
    if (!t) return;
    update((x) => ({ ...x, announcements: [...(x.announcements || []), { id: Date.now(), text: t }] }));
    setText('');
  };

  return (
    <div className="cq">
      <div className="cq-head">
        <h1>TV &amp; ads</h1>
        <a className="cq-btn" href="/tv" target="_blank" rel="noreferrer">Open TV display</a>
      </div>

      <div className="cq-card">
        <h2>TV layout</h2>
        <div className="cq-row">
          <input type="text" value={s.club || ''} placeholder="Header title (e.g. your club name)" onChange={(e) => set({ club: e.target.value })} />
        </div>
        <div className="cq-row" style={{ marginTop: 10 }}>
          <label className="cq-check"><input type="checkbox" checked={s.adsOn !== false} onChange={(e) => set({ adsOn: e.target.checked })} /> Show ads panel (left)</label>
          <select value={s.adsPct || 30} onChange={(e) => set({ adsPct: +e.target.value })} aria-label="Ads panel width">
            <option value={25}>Panel width: 25%</option>
            <option value={30}>Panel width: 30%</option>
            <option value={35}>Panel width: 35%</option>
            <option value={40}>Panel width: 40%</option>
            <option value={45}>Panel width: 45%</option>
            <option value={50}>Panel width: 50%</option>
          </select>
          <label className="cq-check"><input type="checkbox" checked={!!s.adFill} onChange={(e) => set({ adFill: e.target.checked })} /> Fill panel (crop to fit)</label>
          <label className="cq-check"><input type="checkbox" checked={!!s.adSound} onChange={(e) => set({ adSound: e.target.checked })} /> Play ad sound</label>
          <select value={s.tickerSpeed || 12} onChange={(e) => set({ tickerSpeed: +e.target.value })} aria-label="Ticker speed">
            <option value={8}>Ticker: slow</option>
            <option value={12}>Ticker: normal</option>
            <option value={18}>Ticker: fast</option>
          </select>
        </div>
        <div className="cq-mut" style={{ marginTop: 8 }}>
          The TV shows a header, the ads panel on the left, the courts on the right and the scrolling announcements at the bottom.
          Portrait (vertical) videos and images fit the panel best. Sound plays only after you tap the TV start button.
        </div>
      </div>

      <div className="cq-card">
        <h2>Ad playlist ({ads.length})</h2>
        <div className="cq-row">
          <input type="text" value={url} placeholder="Video, image or YouTube link, e.g. /ads/promo.mp4" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAd()} />
          <input type="text" value={title} placeholder="Title (optional)" onChange={(e) => setTitle(e.target.value)} style={{ maxWidth: 220 }} />
          <label className="cq-check">Seconds <input type="number" min={3} max={600} value={seconds} onChange={(e) => setSeconds(e.target.value)} style={{ width: 70 }} /></label>
          <button className="primary" onClick={addAd} disabled={!url.trim()}>Add</button>
        </div>
        <div className="cq-mut" style={{ marginTop: 8 }}>
          Put your own video files in the project&apos;s <code>public/ads/</code> folder and use <code>/ads/yourfile.mp4</code>, or paste any direct video or image URL.
          Videos play to the end. Images and YouTube links stay on screen for the number of seconds.
        </div>
        {ads.length === 0 && <div className="cq-mut" style={{ marginTop: 10 }}>No ads yet. The TV shows the courts full width until you add one.</div>}
        {ads.map((a, i) => (
          <div className="cq-item" key={a.id}>
            <span>
              <span className="cq-mut">{i + 1}&nbsp;&nbsp;</span>
              {a.title || a.url}
              <span className="cq-mut"> · {TYPE_LABEL[a.type]}{a.type !== 'video' ? ` · ${a.seconds}s` : ''}{a.title ? ` · ${a.url}` : ''}</span>
            </span>
            <span>
              <button className="small" disabled={!i} onClick={() => moveAd(i)} aria-label="Move up">↑</button>
              <button className="small" onClick={() => update((x) => ({ ...x, ads: x.ads.filter((y) => y.id !== a.id) }))} aria-label="Remove ad">✕</button>
            </span>
          </div>
        ))}
      </div>

      <div className="cq-card">
        <h2>Scrolling announcements ({notes.length})</h2>
        <div className="cq-row">
          <input type="text" value={text} placeholder="e.g. Open play every Saturday 6 PM · Court rental: ask the front desk" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
          <button className="primary" onClick={addNote} disabled={!text.trim()}>Add</button>
        </div>
        {notes.length === 0 && <div className="cq-mut" style={{ marginTop: 10 }}>No announcements. The bottom bar is hidden until you add one.</div>}
        {notes.map((n) => (
          <div className="cq-item" key={n.id}>
            <span>{n.text}</span>
            <button className="small" onClick={() => update((x) => ({ ...x, announcements: x.announcements.filter((y) => y.id !== n.id) }))} aria-label="Remove announcement">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
