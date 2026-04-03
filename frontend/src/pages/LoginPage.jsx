import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function LoginPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student'
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        await api.post('/auth/signup', form);
        toast.success('Signup successful. Please login.');
        setMode('login');
      } else {
        const { data } = await api.post('/auth/login', {
          email: form.email,
          password: form.password
        });
        onAuth(data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-soft to-[#fff2f4] p-6">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-3xl bg-white shadow-glass"
      >
        <div className="grid md:grid-cols-2">
          <div className="relative hidden bg-accent p-10 text-white md:block">
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_30%,#ffffff44_0,transparent_35%),radial-gradient(circle_at_80%_70%,#ffffff3a_0,transparent_40%)]" />
            <div className="relative">
              <h1 className="text-4xl font-semibold">LabTrack</h1>
              <p className="mt-4 text-white/90">Campus Lab Asset Management System with visual labs, AI complaint triage, and admin analytics.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5 p-8 md:p-10">
            <h2 className="text-2xl font-semibold text-ink">{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            {mode === 'signup' && (
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Name"
                className="w-full rounded-2xl border border-gray-200 p-3"
                required
              />
            )}
            <input
              name="email"
              value={form.email}
              onChange={handleChange}
              type="email"
              placeholder="Email"
              className="w-full rounded-2xl border border-gray-200 p-3"
              required
            />
            <input
              name="password"
              value={form.password}
              onChange={handleChange}
              type="password"
              placeholder="Password"
              className="w-full rounded-2xl border border-gray-200 p-3"
              required
            />
            {mode === 'signup' && (
              <select name="role" value={form.role} onChange={handleChange} className="w-full rounded-2xl border border-gray-200 p-3">
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
            )}
            <button
              className="w-full rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Sign up'}
            </button>
            <button type="button" className="text-sm text-accent" onClick={() => setMode((p) => (p === 'login' ? 'signup' : 'login'))}>
              {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
