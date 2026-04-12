import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { clearStoredSession, getStoredSession, setStoredSession } from './lib/auth';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import StudentPage from './pages/StudentPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

const ProtectedRoute = ({ allowedRoles, session, children }) => {
  if (!session) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(session.user.role)) return <Navigate to="/login" replace />;
  return children;
};

const AnimatedPage = ({ children }) => <>{children}</>;

export default function App() {
  const [session, setSession] = useState(getStoredSession());
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ block: 'start' });
        }
      });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.hash]);

  const authApi = useMemo(
    () => ({
      signIn: (nextSession) => {
        setStoredSession(nextSession);
        setSession(nextSession);
      },
      signOut: () => {
        clearStoredSession();
        setSession(null);
      }
    }),
    []
  );

  return (
    <div className="min-h-screen bg-[#f6f2f0] text-[#20181c]">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<AnimatedPage><LandingPage session={session} /></AnimatedPage>} />
        <Route
          path="/login"
          element={
            <AnimatedPage>
              {session ? (
                <Navigate to={session.user.role === 'admin' ? '/admin' : '/student'} replace />
              ) : (
                <LoginPage onAuth={authApi.signIn} />
              )}
            </AnimatedPage>
          }
        />
        <Route
          path="/student"
          element={
            <AnimatedPage>
              <ProtectedRoute allowedRoles={['student']} session={session}>
                <StudentPage session={session} onLogout={authApi.signOut} />
              </ProtectedRoute>
            </AnimatedPage>
          }
        />
        <Route
          path="/admin"
          element={
            <AnimatedPage>
              <ProtectedRoute allowedRoles={['admin']} session={session}>
                <AdminPage session={session} onLogout={authApi.signOut} />
              </ProtectedRoute>
            </AnimatedPage>
          }
        />
        <Route path="*" element={<Navigate to={session ? (session.user.role === 'admin' ? '/admin' : '/student') : '/'} replace />} />
      </Routes>
    </div>
  );
}
