import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useStore } from '@/store';
import Logo from './Logo';

function CenterTitle() {
  const { session, folders } = useStore();
  const location = useLocation();
  const params = useParams<{ folderId?: string }>();

  if (session.quiz && !session.finished) {
    return (
      <div className="topbar-center">
        <span style={{ color: '#999', fontWeight: 400 }}>{session.currentIndex + 1} / {session.questions.length} · </span>
        {session.quiz.title}
      </div>
    );
  }

  if (params.folderId) {
    const folder = folders.find(f => f.id === params.folderId);
    return <div className="topbar-center">{folder?.name ?? 'Folder'}</div>;
  }

  const titles: Record<string, string> = {
    '/library': 'Quiz Library',
    '/history': 'History',
    '/settings': 'Settings',
  };
  const base = '/' + location.pathname.split('/')[1];
  return <div className="topbar-center">{titles[base] ?? ''}</div>;
}

export default function TopBar() {
  const { session } = useStore();
  const inQuiz = !!session.quiz && !session.finished;

  return (
    <header className="topbar">
      <NavLink to="/library" className="topbar-logo" aria-label="Home">
        <Logo size={38} />
        <span>LAMBDAn</span>
      </NavLink>
      <CenterTitle />
      {inQuiz ? (
        <div style={{ justifySelf: 'end' }} />
      ) : (
        <nav className="topbar-nav">
          <NavLink to="/library" className={({ isActive }) => isActive ? 'active' : ''}>Library</NavLink>
          <NavLink to="/history"  className={({ isActive }) => isActive ? 'active' : ''}>History</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>Settings</NavLink>
        </nav>
      )}
    </header>
  );
}
