import { useCallback, useEffect, useState } from 'react';

export const parseYouTube = (url) => (url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/) || [])[1];
export const detectAdType = (url) =>
  parseYouTube(url) ? 'youtube' : /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url) ? 'video' : 'image';

/* Left panel of the TV: plays the ad playlist in a loop.
   - video: plays to the end, then the next item (a single video loops)
   - youtube / image: shown for `seconds`, then the next item */
export function AdPanel({ ads, sound, fill }) {
  const [i, setI] = useState(0);
  const cur = ads.length ? ads[i % ads.length] : null;
  const next = useCallback(() => setI((x) => x + 1), []);

  useEffect(() => {
    if (!cur || cur.type === 'video' || ads.length < 2) return undefined;
    const t = setTimeout(next, Math.max(3, cur.seconds || 15) * 1000);
    return () => clearTimeout(t);
  }, [i, cur?.id, cur?.type, ads.length, next]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cur) return null;
  const cls = `ad-fill${fill ? ' cover' : ''}`;
  if (cur.type === 'video') {
    return (
      <video key={`${cur.id}-${i}`} className={cls} src={cur.url} autoPlay muted={sound} playsInline
        loop={ads.length === 1} onEnded={next} onError={() => setTimeout(next, 3000)} 
        controls={true}
      />
    );
  }
  if (cur.type === 'youtube') {
    const id = parseYouTube(cur.url);
    const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${sound ? 0 : 1}&controls=0&loop=1&playlist=${id}&modestbranding=1&rel=0&playsinline=1`;
    return <iframe key={`${cur.id}-${i}`} className="ad-fill" src={src} title={cur.title || 'Advertisement'} allow="autoplay; encrypted-media" />;
  }
  return <img key={`${cur.id}-${i}`} className={cls} src={cur.url} alt={cur.title || ''} onError={() => setTimeout(next, 3000)} />;
}

/* Bottom bar: scrolling announcements. `speed` is in screen-widths per ~8 s (bigger = faster). */
export function Ticker({ items, speed = 12 }) {
  const text = items.map((x) => x.text).join('      •      ');
  const duration = (100 + text.length * 1.24) / speed; // seconds
  return (
    <div className="tv-ticker" role="marquee" aria-label="Announcements">
     
      <div className="tick-win">
        <div className="tick-track" style={{ '--d': `${duration}s` }}>{text}</div>
      </div>
    </div>
  );
}
