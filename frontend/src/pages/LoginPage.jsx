import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ShieldCheck, Lock, Mail, User, Eye, EyeOff, CircleCheckBig } from 'lucide-react';
import { api } from '../lib/api';
import BrandLogo from '../components/BrandLogo';

const TOTAL_LAB_SEATS = 30;

const cycleSeatState = (state) => {
  if (state === 'normal') return 'faulty';
  if (state === 'faulty') return 'maintenance';
  return 'normal';
};

export default function LoginPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student'
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [labSeatStates, setLabSeatStates] = useState(() =>
    Array.from({ length: TOTAL_LAB_SEATS }, (_, i) => {
      if (i === 1 || i === 9 || i === 18) return 'faulty';
      if (i === 4 || i === 13 || i === 22) return 'maintenance';
      return 'normal';
    })
  );

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSeatClick = (seatIndex) => {
    setLabSeatStates((prev) => prev.map((state, idx) => (idx === seatIndex ? cycleSeatState(state) : state)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        const signupData = { ...form, role: 'student' };
        await api.post('/auth/signup', signupData);
        toast.success('Student account created successfully. Please login.');
        setMode('login');
      } else {
        const { data } = await api.post('/auth/login', {
          email: form.email,
          password: form.password,
          role: form.role
        });

        if (data?.user?.role !== form.role) {
          toast.error(`This account is ${data.user.role}. Please switch role tab.`);
          return;
        }

        setAuthSuccess(true);
        setTimeout(() => {
          onAuth(data);
          setAuthSuccess(false);
        }, 900);
        return;
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f2f0] p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(157,34,53,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(157,34,53,0.05)_1px,transparent_1px)] bg-[size:38px_38px]" />
      <div className="noise-overlay pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#9d2235]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-12 h-80 w-80 rounded-full bg-[#9d2235]/10 blur-3xl" />

      {[
        { left: '8%', top: '16%', code: 'P01', color: 'border-emerald-300 bg-emerald-50/70 text-emerald-700', delay: 0 },
        { left: '5%', top: '46%', code: 'P03', color: 'border-amber-300 bg-amber-50/80 text-amber-700', delay: 0.5 },
        { left: '15%', top: '77%', code: 'P07', color: 'border-rose-300 bg-rose-50/80 text-rose-700', delay: 0.9 },
        { left: '92%', top: '24%', code: 'P04', color: 'border-emerald-300 bg-emerald-50/70 text-emerald-700', delay: 0.2 },
        { left: '87%', top: '63%', code: 'P05', color: 'border-rose-300 bg-rose-50/80 text-rose-700', delay: 0.7 }
      ].map((node) => (
        <motion.div
          key={node.code + node.left}
          className={`pointer-events-none absolute hidden rounded-lg border px-2 py-1 font-mono text-[10px] md:block ${node.color}`}
          style={{ left: node.left, top: node.top }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -12] }}
          transition={{ duration: 6, delay: node.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          {node.code}
        </motion.div>
      ))}

      <header className="relative z-10 mb-8 flex items-center justify-between rounded-2xl border border-[#9d2235]/10 bg-white/70 px-5 py-3 backdrop-blur-md">
        <BrandLogo compact className="shrink-0" />
        {/* <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500">All systems operational</span> */}
      </header>

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mx-auto max-w-4xl overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_rgba(34,19,19,0.16)]"
      >
        <div className="grid md:grid-cols-[1fr_1.05fr]">
          <div className="relative hidden overflow-hidden bg-accent p-8 text-white md:flex md:flex-col">
            <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border-[22px] border-white/10" />
            <div className="absolute -bottom-14 -left-8 h-56 w-56 rounded-full border-[28px] border-white/5" />

            <div className="relative z-10">
              <BrandLogo compact light />
              <p className="mt-3 max-w-64 text-sm leading-6 text-white/80">
                Campus lab asset management with visual maps, AI issue triage, and real-time admin workflows.
              </p>
            </div>

            <div className="relative z-10 mt-6 flex min-h-[390px] flex-1 flex-col rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-white/70">
                <span>Lab - Live View</span>
                <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-200">Active</span>
              </div>

              <div className="grid grid-cols-6 gap-3.5">
                {labSeatStates.map((state, i) => {
                  const monitorTone =
                    state === 'faulty'
                      ? 'bg-red-400/80 border-red-200/80 shadow-[0_0_0_1px_rgba(254,202,202,0.35)]'
                      : state === 'maintenance'
                        ? 'bg-amber-300/80 border-amber-100/80 shadow-[0_0_0_1px_rgba(254,243,199,0.35)]'
                        : 'bg-white/30 border-white/40 hover:bg-white/45';

                  const towerTone =
                    state === 'faulty'
                      ? 'bg-red-300/70 border-red-100/80'
                      : state === 'maintenance'
                        ? 'bg-amber-200/70 border-amber-100/80'
                        : 'bg-white/20 border-white/40';

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSeatClick(i)}
                      aria-label={`Seat ${i + 1} status ${state}`}
                      className="group relative h-10 w-full transition hover:-translate-y-[1px]"
                    >
                      <span className="absolute inset-x-0 bottom-0 flex items-end gap-[2px]">
                        <span className="relative block h-[22px] flex-1">
                          <span className={`absolute inset-0 rounded-[3px] border transition ${monitorTone}`} />
                          <span className="absolute left-[3px] top-[3px] h-[3px] w-[3px] rounded-full bg-white/70" />
                          <span className="absolute left-[35%] -bottom-[3px] h-[3px] w-[30%] rounded-full bg-white/55" />
                          <span className="absolute left-[22%] -bottom-[6px] h-[3px] w-[56%] rounded-full bg-white/35" />
                        </span>

                        <span className={`relative mb-[1px] block h-[24px] w-[7px] rounded-[2px] border ${towerTone}`}>
                          <span className="absolute bottom-[2px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-white/70" />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-3 text-[10px] text-white/70">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Working</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-300" /> Faulty</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-200" /> Maintenance</span>
              </div>

              <p className="mt-2 text-[11px] text-white/70">Click any tile to cycle: Working &rarr; Faulty &rarr; Maintenance &rarr; Working.</p>
            </div>
          </div>

          <div className="relative">
            <form onSubmit={handleSubmit} className="space-y-4 p-8 md:p-9">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">{mode === 'login' ? 'Sign In' : 'Sign Up'}</p>
              <h2 className="text-4xl font-semibold leading-none text-ink">{mode === 'login' ? 'Welcome Back.' : 'Create Account.'}</h2>
              <p className="text-sm text-gray-500">
                {mode === 'login' 
                  ? 'Access your lab dashboard or submit a complaint.' 
                  : 'Create a student account to access lab services.'}
              </p>

              {mode === 'login' ? (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1.5">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, role: 'student' }))}
                    className="relative rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  >
                    {form.role === 'student' && (
                      <motion.span
                        layoutId="login-role-slider"
                        className="absolute inset-0 rounded-lg bg-white shadow-sm"
                        transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.7 }}
                      />
                    )}
                    <span className={`relative z-10 ${form.role === 'student' ? 'text-gray-900' : 'text-gray-500'}`}>Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, role: 'admin' }))}
                    className="relative rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  >
                    {form.role === 'admin' && (
                      <motion.span
                        layoutId="login-role-slider"
                        className="absolute inset-0 rounded-lg bg-white shadow-sm"
                        transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.7 }}
                      />
                    )}
                    <span className={`relative z-10 ${form.role === 'admin' ? 'text-gray-900' : 'text-gray-500'}`}>Admin</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                    <ShieldCheck size={14} />
                    Student Account
                  </span>
                </div>
              )}

              {mode === 'signup' && (
                <label className="block">
                  <span className="mb-1 block text-sm text-gray-700">Full Name</span>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your name"
                      className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3"
                      required
                    />
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">Email Address</span>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    type="email"
                    placeholder="you@branch.vjti.ac.in"
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm text-gray-700">Password</span>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-9"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-accent"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button
                className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                disabled={loading || authSuccess}
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <div className="pt-2 text-center text-sm text-gray-600">
                <button type="button" className="text-accent" onClick={() => setMode((p) => (p === 'login' ? 'signup' : 'login'))}>
                  {mode === 'login' ? 'Do not have an account? Create one' : 'Already have an account? Sign in'}
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
                <ShieldCheck size={12} />
                Secured auth for campus lab access
              </div>
            </form>

            {authSuccess && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/95"
              >
                <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <CircleCheckBig size={28} />
                </div>
                <p className="font-semibold text-gray-800">Welcome {form.role === 'admin' ? 'Admin' : 'Back'}!</p>
                <p className="text-sm text-gray-500">Loading your dashboard...</p>
                <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-gray-200">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.9, ease: 'easeInOut' }}
                  />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      <p className="relative z-10 mt-6 text-center text-xs text-gray-400">Secured by LabTrack Auth - Campus Lab Asset Management</p>
    </div>
  );
}
