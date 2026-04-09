import { useEffect, useMemo, useState } from 'react';
import { Download, KanbanSquare, LayoutDashboard, LogOut, Search, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import DashboardCharts from '../components/DashboardCharts';
import KanbanBoard from '../components/KanbanBoard';
import NotificationBell from '../components/NotificationBell';
import { getSocket } from '../lib/socket';

export default function AdminPage({ session, onLogout }) {
  const [dashboard, setDashboard] = useState({ totals: {}, complaintsPerLab: [], byStatus: [] });
  const [cards, setCards] = useState([]);
  const [importing, setImporting] = useState(false);
  const [adminView, setAdminView] = useState('operations');
  const [exportFilters, setExportFilters] = useState({
    lab: '',
    status: '',
    priority: '',
    section: '',
    from: '',
    to: ''
  });
  const [kanbanFilters, setKanbanFilters] = useState({
    query: '',
    status: '',
    priority: '',
    lab: '',
    section: ''
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
        params: { ...exportFilters, format },
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

  const kanbanLabs = useMemo(
    () => Array.from(new Set(cards.map((item) => item.assets?.lab).filter(Boolean))),
    [cards]
  );

  const kanbanSections = useMemo(
    () => Array.from(new Set(cards.map((item) => item.assets?.section).filter(Boolean))),
    [cards]
  );

  const filteredKanbanCards = useMemo(() => {
    let next = [...cards];

    if (kanbanFilters.query) {
      const q = kanbanFilters.query.toLowerCase();
      next = next.filter((item) => {
        const systemId = (item.assets?.system_id || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const student = (item.users?.name || '').toLowerCase();
        return systemId.includes(q) || description.includes(q) || student.includes(q);
      });
    }

    if (kanbanFilters.status) {
      next = next.filter((item) => item.status === kanbanFilters.status);
    }

    if (kanbanFilters.priority) {
      next = next.filter((item) => item.priority === kanbanFilters.priority);
    }

    if (kanbanFilters.lab) {
      next = next.filter((item) => item.assets?.lab === kanbanFilters.lab);
    }

    if (kanbanFilters.section) {
      next = next.filter((item) => item.assets?.section === kanbanFilters.section);
    }

    return next;
  }, [cards, kanbanFilters]);

  const kanbanStatusCounts = useMemo(() => {
    const base = { pending: 0, in_progress: 0, resolved: 0 };
    filteredKanbanCards.forEach((item) => {
      if (base[item.status] !== undefined) base[item.status] += 1;
    });
    return base;
  }, [filteredKanbanCards]);

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
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative z-10 border-b border-[#9d2235]/10 bg-[#fffaf4]/85 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl border border-[#9d2235]/20 bg-white/90 p-1 shadow-sm">
            <button
              onClick={() => setAdminView('operations')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${adminView === 'operations' ? 'bg-[#9d2235] text-white' : 'text-[#5f5663] hover:bg-[#f7efef]'}`}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button
              onClick={() => setAdminView('kanban')}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${adminView === 'kanban' ? 'bg-[#9d2235] text-white' : 'text-[#5f5663] hover:bg-[#f7efef]'}`}
            >
              <KanbanSquare size={16} /> Complaints
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[#9d2235]/20 bg-white px-3 py-1.5 text-[#4f4654]">
              Assets: <span className="font-semibold text-[#1d1521]">{dashboard.totals.assets || 0}</span>
            </span>
            <span className="rounded-full border border-[#9d2235]/20 bg-white px-3 py-1.5 text-[#4f4654]">
              Faulty: <span className="font-semibold text-[#1d1521]">{dashboard.totals.faulty || 0}</span>
            </span>
            <span className="rounded-full border border-[#9d2235]/20 bg-white px-3 py-1.5 text-[#4f4654]">
              Open Complaints: <span className="font-semibold text-[#1d1521]">{cards.filter((c) => c.status !== 'resolved').length}</span>
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 p-6"
      >
        {adminView === 'operations' ? (
          <>
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
                  value={exportFilters.lab}
                  onChange={(e) => setExportFilters((p) => ({ ...p, lab: e.target.value }))}
                />
                <input
                  placeholder="Section"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.section}
                  onChange={(e) => setExportFilters((p) => ({ ...p, section: e.target.value }))}
                />
                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.status}
                  onChange={(e) => setExportFilters((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.priority}
                  onChange={(e) => setExportFilters((p) => ({ ...p, priority: e.target.value }))}
                >
                  <option value="">All Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
                <input
                  type="date"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.from}
                  onChange={(e) => setExportFilters((p) => ({ ...p, from: e.target.value }))}
                />
                <input
                  type="date"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.to}
                  onChange={(e) => setExportFilters((p) => ({ ...p, to: e.target.value }))}
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
          </>
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mb-4 grid gap-3 sm:grid-cols-3"
            >
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">Pending</p>
                <p className="font-mono text-2xl text-[#9d2235]">{kanbanStatusCounts.pending}</p>
              </div>
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">In Progress</p>
                <p className="font-mono text-2xl text-[#7f3e47]">{kanbanStatusCounts.in_progress}</p>
              </div>
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">Resolved</p>
                <p className="font-mono text-2xl text-emerald-700">{kanbanStatusCounts.resolved}</p>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: 'easeOut', delay: 0.05 }}
              className="mb-4 rounded-3xl border border-[#9d2235]/10 bg-white/90 p-4 shadow-glass backdrop-blur-md"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#2a202b]">Filters</p>
                <button
                  onClick={() => setKanbanFilters({ query: '', status: '', priority: '', lab: '', section: '' })}
                  className="rounded-xl border border-[#9d2235]/20 px-3 py-1.5 text-xs text-[#5f5663] hover:border-[#9d2235]/40"
                >
                  Reset
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-5">
                <label className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    placeholder="System, issue, student"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/40"
                    value={kanbanFilters.query}
                    onChange={(e) => setKanbanFilters((p) => ({ ...p, query: e.target.value }))}
                  />
                </label>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={kanbanFilters.status}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={kanbanFilters.priority}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, priority: e.target.value }))}
                >
                  <option value="">All Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={kanbanFilters.lab}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, lab: e.target.value }))}
                >
                  <option value="">All Labs</option>
                  {kanbanLabs.map((lab) => (
                    <option key={lab} value={lab}>{lab}</option>
                  ))}
                </select>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={kanbanFilters.section}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, section: e.target.value }))}
                >
                  <option value="">All Sections</option>
                  {kanbanSections.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>

              <p className="mt-2 text-xs text-gray-500">Showing {filteredKanbanCards.length} of {cards.length} complaints in board</p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: 'easeOut', delay: 0.1 }}
            >
              <KanbanBoard items={filteredKanbanCards} onRefresh={load} />
            </motion.section>
          </>
        )}
      </motion.div>
    </div>
  );
}
