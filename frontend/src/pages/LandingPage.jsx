import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import {
  BarChart3,
  Bot,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Gauge,
  Map,
  ShieldCheck,
  Sparkles,
  Ticket,
  User,
  Wrench
} from 'lucide-react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { api } from '../lib/api';

const BOOT_SEEN_KEY = 'labtrack_boot_seen';

const phaseOrder = ['fault', 'repair', 'online'];

const phaseMeta = {
  fault: {
    label: 'Fault Detected',
    description: 'A power rail mismatch was detected in the compute bay.',
    tone: 'text-[#b13a4d]'
  },
  repair: {
    label: 'Repair In Progress',
    description: 'Applying autonomous diagnostics and restoring core services.',
    tone: 'text-[#b1782d]'
  },
  online: {
    label: 'System Online',
    description: 'All nodes synchronized. Navigation experience is ready.',
    tone: 'text-[#2f855a]'
  }
};

const heroStats = [
  { label: 'Lab Nodes Monitored', value: '124' },
  { label: 'AI Priority Suggestion', value: '< 5 sec' },
  { label: 'Issue Timeline Visibility', value: '100%' }
];

const workflowSteps = [
  {
    title: 'Visual Asset Discovery',
    description: 'Each system appears on an interactive lab map so students can instantly locate and report the right machine.',
    icon: Map
  },
  {
    title: 'Smart Complaint Intake',
    description: 'Complaints are structured with priorities and system IDs, reducing incomplete reports and back-and-forth.',
    icon: Ticket
  },
  {
    title: 'AI Assisted Triage',
    description: 'AI helps classify urgency, summarize issue patterns, and guide faster admin decision-making.',
    icon: Bot
  },
  {
    title: 'Actionable Resolution Analytics',
    description: 'Admins track status, timelines, and outcomes to improve uptime and plan maintenance with data.',
    icon: BarChart3
  }
];

const audienceCards = [
  {
    title: 'For Students',
    subtitle: 'Fast reporting with transparency',
    description: 'Students can quickly report faults and follow progress without guessing whether an issue is acknowledged.',
    points: ['One-click complaint filing', 'Real-time status updates', 'Clear machine-level history'],
    icon: User,
    frameTone: 'border-[#8c3346] bg-[#3a2930]',
    screenTone: 'bg-[#fdf5f6]',
    cableTone: 'bg-[#b74d63]'
  },
  {
    title: 'For Admin Teams',
    subtitle: 'Structured operations workflow',
    description: 'Admins get a centralized control layer to prioritize repairs, coordinate action, and monitor SLAs.',
    points: ['Kanban-style complaint flow', 'Severity-aware escalation', 'Operational dashboard insights'],
    icon: ShieldCheck,
    frameTone: 'border-[#3f5470] bg-[#2d3948]',
    screenTone: 'bg-[#f5f8ff]',
    cableTone: 'bg-[#49627f]'
  },
  {
    title: 'For Lab Management',
    subtitle: 'Reliability and accountability',
    description: 'Management receives a longitudinal view of asset health to drive maintenance planning and budget decisions.',
    points: ['Fault trend tracking', 'Maintenance timeline records', 'Data-backed replacement planning'],
    icon: Gauge,
    frameTone: 'border-[#3f6a4e] bg-[#2d4736]',
    screenTone: 'bg-[#f5fbf7]',
    cableTone: 'bg-[#4f8a67]'
  }
];

const valuePillars = [
  {
    title: 'Why We Built TrackLab',
    description:
      'Campus labs usually rely on scattered spreadsheets and verbal updates. We built TrackLab to turn that into a single visible system of record.'
  },
  {
    title: 'What Makes It Different',
    description:
      'TrackLab connects map context, complaint workflows, AI triage, and status communication in one loop instead of disconnected tools.'
  },
  {
    title: 'What You Gain',
    description:
      'Less downtime during lab hours, faster issue ownership, and confidence for students and staff that every complaint has traceable progress.'
  }
];

const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 }
};

const sectionViewport = { once: true, amount: 0.2 };

