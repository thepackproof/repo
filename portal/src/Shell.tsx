import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

export function Shell() {
  const { user, signOutUser } = useAuth();
  return (
    <div className="shell">
      <nav className="nav" aria-label="Primary">
        <div className="brand">PACKPROOF</div>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/packproofs">PackProofs</NavLink>
        <NavLink to="/activity">Activity</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div style={{ flex: 1 }} />
        <p className="meta">{user?.email}</p>
        <button className="link" type="button" onClick={() => void signOutUser()}>Sign out</button>
      </nav>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
