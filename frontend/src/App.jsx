import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { clearStoredSession, getStoredSession, setStoredSession } from './lib/auth';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import StudentPage from './pages/StudentPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import StudentComplaintHistoryPage from './pages/StudentComplaintHistoryPage.jsx';
import AdminCurrentComplaintsPage from './pages/AdminCurrentComplaintsPage.jsx';

const ProtectedRoute = ({ allowedRoles, session, children }) => {
  if (!session) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(session.user.role)) return <Navigate to="/login" replace />;
  return children;
};

const AnimatedPage = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
);

export default function App() {
  const [session, setSession] = useState(getStoredSession());
  const location = useLocation();

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
    <AnimatePresence mode="wait" initial={false}>
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
        <Route
          path="/student/history"
          element={
            <AnimatedPage>
              <ProtectedRoute allowedRoles={['student']} session={session}>
                <StudentComplaintHistoryPage session={session} onLogout={authApi.signOut} />
              </ProtectedRoute>
            </AnimatedPage>
          }
        />
        <Route
          path="/admin/current-complaints"
          element={
            <AnimatedPage>
              <ProtectedRoute allowedRoles={['admin']} session={session}>
                <AdminCurrentComplaintsPage session={session} onLogout={authApi.signOut} />
              </ProtectedRoute>
            </AnimatedPage>
          }
        />
        <Route path="*" element={<Navigate to={session ? (session.user.role === 'admin' ? '/admin' : '/student') : '/'} replace />} />
      </Routes>
    </AnimatePresence>
  );
}
