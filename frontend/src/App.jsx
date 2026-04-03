import { useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { clearStoredSession, getStoredSession, setStoredSession } from './lib/auth';
import LoginPage from './pages/LoginPage.jsx';
import StudentPage from './pages/StudentPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

const ProtectedRoute = ({ allowedRoles, session, children }) => {
  if (!session) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(session.user.role)) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  const [session, setSession] = useState(getStoredSession());

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
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to={session.user.role === 'admin' ? '/admin' : '/student'} replace />
          ) : (
            <LoginPage onAuth={authApi.signIn} />
          )
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={['student']} session={session}>
            <StudentPage session={session} onLogout={authApi.signOut} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']} session={session}>
            <AdminPage session={session} onLogout={authApi.signOut} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={session ? (session.user.role === 'admin' ? '/admin' : '/student') : '/login'} replace />} />
    </Routes>
  );
}
