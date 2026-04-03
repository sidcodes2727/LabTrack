import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Bell, LogOut, Search } from 'lucide-react';
import { api } from '../lib/api';
import LabVisualizer from '../components/LabVisualizer';
import ComplaintModal from '../components/ComplaintModal';
import Skeleton from '../components/Skeleton';

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

  useEffect(() => {
    loadLabs();
    loadComplaints();
  }, []);

  useEffect(() => {
    loadAssets();
  }, [selectedLab, search]);

  const selectedLabel = useMemo(() => (selectedAsset ? `${selectedAsset.system_id} (${selectedAsset.status})` : 'Select a PC node'), [selectedAsset]);
  const selectedLabMeta = useMemo(() => labs.find((l) => l.lab === selectedLab), [labs, selectedLab]);

  const panelContent = useMemo(() => {
    if (panelTab === 'complaints') {
      if (!myComplaints.length) {
        return <p className="text-sm text-gray-500">No complaints submitted yet.</p>;
      }

      return (
        <div className="space-y-2">
          {myComplaints.map((item) => (
            <div key={item.id} className="rounded-xl border border-[#9d2235]/10 bg-[#f8f3f4] p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-mono text-xs text-gray-700">{item.assets?.system_id || 'Unknown System'}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase text-gray-600">{item.status}</span>
              </div>
              <p className="text-sm text-gray-700">{item.description}</p>
              <p className="mt-1 text-xs text-gray-500">Priority: {item.priority}</p>
            </div>
          ))}
        </div>
      );
    }

    if (panelTab === 'timeline') {
      if (!selectedAsset) {
        return <p className="text-sm text-gray-500">Select a PC to view timeline.</p>;
      }

      return (
        <div className="space-y-3">
          {history.map((item) => (
            <div key={item.id} className="border-l-2 border-accent/30 pl-3 text-sm">
              <p className="font-medium">{item.event_type}</p>
              <p className="text-gray-600">{item.details}</p>
              <p className="text-xs text-gray-500">{item.event_date}</p>
            </div>
          ))}
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

      <header className="relative z-20 flex h-14 items-center justify-between border-b border-[#9d2235]/10 bg-white/95 px-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">Lab <span className="text-accent">Track</span></div>
          <span className="h-5 w-px bg-[#9d2235]/15" />
          <span className="text-sm text-gray-500">Student Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="relative rounded-lg border border-[#9d2235]/20 bg-white p-2 text-gray-600 hover:border-[#9d2235]/35">
            <Bell size={16} />
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
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
      </header>

      {loading ? (
        <div className="p-6">
          <Skeleton className="h-16" />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
            <Skeleton className="h-[520px]" />
            <Skeleton className="h-[520px]" />
          </div>
        </div>
      ) : (
        <div className="relative z-10 grid h-[calc(100vh-56px)] lg:grid-cols-[1fr_320px]">
          <section className="overflow-hidden border-r border-[#9d2235]/10">
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
          </section>

          <aside className="flex h-full flex-col bg-white">
            <div className="grid grid-cols-3 border-b border-[#9d2235]/10">
              <button onClick={() => setPanelTab('details')} className={`px-2 py-3 text-xs ${panelTab === 'details' ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>PC Details</button>
              <button onClick={() => setPanelTab('timeline')} className={`px-2 py-3 text-xs ${panelTab === 'timeline' ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>Timeline</button>
              <button onClick={() => setPanelTab('complaints')} className={`px-2 py-3 text-xs ${panelTab === 'complaints' ? 'border-b-2 border-accent text-accent' : 'text-gray-500'}`}>
                My Complaints <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{myComplaints.length}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="mb-2 text-sm font-semibold">{panelTab === 'details' ? 'Selected Asset' : panelTab === 'timeline' ? 'Asset History' : 'Your Tickets'}</h3>
              {panelTab !== 'details' && <p className="mb-3 font-mono text-[11px] text-gray-500">{selectedLabel}</p>}
              {panelContent}
            </div>
          </aside>
        </div>
      )}

      {selectedAsset && <ComplaintModal open={modalOpen} onClose={() => setModalOpen(false)} asset={selectedAsset} onDone={() => { loadAssets(); loadComplaints(); }} />}
    </div>
  );
}
