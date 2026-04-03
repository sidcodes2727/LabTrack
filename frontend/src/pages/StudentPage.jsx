import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
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

  const loadDetail = async (asset) => {
    setSelectedAsset(asset);
    const { data } = await api.get(`/assets/detail/${asset.system_id}`);
    setHistory(data.history || []);
  };

  useEffect(() => {
    loadLabs();
  }, []);

  useEffect(() => {
    loadAssets();
  }, [selectedLab, search]);

  const selectedLabel = useMemo(() => (selectedAsset ? `${selectedAsset.system_id} (${selectedAsset.status})` : 'Select a PC node'), [selectedAsset]);

  return (
    <div className="min-h-screen bg-[linear-gradient(140deg,#ffffff_0%,#fff7f8_58%,#ffecef_100%)] p-6">
      <motion.header initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-6 flex items-center justify-between rounded-3xl bg-white/75 p-4 shadow-glass backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-semibold">LabTrack Student Portal</h1>
          <p className="text-sm text-gray-600">Welcome, {session.user.name}</p>
        </div>
        <button className="flex items-center gap-2 rounded-xl border px-3 py-2" onClick={onLogout}>
          <LogOut size={16} /> Logout
        </button>
      </motion.header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {labs.map((lab) => (
                <button
                  key={lab.lab}
                  onClick={() => setSelectedLab(lab.lab)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selectedLab === lab.lab ? 'border-accent bg-white shadow-glass' : 'border-white/70 bg-white/60'
                  }`}
                >
                  <div className="font-semibold">{lab.lab}</div>
                  <div className="text-sm text-gray-600">{lab.total} systems</div>
                  <div className="text-xs text-red-600">{lab.faulty} faulty</div>
                </button>
              ))}
            </div>
            <div className="rounded-3xl bg-white/75 p-4 shadow-glass backdrop-blur-md">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Lab Layout - {selectedLab}</h2>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search System ID / Original ID"
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <LabVisualizer assets={assets} onSelect={loadDetail} selectedId={selectedAsset?.id} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-glass">
              <h3 className="text-lg font-semibold">PC Details</h3>
              <p className="font-mono text-xs text-gray-500">{selectedLabel}</p>
              {selectedAsset ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p><span className="font-medium">System ID:</span> <span className="font-mono">{selectedAsset.system_id}</span></p>
                  <p><span className="font-medium">Original ID:</span> <span className="font-mono text-xs">{selectedAsset.original_id}</span></p>
                  <p><span className="font-medium">CPU/RAM:</span> {selectedAsset.cpu} / {selectedAsset.ram}</p>
                  <p><span className="font-medium">Purchase:</span> {selectedAsset.purchase_date}</p>
                  <p><span className="font-medium">Last Maintenance:</span> {selectedAsset.last_maintenance}</p>
                  <button onClick={() => setModalOpen(true)} className="mt-2 rounded-xl bg-accent px-4 py-2 text-white">
                    Report Issue
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">Click any node in the lab layout to view details.</p>
              )}
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-glass">
              <h3 className="text-lg font-semibold">Asset Timeline</h3>
              <div className="mt-3 space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="border-l-2 border-accent/30 pl-3 text-sm">
                    <p className="font-medium">{item.event_type}</p>
                    <p className="text-gray-600">{item.details}</p>
                    <p className="text-xs text-gray-500">{item.event_date}</p>
                  </div>
                ))}
                {!history.length && <p className="text-sm text-gray-500">No timeline events yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAsset && <ComplaintModal open={modalOpen} onClose={() => setModalOpen(false)} asset={selectedAsset} onDone={loadAssets} />}
    </div>
  );
}