const FALLBACK_LIVE_SNAPSHOT = {
  snapshot: {
    working: 82,
    maintenance: 12,
    faulty: 6,
    summary:
      'Complaints move from report to resolution with visible status transitions, making communication clear for students and actionable for administrators.'
  },
  labStatuses: [
    { id: 'LAB 2', state: 'maint' },
    { id: 'LAB 3A', state: 'ok' },
    { id: 'LAB 3B', state: 'fault' }
  ],
  recentActivity: [
    'Lab 2 • PC-16 moved to In Progress',
    'Lab 1 • New complaint filed for PC-04',
    'Lab 5 • PC-09 marked Resolved'
  ]
};

const OVERDUE_THRESHOLD_DAYS = 3;

const clampPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export default function LandingPage({ session }) {
  const snapshotCardRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  const shouldBootSequence = useMemo(() => {
    if (session) return false;
    if (typeof window === 'undefined') return false;

    const hasSeenBoot = window.sessionStorage.getItem(BOOT_SEEN_KEY) === '1';
    const hasInPageHash = Boolean(window.location.hash);

    return !hasSeenBoot && !hasInPageHash;
  }, [session]);

  const [phase, setPhase] = useState(() => (shouldBootSequence ? 'fault' : 'online'));
  const [showLanding, setShowLanding] = useState(() => !shouldBootSequence);
  const [liveSnapshot, setLiveSnapshot] = useState(FALLBACK_LIVE_SNAPSHOT);
  const [overdueComplaints, setOverdueComplaints] = useState([]);
  const [isOverdueLoading, setIsOverdueLoading] = useState(false);

  const snapshotRotateX = useMotionValue(0);
  const snapshotRotateY = useMotionValue(0);
  const snapshotOffsetX = useMotionValue(0);
  const snapshotOffsetY = useMotionValue(0);

  const snapshotRotateXSpring = useSpring(snapshotRotateX, { stiffness: 130, damping: 18, mass: 0.45 });
  const snapshotRotateYSpring = useSpring(snapshotRotateY, { stiffness: 130, damping: 18, mass: 0.45 });
  const snapshotOffsetXSpring = useSpring(snapshotOffsetX, { stiffness: 140, damping: 20, mass: 0.5 });
  const snapshotOffsetYSpring = useSpring(snapshotOffsetY, { stiffness: 140, damping: 20, mass: 0.5 });

  const primaryPath = useMemo(() => {
    if (!session) return '/login';
    return session.user.role === 'admin' ? '/admin' : '/student';
  }, [session]);

  useEffect(() => {
    if (!shouldBootSequence) {
      setPhase('online');
      setShowLanding(true);
      return undefined;
    }

    // Mark once so browser back/forward does not replay the full intro sequence.
    window.sessionStorage.setItem(BOOT_SEEN_KEY, '1');

    const timers = [
      setTimeout(() => setPhase('repair'), 1300),
      setTimeout(() => setPhase('online'), 2800),
      setTimeout(() => setShowLanding(true), 3900)
    ];

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [shouldBootSequence]);

  useEffect(() => {
    let mounted = true;

    const loadLandingSnapshot = async () => {
      try {
        const { data } = await api.get('/assets/landing-snapshot');
        if (!mounted || !data) return;

        const safeSnapshot = {
          working: clampPercent(data.snapshot?.working),
          maintenance: clampPercent(data.snapshot?.maintenance),
          faulty: clampPercent(data.snapshot?.faulty),
          summary: data.snapshot?.summary || FALLBACK_LIVE_SNAPSHOT.snapshot.summary
        };

        const safeLabStatuses = (Array.isArray(data.labStatuses) ? data.labStatuses : [])
          .filter((item) => item?.id)
          .map((item) => ({
            id: String(item.id),
            state: item.state === 'ok' || item.state === 'maint' || item.state === 'fault' ? item.state : 'ok'
          }));

        const safeRecentActivity = (Array.isArray(data.recentActivity) ? data.recentActivity : [])
          .filter((line) => typeof line === 'string' && line.trim().length > 0)
          .slice(0, 3);

        setLiveSnapshot({
          snapshot: safeSnapshot,
          labStatuses: safeLabStatuses.length ? safeLabStatuses : FALLBACK_LIVE_SNAPSHOT.labStatuses,
          recentActivity: safeRecentActivity.length ? safeRecentActivity : FALLBACK_LIVE_SNAPSHOT.recentActivity
        });
      } catch {
        // Keep fallback values for resilient first paint.
      }
    };

    loadLandingSnapshot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadOverdueComplaints = async () => {
      setIsOverdueLoading(true);

      try {
        const { data } = await api.get('/complaints/public-overdue', {
          params: {
            days: OVERDUE_THRESHOLD_DAYS,
            limit: 6
          }
        });
        if (!mounted) return;

        setOverdueComplaints(Array.isArray(data) ? data : []);
      } catch {
        if (mounted) setOverdueComplaints([]);
      } finally {
        if (mounted) setIsOverdueLoading(false);
      }
    };

    loadOverdueComplaints();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const snapshotBars = [
    { label: 'Working Nodes', value: liveSnapshot.snapshot.working, tone: 'bg-[#4ca875]' },
    { label: 'Under Maintenance', value: liveSnapshot.snapshot.maintenance, tone: 'bg-[#d8a14a]' },
    { label: 'Critical Faults', value: liveSnapshot.snapshot.faulty, tone: 'bg-[#d34e63]' }
  ];

  const labStateTone = {
    ok: 'bg-[#4ca875]',
    maint: 'bg-[#d8a14a]',
    fault: 'bg-[#d34e63]'
  };

  const handleSnapshotParallax = (event) => {
    if (prefersReducedMotion || typeof window === 'undefined' || window.innerWidth < 1024) return;

    const card = snapshotCardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width - 0.5;
    const relativeY = (event.clientY - rect.top) / rect.height - 0.5;

    snapshotRotateY.set(relativeX * 10);
    snapshotRotateX.set(relativeY * -10);
    snapshotOffsetX.set(relativeX * 3);
    snapshotOffsetY.set(relativeY * 2);
  };

  const resetSnapshotParallax = () => {
    snapshotRotateX.set(0);
    snapshotRotateY.set(0);
    snapshotOffsetX.set(0);
    snapshotOffsetY.set(0);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f2f0] text-[#20181c]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(157,34,53,0.16),transparent_31%),radial-gradient(circle_at_84%_10%,rgba(220,170,124,0.22),transparent_24%),radial-gradient(circle_at_88%_82%,rgba(157,34,53,0.12),transparent_29%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(157,34,53,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(157,34,53,0.05)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="noise-overlay pointer-events-none fixed inset-0" />

      <AnimatePresence mode="wait">
        {!showLanding ? (
          <motion.section
            key="boot-sequence"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.03, filter: 'blur(8px)' }}
            transition={{ duration: 0.65, ease: 'easeInOut' }}
            className="relative z-10 grid min-h-screen place-items-center p-6"
          >
            <div className="w-full max-w-3xl rounded-[30px] border border-[#9d2235]/15 bg-white/90 p-6 shadow-[0_32px_70px_rgba(89,35,44,0.18)] backdrop-blur-xl md:p-8">
              <div className="mb-6 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[#835864]">
                <span>LabTrack Boot Sequence</span>
                <span className="rounded-full border border-[#9d2235]/20 bg-[#f8eded] px-2.5 py-1">Node Start</span>
              </div>

              <div className="relative grid place-items-center py-8">
                <motion.div
                  animate={
                    phase === 'fault'
                      ? { rotate: [0, 0.7, -0.7, 0], y: [0, -1, 1, 0] }
                      : { rotate: 0, y: 0 }
                  }
                  transition={{ duration: 0.35, repeat: phase === 'fault' ? Infinity : 0 }}
                  className="relative"
                >
                  <div className="h-48 w-[320px] rounded-[26px] border border-[#423239]/20 bg-[#2a2126] p-3 shadow-[0_20px_36px_rgba(58,31,37,0.35)]">
                    <div
                      className={`relative h-full overflow-hidden rounded-[18px] border ${
                        phase === 'fault'
                          ? 'border-[#c14a5c]/45 bg-[#3a151d]'
                          : phase === 'repair'
                            ? 'border-[#d39a49]/40 bg-[#2f2413]'
                            : 'border-[#67c08c]/35 bg-[#163126]'
                      }`}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_35%)]" />

                      {phase === 'fault' && (
                        <>
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <motion.span
                              key={idx}
                              initial={{ x: '-120%' }}
                              animate={{ x: '130%' }}
                              transition={{ duration: 0.5 + idx * 0.1, repeat: Infinity, ease: 'linear', delay: idx * 0.05 }}
                              className="absolute left-0 h-[2px] w-24 bg-[#e76f80]/70"
                              style={{ top: `${22 + idx * 18}%` }}
                            />
                          ))}
                          <div className="absolute inset-0 grid place-items-center">
                            <div className="flex items-center gap-2 rounded-full border border-[#dd7a89]/30 bg-[#4a1b24]/80 px-3 py-1.5 text-xs text-[#ffc4cd]">
                              <AlertTriangle size={14} /> Hardware Fault
                            </div>
                          </div>
                        </>
                      )}

                      {phase === 'repair' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                            className="grid h-11 w-11 place-items-center rounded-full border border-[#e5b265]/40 bg-[#493417]/70 text-[#ffd088]"
                          >
                            <Wrench size={17} />
                          </motion.div>
                          <div className="w-52 overflow-hidden rounded-full border border-[#e8bc74]/35 bg-[#3f2d14] p-1">
                            <motion.div
                              className="h-1.5 rounded-full bg-[#f4c57b]"
                              initial={{ width: '18%' }}
                              animate={{ width: ['18%', '84%'] }}
                              transition={{ duration: 1.2, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                            />
                          </div>
                        </div>
                      )}

                      {phase === 'online' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <motion.div
                            initial={{ scale: 0.7, opacity: 0.7 }}
                            animate={{ scale: [0.86, 1.08, 1], opacity: [0.7, 1, 1] }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="grid h-12 w-12 place-items-center rounded-full bg-[#18422f] text-[#9cf5c2] shadow-[0_0_25px_rgba(88,180,118,0.34)]"
                          >
                            <CheckCircle2 size={20} />
                          </motion.div>
                          <p className="text-sm font-medium text-[#a5f2c8]">Stability restored</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mx-auto mt-2 h-3 w-32 rounded-full bg-[#503d44] shadow-[0_12px_22px_rgba(63,42,49,0.48)]" />
                </motion.div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className={`text-2xl font-semibold ${phaseMeta[phase].tone}`}>{phaseMeta[phase].label}</h2>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#8d6872]">Auto Recovery</div>
                </div>

                <p className="text-sm text-[#63545a]">{phaseMeta[phase].description}</p>

                <div className="flex items-center gap-2">
                  {phaseOrder.map((node, index) => {
                    const active = phaseOrder.indexOf(phase) >= index;
                    return (
                      <span
                        key={node}
                        className={`h-2.5 flex-1 rounded-full transition ${active ? 'bg-accent' : 'bg-[#e4d8d5]'}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.main
            key="landing-main"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="relative z-10 min-h-screen px-5 pb-10 pt-6 md:px-8"
          >
            <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#9d2235]/12 bg-white/80 px-4 py-3 shadow-[0_14px_34px_rgba(87,32,43,0.12)] backdrop-blur-xl md:px-6">
              <BrandLogo compact className="shrink-0" />

              <div className="hidden items-center gap-5 text-sm font-medium text-[#684f57] md:flex">
                <a href="#about" className="transition hover:text-accent">About</a>
                <a href="#workflow" className="transition hover:text-accent">Workflow</a>
                <a href="#audience" className="transition hover:text-accent">Who It Helps</a>
                <a href="#impact" className="transition hover:text-accent">Impact</a>
              </div>

              <Link
                to={primaryPath}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(157,34,53,0.35)]"
              >
                Enter Portal
                <ArrowRight size={15} />
              </Link>
            </header>

            <motion.section
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl"
            >
              <div className="rounded-[34px] border border-[#9d2235]/14 bg-[linear-gradient(135deg,#fff9f6_0%,#fff4f2_50%,#fff9f7_100%)] p-6 shadow-[0_26px_50px_rgba(104,45,57,0.14)] md:p-8">
                <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
                  <div>
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 }}
                      className="inline-flex items-center gap-2 rounded-full border border-[#9d2235]/18 bg-white px-3 py-1 text-xs uppercase tracking-[0.14em] text-[#8e3c4d]"
                    >
                      Built For Campus Lab Reliability
                    </motion.span>

                    <motion.h1
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mt-4 text-4xl font-semibold leading-[1.02] text-[#24171d] md:text-6xl"
                    >
                      One System to Report,
                      <br />
                      Track, and Resolve
                      <br />
                      Lab Issues.
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-5 max-w-2xl text-[15px] leading-7 text-[#61545a]"
                    >
                      TrackLab is a campus-first platform for lab asset health. Students can report machine issues quickly, admins can prioritize and resolve complaints through a structured flow, and management gets complete visibility into uptime and maintenance history.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="mt-7 flex flex-wrap items-center gap-3"
                    >
                      <Link
                        to={primaryPath}
                        className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_28px_rgba(157,34,53,0.34)] transition hover:-translate-y-0.5"
                      >
                        Launch Dashboard
                        <ArrowRight size={15} />
                      </Link>
                      <a
                        href="#about"
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#9d2235]/20 bg-white/80 px-5 py-3 text-sm font-semibold text-[#5b4550] transition hover:border-[#9d2235]/45"
                      >
                        Explore How It Works
                      </a>
                    </motion.div>

                    <div className="mt-7 grid gap-4 sm:grid-cols-3">
                      {heroStats.map((item) => (
                        <motion.div
                          key={item.label}
                          whileHover={{ y: -3 }}
                          transition={{ duration: 0.2 }}
                          className="relative pt-4"
                        >
                          <span className="pointer-events-none absolute left-1/2 top-0 h-4 w-[2px] -translate-x-1/2 rounded-full bg-[#9d2235]/45" />
                          <div className="rounded-[20px] border-4 border-[#4a353d] bg-[#2f242a] p-1.5 shadow-[0_12px_20px_rgba(58,35,43,0.2)]">
                            <div className="rounded-[14px] border border-[#9d2235]/14 bg-white px-4 py-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="h-2 w-2 rounded-full bg-[#5ec48a]" />
                                <span className="h-2 w-2 rounded-full bg-[#d9a145]" />
                                <span className="h-2 w-2 rounded-full bg-[#c74b63]" />
                              </div>
                              <p className="text-xl font-semibold text-[#24171d]">{item.value}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[#7a5c66]">{item.label}</p>
                            </div>
                          </div>
                          <div className="mx-auto mt-1 h-2 w-10 rounded-full bg-[#4a353d]" />
                          <div className="mx-auto mt-1 h-1.5 w-16 rounded-full bg-[#5a434b]/70" />
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <motion.div
                    ref={snapshotCardRef}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    onMouseMove={handleSnapshotParallax}
                    onMouseLeave={resetSnapshotParallax}
                    style={{
                      rotateX: snapshotRotateXSpring,
                      rotateY: snapshotRotateYSpring,
                      x: snapshotOffsetXSpring,
                      y: snapshotOffsetYSpring,
                      transformPerspective: 1200,
                      transformStyle: 'preserve-3d',
                      willChange: 'transform'
                    }}
                    className="self-start rounded-[26px] border border-[#9d2235]/14 bg-white/85 p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#8f6670]">Operational Snapshot</p>
                      <span className="rounded-full bg-[#e8f3ec] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2d8051]">Live</span>
                    </div>

                    <div className="space-y-3">
                      {snapshotBars.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-[#5e4e55]">{item.label}</span>
                            <span className="font-semibold text-[#311f26]">{item.value}%</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[#f1e6e6]">
                            <motion.div
                              className={`h-full rounded-full ${item.tone}`}
                              initial={{ width: '0%' }}
                              animate={{ width: `${item.value}%` }}
                              transition={{ duration: 1.2, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#9d2235]/12 bg-[#fff7f6] p-3 text-sm text-[#5f5358]">
                      {liveSnapshot.snapshot.summary}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {liveSnapshot.labStatuses.map((node, index) => (
                        <motion.div
                          key={node.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.35 + index * 0.04 }}
                          className="rounded-xl border border-[#9d2235]/10 bg-white/90 p-2"
                        >
                          <p className="text-[11px] font-semibold text-[#3b2a31]">{node.id}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${labStateTone[node.state] || labStateTone.ok}`} />
                            <span className="text-[10px] uppercase tracking-[0.08em] text-[#8f6670]">{node.state}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#9d2235]/12 bg-white/95 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f6670]">Recent Activity</p>
                      <div className="mt-2 space-y-2">
                        {liveSnapshot.recentActivity.map((line, idx) => (
                          <div key={line} className="flex items-center gap-2 rounded-lg bg-[#faf4f4] px-2.5 py-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${idx === 2 ? 'bg-[#4ca875]' : idx === 1 ? 'bg-[#d34e63]' : 'bg-[#d8a14a]'}`} />
                            <p className="text-xs text-[#5a4b53]">{line}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.section>

            <motion.section
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl"
            >
              {(isOverdueLoading || overdueComplaints.length > 0) && (
                <div className="rounded-3xl border border-[#d34e63]/18 bg-[linear-gradient(150deg,#fff8f8_0%,#fff2f4_100%)] p-5 shadow-[0_18px_38px_rgba(114,36,52,0.14)] md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-[#9d2235]">Attention Required</p>
                      <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-[#2d1a20]">
                        <AlertTriangle size={20} className="text-[#b03048]" />
                        Overdue Complaints
                      </h2>
                      <p className="mt-1 text-sm text-[#6d4d57]">
                        Open complaints older than {OVERDUE_THRESHOLD_DAYS} days are highlighted here for quick follow-up.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#d34e63]/25 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#9d2235]">
                      {overdueComplaints.length} flagged
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {isOverdueLoading ? (
                      <div className="rounded-2xl border border-[#d34e63]/16 bg-white/90 px-4 py-3 text-sm text-[#76565e]">
                        Loading overdue complaints...
                      </div>
                    ) : (
                      overdueComplaints.map((item) => {
                        const description = item.description || 'No description provided.';
                        const shortDescription = description.length > 96 ? `${description.slice(0, 96)}...` : description;
                        const systemLabel = item.assets?.system_id || item.asset_id || 'Unknown System';
                        const locationLabel = item.assets ? `${item.assets.lab}/${item.assets.section}` : 'Unknown Lab';

                        return (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-[#d34e63]/16 bg-white/95 px-4 py-3 shadow-[0_8px_18px_rgba(157,34,53,0.08)]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[#321d24]">{systemLabel} - {locationLabel}</p>
                              <span className="rounded-full bg-[#fdecef] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-[#a02b42]">
                                {item.ageDays} days open
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#665159]">{shortDescription}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </motion.section>

            <motion.section
              id="about"
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-[#9d2235]/12 bg-white/80 p-6 shadow-[0_18px_40px_rgba(92,34,46,0.12)] md:p-8"
            >
              <div className="mb-5 max-w-3xl">
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f6670]">About TrackLab</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#24171d]">A reliability platform built for real campus lab workflows.</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {valuePillars.map((item, idx) => (
                  <motion.article
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ delay: 0.12 + idx * 0.08 }}
                    className="rounded-2xl border border-[#9d2235]/12 bg-[#fff9f8] p-4"
                  >
                    <h3 className="text-lg font-semibold text-[#2a1c22]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#65565d]">{item.description}</p>
                  </motion.article>
                ))}
              </div>
            </motion.section>

            <motion.section
              id="workflow"
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl"
            >
              <div className="rounded-3xl border border-[#9d2235]/12 bg-[linear-gradient(160deg,#fffefe_0%,#fff6f4_100%)] p-6 md:p-8">
                <p className="text-xs uppercase tracking-[0.14em] text-[#8f6670]">Workflow</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#24171d]">How TrackLab works end-to-end</h2>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {workflowSteps.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.35 }}
                        transition={{ delay: 0.1 + index * 0.08 }}
                        className="rounded-2xl border border-[#9d2235]/12 bg-white/90 p-4"
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#fbeef1] text-accent">
                            <Icon size={16} />
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8b5d68]">Step {index + 1}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-[#2a1c22]">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#64555c]">{item.description}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.section>

            <motion.section
              id="audience"
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-[#8f6670]">Who It Helps</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#24171d]">Designed for every stakeholder in the lab ecosystem</h2>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {audienceCards.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <motion.article
                      key={card.title}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.35 }}
                      transition={{ delay: 0.15 + idx * 0.08 }}
                      whileHover={{ y: -4 }}
                      className="relative pt-6"
                    >
                      <span className={`pointer-events-none absolute left-[18%] top-0 h-6 w-[2px] rounded-full ${card.cableTone}`} />
                      <span className={`pointer-events-none absolute left-1/2 top-0 h-5 w-[2px] -translate-x-1/2 rounded-full ${card.cableTone}`} />
                      <span className={`pointer-events-none absolute left-[82%] top-0 h-6 w-[2px] -translate-x-1/2 rounded-full ${card.cableTone}`} />

                      <div className={`rounded-[30px] border-4 p-2 shadow-[0_14px_26px_rgba(59,31,38,0.24)] ${card.frameTone}`}>
                        <div className={`rounded-[22px] border border-black/10 p-5 ${card.screenTone}`}>
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-[#5ec48a]" />
                              <span className="h-2 w-2 rounded-full bg-[#d9a145]" />
                              <span className="h-2 w-2 rounded-full bg-[#c74b63]" />
                            </div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b5f69]">Live Screen</p>
                          </div>

                          <div className="mb-3 flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/85 text-accent shadow-[0_5px_12px_rgba(130,49,67,0.15)]">
                              <Icon size={18} />
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-[#2a1c22]">{card.title}</p>
                              <p className="text-xs uppercase tracking-[0.08em] text-[#8f6670]">{card.subtitle}</p>
                            </div>
                          </div>

                          <p className="text-sm leading-6 text-[#61545a]">{card.description}</p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {card.points.map((point) => (
                              <span key={point} className="rounded-full border border-[#9d2235]/14 bg-white/80 px-2.5 py-1 text-xs text-[#654953]">
                                {point}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mx-auto mt-1.5 h-2.5 w-14 rounded-full bg-[#4b363d]" />
                      <div className="mx-auto mt-1 h-2 w-24 rounded-full bg-[#5d464f]/70" />
                    </motion.article>
                  );
                })}
              </div>
            </motion.section>

            <motion.section
              id="impact"
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-[#9d2235]/12 bg-white p-6 shadow-[0_18px_38px_rgba(92,34,46,0.1)] md:p-8"
            >
              <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#8f6670]">Impact</p>
                  <h2 className="mt-2 text-3xl font-semibold text-[#24171d]">Better visibility means faster fixes and less classroom disruption.</h2>
                  <p className="mt-3 text-sm leading-7 text-[#64555c]">
                    TrackLab brings reporting, diagnostics, assignment, and progress updates into one timeline. Teams spend less time searching for context and more time restoring lab availability.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#9d2235]/12 bg-[#fff8f8] p-4">
                      <p className="text-2xl font-semibold text-accent">24x7</p>
                      <p className="text-sm text-[#665860]">Issue visibility for students and admins</p>
                    </div>
                    <div className="rounded-2xl border border-[#2f855a]/14 bg-[#f3faf6] p-4">
                      <p className="text-2xl font-semibold text-[#2f855a]">Actionable</p>
                      <p className="text-sm text-[#4e6a58]">Maintenance insights from real complaint data</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#9d2235]/12 bg-[linear-gradient(140deg,#9d2235_0%,#872035_55%,#6f1d31_100%)] p-5 text-white shadow-[0_18px_34px_rgba(96,24,39,0.35)]">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/75">From Our Team</p>
                  <p className="mt-3 text-xl font-semibold leading-relaxed">
                    "We built TrackLab to remove uncertainty from lab operations. Every complaint should be visible, actionable, and measurable."
                  </p>
                  <div className="mt-8 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-white/25 px-2.5 py-1">Student-first UX</span>
                    <span className="rounded-full border border-white/25 px-2.5 py-1">Admin workflow clarity</span>
                    <span className="rounded-full border border-white/25 px-2.5 py-1">Reliable maintenance history</span>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-[#9d2235]/12 bg-[#fef8f7] px-6 py-7 text-center shadow-[0_14px_32px_rgba(90,34,46,0.08)] md:px-8"
            >
              <h3 className="text-2xl font-semibold text-[#271920]">Ready to experience TrackLab?</h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-[#66575f]">
                Start with the portal and see how complaint reporting, asset mapping, and admin resolution workflows stay connected from day one.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to={primaryPath}
                  className="inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(157,34,53,0.35)]"
                >
                  Enter TrackLab
                  <ArrowRight size={15} />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-2xl border border-[#9d2235]/20 bg-white px-5 py-3 text-sm font-semibold text-[#5b4550] transition hover:border-[#9d2235]/45"
                >
                  Login & Access Roles
                </Link>
              </div>
            </motion.section>

            <motion.section
              variants={sectionReveal}
              initial="hidden"
              whileInView="visible"
              viewport={sectionViewport}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mx-auto mt-8 w-full max-w-6xl pb-2 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8e3c4d]">Made With Too Much Coffee</p>
            </motion.section>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}