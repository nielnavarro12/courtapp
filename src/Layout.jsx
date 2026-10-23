import { NavLink, Outlet } from 'react-router-dom';

const banner = "./images/profile.jpg";
const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/rentals', label: 'Rentals' },
  { to: '/open-play', label: 'Open play' },
  { to: '/ads', label: 'TV & ads' },
];

export default function Layout() {
  return (
    <>
      <nav className="cq-nav" aria-label="Main">
        <div className="cq-nav-in">
            <img src={banner} alt="Banner" className="tv-profile" />
          <b>PSG Daily Dinks</b>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {l.label}
            </NavLink>
          ))}
          <a href="/tv" target="_blank" rel="noreferrer" className="cq-nav-tv">📺 TV display</a>
        </div>
      </nav>
      <Outlet />
    </>
  );
}
