import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RentalsPage from './pages/Rentals.jsx';
import OpenPlayPage from './pages/OpenPlay.jsx';
import AdsPage from './pages/Ads.jsx';
import { ControlPage, TvPage } from './court-queue/CourtQueue.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="queue" element={<ControlPage tvHref="/tv" />} />
        <Route path="rentals" element={<RentalsPage />} />
        <Route path="open-play" element={<OpenPlayPage />} />
        <Route path="ads" element={<AdsPage />} />
      </Route>
      <Route path="tv" element={<TvPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
