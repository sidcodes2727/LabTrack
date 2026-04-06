import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { LogOut, Search } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import LabVisualizer from '../components/LabVisualizer';
import ComplaintModal from '../components/ComplaintModal';
import Skeleton from '../components/Skeleton';
import NotificationBell from '../components/NotificationBell';
import { getSocket } from '../lib/socket';

const formatComplaintDate = (rawDate) => {
  if (!rawDate) return 'No date';
  return new Date(rawDate).toLocaleDateString('en-CA');
};

const complaintStatusConfig = {
  pending: {
    label: 'Pending',
    tone: 'bg-[#f7ddd7] text-[#a6483b]'
  },
  in_progress: {
    label: 'In Progress',
    tone: 'bg-[#f7ddd7] text-[#a6483b]'
  },
  resolved: {
    label: 'Resolved',
    tone: 'bg-[#dceadf] text-[#2e7b49]'
  }
};

const timelineEventTone = {
  maintenance: 'bg-[#c17b1d]',
  purchase: 'bg-[#2f855a]',
  complaint: 'bg-[#9d2235]'
};

export default function StudentPage({ session, onLogout }) {
  const [labs, setLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState('');
  const [assets, setAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('details');
  const [myComplaints, setMyComplaints] = useState([]);

  const loadLabs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/assets/labs');
      setLabs(data);
      if (data[0]?.lab && !selectedLab) setSelectedLab(data[0].lab);
    } catch {
      toast.error('Failed to load labs');
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    if (!selectedLab) return;
    try {
      const { data } = await api.get(`/assets/${selectedLab}`, {
        params: { q: search || undefined }
      });
      setAssets(data);
    } catch {
      toast.error('Failed to load assets');
    }
  };

  const loadComplaints = async () => {
    try {
      const { data } = await api.get('/complaints');
      setMyComplaints(data || []);
    } catch {
      setMyComplaints([]);
    }
  };

  const loadDetail = async (asset) => {
    setSelectedAsset(asset);
    setPanelTab('details');
    const { data } = await api.get(`/assets/detail/${asset.system_id}`);
    setHistory(data.history || []);
  };

  const refreshSelectedDetail = async () => {
    if (!selectedAsset?.system_id) return;
    try {
      const { data } = await api.get(`/assets/detail/${selectedAsset.system_id}`);
      setHistory(data.history || []);
      if (data.asset) {
        setSelectedAsset((prev) => ({ ...(prev || {}), ...data.asset }));
      }
    } catch {
      // Keep current view if refresh fails.
    }
  };

  useEffect(() => {
    loadLabs();
    loadComplaints();
  }, []);

  useEffect(() => {
    loadAssets();
  }, [selectedLab, search]);

  useEffect(() => {
    const socket = getSocket(session?.token);
    if (!socket) return undefined;

    const handleUpdate = (payload) => {
      if (payload?.userId && payload.userId !== session.user.id) return;
      loadComplaints();
      loadAssets();
      refreshSelectedDetail();
    };

    socket.on('labtrack:update', handleUpdate);

    return () => {
      socket.off('labtrack:update', handleUpdate);
    };
  }, [session?.token, session?.user?.id, selectedAsset?.system_id, selectedLab, search]);

  const selectedLabMeta = useMemo(() => labs.find((l) => l.lab === selectedLab), [labs, selectedLab]);

  const panelContent = useMemo(() => {
    if (panelTab === 'complaints') {
      if (!myComplaints.length) {
        return <p className="text-sm text-gray-500">No complaints submitted yet.</p>;
      }

      return (
        <div>
          <h3 className="mb-4 text-[22px] font-semibold tracking-tight text-[#1f1417]">My Submitted Complaints</h3>
          <div className="space-y-4">
          {myComplaints.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#ded8d6] border-l-[3px] border-l-[#ad2240] bg-[#f1edeb] px-4 py-3"
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <p className="font-mono text-[16px] font-semibold leading-none tracking-tight text-[#17131a]">
                  {item.assets?.system_id || 'Unknown System'}
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-tight ${complaintStatusConfig[item.status]?.tone || 'bg-[#ebebeb] text-[#555]'}`}
                >
                  {complaintStatusConfig[item.status]?.label || item.status}
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-snug text-[#575061]">{item.description}</p>
              <p className="mt-2 text-[12px] text-[#958e9c]">
                {formatComplaintDate(item.created_at)} · Priority: <span className="font-semibold text-[#8f2f45]">{item.priority || 'Medium'}</span>
              </p>
            </div>
          ))}
          </div>
        </div>
      );
    }

    if (panelTab === 'timeline') {
      if (!selectedAsset) {
        return <p className="text-sm text-gray-500">Select a PC to view timeline.</p>;
      }

      return (
        <div>
          <h3 className="mb-5 text-[26px] font-medium tracking-tight text-[#1f1417]">Timeline - {selectedAsset.system_id}</h3>
          <div className="space-y-1">
            {history.map((item, index) => {
              const normalized = (item.event_type || '').toLowerCase();
              const tone = Object.keys(timelineEventTone).find((key) => normalized.includes(key));

              return (
                <div key={item.id} className="relative pl-6">
                  <span className={`absolute left-0 top-2.5 h-2.5 w-2.5 rounded-full ${timelineEventTone[tone] || 'bg-[#8a8290]'}`} />
                  {index !== history.length - 1 && <span className="absolute left-[4px] top-5 h-[calc(100%-4px)] w-px bg-[#d9d3d0]" />}
                  <div className="pb-5">
                    <p className="text-[16px] font-semibold text-[#18131e]">{item.event_type}</p>
                    <p className="mt-0.5 text-[14px] leading-snug text-[#5b5564]">{item.details}</p>
                    <p className="mt-1 text-[12px] text-[#9b94a1]">{formatComplaintDate(item.event_date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {!history.length && <p className="text-sm text-gray-500">No timeline events yet.</p>}
        </div>
      );
    }

    if (!selectedAsset) {
      return <p className="text-sm text-gray-500">Click any node in the map to inspect asset details.</p>;
    }

    const statusTone = {
      working: 'bg-emerald-100 text-emerald-700',
      faulty: 'bg-red-100 text-red-700',
      maintenance: 'bg-amber-100 text-amber-700'
    };

    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-2xl border border-[#9d2235]/10 bg-[#f8f3f4] p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e6ebea] text-lg">🖥️</div>
            <div className="min-w-0">
              <p className="truncate font-mono text-[22px] font-semibold leading-none tracking-tight text-[#131018]">{selectedAsset.system_id}</p>
              <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone[selectedAsset.status] || 'bg-slate-100 text-slate-700'}`}>
                {selectedAsset.status}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#9d2235]/10 bg-white">
          <div className="flex items-center justify-between border-b border-[#9d2235]/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">System ID</span>
            <span className="font-mono text-sm text-[#121019]">{selectedAsset.system_id}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#9d2235]/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Original ID</span>
            <span className="max-w-[140px] truncate font-mono text-xs text-[#121019]">{selectedAsset.original_id || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#9d2235]/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">CPU</span>
            <span className="text-sm font-medium text-[#121019]">{selectedAsset.cpu || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#9d2235]/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">RAM</span>
            <span className="text-sm font-medium text-[#121019]">{selectedAsset.ram || '-'}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#9d2235]/8 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Purchase Date</span>
            <span className="font-mono text-sm text-[#121019]">{selectedAsset.purchase_date || '-'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">Last Maintenance</span>
            <span className="font-mono text-sm text-[#121019]">{selectedAsset.last_maintenance || '-'}</span>
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="w-full rounded-2xl bg-accent px-4 py-3 font-semibold text-white shadow-[0_8px_20px_rgba(157,34,53,0.25)] transition hover:brightness-95"
        >
          Report an Issue
        </button>
      </div>
    );
  }, [panelTab, selectedAsset, history, myComplaints]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5f0eb]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(157,34,53,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(157,34,53,0.045)_1px,transparent_1px)] bg-[size:38px_38px]" />

      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-20 flex h-14 items-center justify-between border-b border-[#9d2235]/10 bg-white/95 px-5 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">Lab <span className="text-accent">Track</span></div>
          <span className="h-5 w-px bg-[#9d2235]/15" />
          <span className="text-sm text-gray-500">Student Portal</span>
          <nav className="ml-4 hidden items-center gap-2 md:flex">
            <NavLink
              to="/student"
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-[#9d2235]/10 font-medium text-accent' : 'text-gray-600 hover:bg-[#9d2235]/8 hover:text-[#4a2330]'}`}
              end
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/student/history"
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-[#9d2235]/10 font-medium text-accent' : 'text-gray-600 hover:bg-[#9d2235]/8 hover:text-[#4a2330]'}`}
            >
              Complaint History
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell endpoint="/complaints/notifications" panelTitle="Student Notifications" />
          <div className="flex items-center gap-2 rounded-lg border border-[#9d2235]/15 bg-white px-2 py-1 text-xs text-gray-600">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#9d2235]/10 font-semibold text-accent">
              {(session.user.name || 'S').charAt(0).toUpperCase()}
            </span>
            {session.user.name}
          </div>
          <button className="flex items-center gap-1 rounded-lg border border-[#9d2235]/20 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-[#9d2235]/35" onClick={onLogout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </motion.header>

      {loading ? (
        <motion.div
          initial={{ opacity: 0.4 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="p-6"
        >
          <Skeleton className="h-16" />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <Skeleton className="h-[520px]" />
            <Skeleton className="h-[520px]" />
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative z-10 grid h-[calc(100vh-56px)] lg:grid-cols-[1fr_320px]"
        >
          <motion.section
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="overflow-hidden border-r border-[#9d2235]/10"
          >
            <div className="flex overflow-x-auto border-b border-[#9d2235]/10 bg-white px-4">
              {labs.map((lab) => {
                const faultPct = lab.total ? Math.round((lab.faulty / lab.total) * 100) : 0;
                return (
                  <button
                    key={lab.lab}
                    onClick={() => setSelectedLab(lab.lab)}
                    className={`min-w-[140px] border-b-2 px-4 py-3 text-left ${selectedLab === lab.lab ? 'border-accent bg-[#fff8f8]' : 'border-transparent hover:bg-[#faf6f7]'}`}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-wide ${selectedLab === lab.lab ? 'text-accent' : 'text-gray-700'}`}>{lab.lab}</p>
                    <p className="text-[11px] text-gray-500">{lab.total} systems</p>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[#f0e6e7]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${faultPct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="h-[calc(100%-56px)] overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Lab Layout - {selectedLab}</h2>
                  <p className="text-xs text-gray-500">{selectedLabMeta?.total || 0} systems, {selectedLabMeta?.faulty || 0} faulty</p>
                </div>
                <label className="relative block">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search System ID"
                    className="w-52 rounded-lg border border-[#9d2235]/15 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/50"
                  />
                </label>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> Working</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-600" /> Faulty</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Maintenance</span>
                <span className="ml-auto text-[11px] text-gray-500">Click any PC node to inspect</span>
              </div>

              <div className="-ml-2">
                <LabVisualizer assets={assets} onSelect={loadDetail} selectedId={selectedAsset?.id} />
              </div>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
            className="flex h-full flex-col bg-white"
          >
            <div className="grid grid-cols-3 border-b border-[#9d2235]/10">
              <button
                onClick={() => setPanelTab('details')}
                className={`px-2 py-3 text-[12px] ${panelTab === 'details' ? 'border-b-2 border-accent bg-[#ebe7e2] font-medium text-[#161017]' : 'text-[#5f5663]'}`}
              >
                PC Details
              </button>
              <button
                onClick={() => setPanelTab('timeline')}
                className={`px-2 py-3 text-[12px] ${panelTab === 'timeline' ? 'border-b-2 border-accent bg-[#ebe7e2] font-medium text-[#161017]' : 'text-[#5f5663]'}`}
              >
                Timeline
              </button>
              <button
                onClick={() => setPanelTab('complaints')}
                className={`px-2 py-3 text-[12px] ${panelTab === 'complaints' ? 'border-b-2 border-accent bg-[#ebe7e2] font-medium text-accent' : 'text-[#5f5663]'}`}
              >
                <span className="flex items-center justify-center gap-1">
                  My Complaints
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                    {myComplaints.length}
                  </span>
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${panelTab}-${selectedAsset?.id || 'none'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {panelTab === 'details' && (
                    <h3 className="mb-2 text-sm font-semibold">Selected Asset</h3>
                  )}
                  {panelContent}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </motion.div>
      )}

      {selectedAsset && <ComplaintModal open={modalOpen} onClose={() => setModalOpen(false)} asset={selectedAsset} onDone={() => { loadAssets(); loadComplaints(); }} />}
    </div>
  );
}
