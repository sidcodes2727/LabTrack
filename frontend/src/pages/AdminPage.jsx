import { useEffect, useState } from 'react';
import { Download, LogOut, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import DashboardCharts from '../components/DashboardCharts';
import KanbanBoard from '../components/KanbanBoard';
import NotificationBell from '../components/NotificationBell';
import { getSocket } from '../lib/socket';

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

  useEffect(() => {
    const socket = getSocket(session?.token);
    if (!socket) return undefined;

    const handleUpdate = () => {
      load();
    };

    socket.on('labtrack:update', handleUpdate);

    return () => {
      socket.off('labtrack:update', handleUpdate);
    };
  }, [session?.token]);

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
    <div className="relative min-h-screen overflow-hidden bg-[#f5f0eb]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(157,34,53,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(157,34,53,0.045)_1px,transparent_1px)] bg-[size:38px_38px]" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-[#9d2235]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[#9d2235]/10 blur-3xl" />

      <motion.header
        initial={{ y: -14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-20 flex h-14 items-center justify-between border-b border-[#9d2235]/10 bg-white/95 px-5 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold tracking-tight">Lab <span className="text-accent">Track</span></div>
          <span className="h-5 w-px bg-[#9d2235]/15" />
          <span className="text-sm text-gray-500">Admin Control Center</span>
          <nav className="ml-4 hidden items-center gap-2 md:flex">
            <NavLink
              to="/admin"
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-[#9d2235]/10 font-medium text-accent' : 'text-gray-600 hover:bg-[#9d2235]/8 hover:text-[#4a2330]'}`}
              end
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/admin/current-complaints"
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-[#9d2235]/10 font-medium text-accent' : 'text-gray-600 hover:bg-[#9d2235]/8 hover:text-[#4a2330]'}`}
            >
              Current Complaints
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell endpoint="/admin/notifications" panelTitle="Admin Notifications" />
          <div className="hidden items-center gap-2 rounded-lg border border-[#9d2235]/15 bg-white px-2 py-1 text-xs text-gray-600 md:flex">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#9d2235]/10 font-semibold text-accent">
              {(session.user.name || 'A').charAt(0).toUpperCase()}
            </span>
            {session.user.name}
          </div>
          <button className="flex items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 hover:border-[#9d2235]/40" onClick={onLogout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 p-6"
      >
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-4 grid gap-3 sm:grid-cols-3"
      >
        <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Assets</p>
          <p className="font-mono text-2xl">{dashboard.totals.assets || 0}</p>
        </div>
        <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Faulty Assets</p>
          <p className="font-mono text-2xl text-accent">{dashboard.totals.faulty || 0}</p>
        </div>
        <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
          <p className="text-xs uppercase tracking-wide text-gray-500">Open Complaints</p>
          <p className="font-mono text-2xl">{cards.filter((c) => c.status !== 'resolved').length}</p>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut', delay: 0.06 }}
        className="mb-4"
      >
        <DashboardCharts data={dashboard} />
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: 'easeOut', delay: 0.12 }}
        className="mb-4 rounded-3xl border border-[#9d2235]/10 bg-white/90 p-4 shadow-glass backdrop-blur-md"
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Export and Import</div>
        <div className="mb-3 grid gap-2 md:grid-cols-6">
          <input
            placeholder="Lab"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            value={filters.lab}
            onChange={(e) => setFilters((p) => ({ ...p, lab: e.target.value }))}
          />
          <input
            placeholder="Section"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            value={filters.section}
            onChange={(e) => setFilters((p) => ({ ...p, section: e.target.value }))}
          />
          <select
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
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
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
          />
          <input
            type="date"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm hover:border-[#9d2235]/40">
            <Upload size={16} />
            {importing ? 'Importing...' : 'Import CSV/Excel'}
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} />
          </label>
          <button onClick={() => exportFile('csv')} className="inline-flex items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm hover:border-[#9d2235]/40">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => exportFile('excel')} className="inline-flex items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm hover:border-[#9d2235]/40">
            <Download size={16} /> Export Excel
          </button>
          <button onClick={() => exportFile('pdf')} className="inline-flex items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm hover:border-[#9d2235]/40">
            <Download size={16} /> Export PDF
          </button>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: 'easeOut', delay: 0.18 }}
      >
        <KanbanBoard items={cards} onRefresh={load} />
      </motion.section>
      </motion.div>
    </div>
  );
}
