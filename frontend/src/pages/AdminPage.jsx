import { useEffect, useState } from 'react';
import { Download, LogOut, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import DashboardCharts from '../components/DashboardCharts';
import KanbanBoard from '../components/KanbanBoard';
import NotificationBell from '../components/NotificationBell';

export default function AdminPage({ session, onLogout }) {
  const [dashboard, setDashboard] = useState({ totals: {}, complaintsPerLab: [], byStatus: [] });
  const [cards, setCards] = useState([]);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState({
    lab: '',
    status: '',
    priority: '',
    section: '',
    from: '',
    to: ''
  });

  const load = async () => {
    try {
      const [{ data: dashData }, { data: cardsData }] = await Promise.all([api.get('/admin/dashboard'), api.get('/admin/kanban')]);
      setDashboard(dashData);
      setCards(cardsData);
    } catch {
      toast.error('Failed to load admin dashboard');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/admin/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(`Imported ${data.imported} assets`);
      load();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const exportFile = async (format) => {
    try {
      const { data } = await api.get('/admin/export', {
        params: { ...filters, format },
        responseType: 'blob'
      });

      const ext = format === 'excel' ? 'xlsx' : format;
      const blobUrl = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `complaints.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`${format.toUpperCase()} export ready`);
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(160deg,#ffffff_0%,#fff6f7_60%,#ffeef1_100%)] p-6">
      <motion.header initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white/80 p-4 shadow-glass backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-semibold">Admin Control Center</h1>
          <p className="text-sm text-gray-600">{session.user.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button className="flex items-center gap-2 rounded-xl border px-3 py-2" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </motion.header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Assets</p>
          <p className="font-mono text-2xl">{dashboard.totals.assets || 0}</p>
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Faulty Assets</p>
          <p className="font-mono text-2xl text-accent">{dashboard.totals.faulty || 0}</p>
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Open Complaints</p>
          <p className="font-mono text-2xl">{cards.filter((c) => c.status !== 'resolved').length}</p>
        </div>
      </section>

      <section className="mb-6">
        <DashboardCharts data={dashboard} />
      </section>

      <section className="mb-6 rounded-3xl bg-white/80 p-4 shadow-glass backdrop-blur-md">
        <div className="mb-3 grid gap-2 md:grid-cols-6">
          <input
            placeholder="Lab"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.lab}
            onChange={(e) => setFilters((p) => ({ ...p, lab: e.target.value }))}
          />
          <input
            placeholder="Section"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.section}
            onChange={(e) => setFilters((p) => ({ ...p, section: e.target.value }))}
          />
          <select
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.priority}
            onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value }))}
          >
            <option value="">All Priority</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <input
            type="date"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
          />
          <input
            type="date"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <Upload size={16} />
            {importing ? 'Importing...' : 'Import CSV/Excel'}
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} />
          </label>
          <button onClick={() => exportFile('csv')} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => exportFile('excel')} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <Download size={16} /> Export Excel
          </button>
          <button onClick={() => exportFile('pdf')} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <Download size={16} /> Export PDF
          </button>
        </div>
      </section>

      <section>
        <KanbanBoard items={cards} onRefresh={load} />
      </section>
    </div>
  );
}
