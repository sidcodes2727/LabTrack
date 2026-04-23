import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Download, KanbanSquare, LayoutDashboard, LogOut, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import DashboardCharts from '../components/DashboardCharts';
import KanbanBoard from '../components/KanbanBoard';
import NotificationBell from '../components/NotificationBell';
import BrandLogo from '../components/BrandLogo';
import { getSocket } from '../lib/socket';

const priorityWeight = { High: 3, Medium: 2, Low: 1 };
const prioritySlaHours = { High: 24, Medium: 48, Low: 72 };

const formatAgeLabel = (hours) => {
  if (!Number.isFinite(hours) || hours <= 0) return '<1h';

  if (hours < 24) return `${Math.round(hours)}h`;

  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
};

export default function AdminPage({ session, onLogout }) {
  const exportLabOptions = ['LAB 2', 'LAB 3A', 'LAB 3B'];
  const [dashboard, setDashboard] = useState({ totals: {}, complaintsPerLab: [], byStatus: [] });
  const [cards, setCards] = useState([]);
  const [adminView, setAdminView] = useState('operations');
  const [exportFilters, setExportFilters] = useState({
    dataType: 'complaints',
    format: 'csv',
    lab: '',
    status: '',
    assetStatus: '',
    priority: '',
    from: '',
    to: ''
  });
  const [kanbanFilters, setKanbanFilters] = useState({
    query: '',
    status: '',
    priority: '',
    affectedStudentsMin: '',
    lab: '',
    section: '',
    from: '',
    to: '',
    sort: 'newest'
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

  const buildExportParams = () => {
    const baseParams = {
      dataType: exportFilters.dataType,
      format: exportFilters.format,
      lab: exportFilters.lab || undefined,
      from: exportFilters.from || undefined,
      to: exportFilters.to || undefined
    };

    if (exportFilters.dataType === 'complaints') {
      return {
        ...baseParams,
        status: exportFilters.status || undefined,
        priority: exportFilters.priority || undefined
      };
    }

    if (exportFilters.dataType === 'inventory') {
      return {
        ...baseParams,
        assetStatus: exportFilters.assetStatus || undefined
      };
    }

    return {
      ...baseParams,
      status: exportFilters.status || undefined,
      priority: exportFilters.priority || undefined,
      assetStatus: exportFilters.assetStatus || undefined
    };
  };

  const exportFile = async () => {
    // Allow export for all labs or specific lab
    // Only block if inventory is selected but no lab is chosen (for performance)
    if (exportFilters.dataType === 'inventory' && !exportFilters.lab) {
      toast.error('Please select a lab for inventory export or choose "Complaints" or "Both".');
      return;
    }

    try {
      const { data } = await api.get('/admin/export', {
        params: buildExportParams(),
        responseType: 'blob'
      });

      const ext = exportFilters.format === 'excel' ? 'xlsx' : exportFilters.format;
      const labSuffix = exportFilters.lab ? `-${exportFilters.lab.replace(/\s+/g, '-')}` : '-all-labs';
      const filename = `${exportFilters.dataType}${labSuffix}-report.${ext}`;
      
      const blobUrl = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      toast.success(`${exportFilters.format.toUpperCase()} export ready`);
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

    if (kanbanFilters.affectedStudentsMin) {
      const minAffected = Number(kanbanFilters.affectedStudentsMin);
      next = next.filter((item) => {
        const supportCount = Number.isFinite(item.support_count)
          ? item.support_count
          : Array.isArray(item.supporter_ids)
            ? item.supporter_ids.length
            : 0;
        const affectedStudents = supportCount + 1;
        return affectedStudents >= minAffected;
      });
    }

    if (kanbanFilters.lab) {
      next = next.filter((item) => item.assets?.lab === kanbanFilters.lab);
    }

    if (kanbanFilters.section) {
      next = next.filter((item) => item.assets?.section === kanbanFilters.section);
    }

    if (kanbanFilters.from) {
      const fromDate = new Date(kanbanFilters.from);
      next = next.filter((item) => {
        if (!item.created_at) return false;
        return new Date(item.created_at) >= fromDate;
      });
    }

    if (kanbanFilters.to) {
      const toDate = new Date(kanbanFilters.to);
      toDate.setHours(23, 59, 59, 999);
      next = next.filter((item) => {
        if (!item.created_at) return false;
        return new Date(item.created_at) <= toDate;
      });
    }

    if (kanbanFilters.sort === 'oldest') {
      next.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (kanbanFilters.sort === 'priority_high') {
      next.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));
    } else if (kanbanFilters.sort === 'priority_low') {
      next.sort((a, b) => (priorityWeight[a.priority] || 0) - (priorityWeight[b.priority] || 0));
    } else {
      next.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
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

  const complaintStats = useMemo(() => {
    const open = cards.filter((item) => item.status !== 'resolved').length;
    const resolved = cards.filter((item) => item.status === 'resolved').length;
    const high = cards.filter((item) => item.priority === 'High').length;

    return {
      total: cards.length,
      open,
      resolved,
      high
    };
  }, [cards]);

  const urgentComplaints = useMemo(() => {
    const now = Date.now();

    return cards
      .filter((item) => item.status === 'pending' || item.status === 'in_progress')
      .map((item) => {
        const referenceDate = item.status === 'in_progress' ? item.updated_at || item.created_at : item.created_at;
        const parsedDate = new Date(referenceDate || item.created_at).getTime();
        const ageHours = Number.isNaN(parsedDate) ? 0 : (now - parsedDate) / (1000 * 60 * 60);
        const slaHours = prioritySlaHours[item.priority] || 48;
        const overdueHours = ageHours - slaHours;

        return {
          ...item,
          ageHours,
          slaHours,
          overdueHours,
          isBreached: overdueHours >= 0,
          isNearBreach: overdueHours < 0 && Math.abs(overdueHours) <= 8
        };
      })
      .filter((item) => item.isBreached || item.isNearBreach)
      .sort((a, b) => {
        if (a.isBreached !== b.isBreached) {
          return a.isBreached ? -1 : 1;
        }

        if ((priorityWeight[b.priority] || 0) !== (priorityWeight[a.priority] || 0)) {
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        }

        return b.ageHours - a.ageHours;
      });
  }, [cards]);

  const focusUrgentComplaint = (item) => {
    setKanbanFilters((prev) => ({
      ...prev,
      query: item.assets?.system_id || '',
      status: item.status,
      priority: '',
      affectedStudentsMin: '',
      lab: '',
      section: '',
      from: '',
      to: '',
      sort: 'oldest'
    }));
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
          <BrandLogo compact className="shrink-0" />
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
              className="relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            >
              {adminView === 'operations' && (
                <motion.span
                  layoutId="admin-view-slider"
                  className="absolute inset-0 rounded-xl bg-[#9d2235]"
                  transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.7 }}
                />
              )}
              <span className={`relative z-10 inline-flex items-center gap-2 ${adminView === 'operations' ? 'text-white' : 'text-[#5f5663]'}`}>
                <LayoutDashboard size={16} /> Dashboard
              </span>
            </button>
            <button
              onClick={() => setAdminView('kanban')}
              className="relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            >
              {adminView === 'kanban' && (
                <motion.span
                  layoutId="admin-view-slider"
                  className="absolute inset-0 rounded-xl bg-[#9d2235]"
                  transition={{ type: 'spring', stiffness: 450, damping: 34, mass: 0.7 }}
                />
              )}
              <span className={`relative z-10 inline-flex items-center gap-2 ${adminView === 'kanban' ? 'text-white' : 'text-[#5f5663]'}`}>
                <KanbanSquare size={16} /> Complaints
              </span>
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Export Reports</div>
                <button
                  type="button"
                  onClick={() =>
                    setExportFilters({
                      dataType: 'complaints',
                      format: 'csv',
                      lab: '',
                      status: '',
                      assetStatus: '',
                      priority: '',
                      from: '',
                      to: ''
                    })
                  }
                  className="rounded-xl border border-[#9d2235]/20 px-3 py-1.5 text-xs text-[#5f5663] hover:border-[#9d2235]/40"
                >
                  Reset Filters
                </button>
              </div>

              <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.dataType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setExportFilters((p) => ({
                      ...p,
                      dataType: nextType,
                      status: nextType === 'inventory' ? '' : p.status,
                      priority: nextType === 'inventory' ? '' : p.priority,
                      assetStatus: nextType === 'complaints' ? '' : p.assetStatus
                    }));
                  }}
                >
                  <option value="complaints">Data Type: Complaints</option>
                  <option value="inventory">Data Type: Inventory</option>
                  <option value="both">Data Type: Both</option>
                </select>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.format}
                  onChange={(e) => setExportFilters((p) => ({ ...p, format: e.target.value }))}
                >
                  <option value="csv">Format: CSV</option>
                  <option value="excel">Format: Excel</option>
                  <option value="pdf">Format: PDF</option>
                </select>

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={exportFilters.lab}
                  onChange={(e) => setExportFilters((p) => ({ ...p, lab: e.target.value }))}
                >
                  <option value="">All Labs</option>
                  {exportLabOptions.map((lab) => (
                    <option key={lab} value={lab}>{lab}</option>
                  ))}
                </select>

                {(exportFilters.dataType === 'complaints' || exportFilters.dataType === 'both') && (
                  <select
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                    value={exportFilters.status}
                    onChange={(e) => setExportFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="">Complaint Status: All</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                )}

                {(exportFilters.dataType === 'complaints' || exportFilters.dataType === 'both') && (
                  <select
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                    value={exportFilters.priority}
                    onChange={(e) => setExportFilters((p) => ({ ...p, priority: e.target.value }))}
                  >
                    <option value="">Priority: All</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                )}

                {(exportFilters.dataType === 'inventory' || exportFilters.dataType === 'both') && (
                  <select
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                    value={exportFilters.assetStatus}
                    onChange={(e) => setExportFilters((p) => ({ ...p, assetStatus: e.target.value }))}
                  >
                    <option value="">Asset Status: All</option>
                    <option value="working">Working</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="faulty">Faulty</option>
                  </select>
                )}

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

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button onClick={exportFile} className="inline-flex items-center gap-2 rounded-xl border border-[#9d2235]/20 bg-white px-4 py-2 text-sm font-semibold hover:border-[#9d2235]/40">
                  <Download size={16} /> Export {exportFilters.dataType} as {exportFilters.format.toUpperCase()}
                </button>
                <span className="text-xs text-gray-500">
                  Complaints: supports all labs or specific lab, with status, priority, and date filters. Inventory: requires specific lab selection. Both: combined filters with lab requirement for inventory data.
                </span>
              </div>
            </motion.section>
          </>
        ) : (
          <>
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">Total Complaints</p>
                <p className="font-mono text-2xl text-[#1e161f]">{complaintStats.total}</p>
              </div>
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">Open</p>
                <p className="font-mono text-2xl text-[#9d2235]">{complaintStats.open}</p>
              </div>
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">Resolved</p>
                <p className="font-mono text-2xl text-emerald-700">{complaintStats.resolved}</p>
              </div>
              <div className="rounded-3xl border border-[#9d2235]/10 bg-white p-4 shadow-glass">
                <p className="text-xs uppercase tracking-wide text-gray-500">High Priority</p>
                <p className="font-mono text-2xl text-amber-700">{complaintStats.high}</p>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: 'easeOut', delay: 0.05 }}
              className="mb-4 rounded-3xl border border-[#9d2235]/15 bg-gradient-to-r from-[#fff7f3] via-[#fff3f3] to-[#fffaf4] p-4 shadow-glass"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#9d2235]/10 text-accent">
                    <AlertTriangle size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#2a202b]">Urgent Complaints First</p>
                    <p className="text-xs text-[#645869]">SLA alerts for pending and in-progress tickets</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#9d2235]/25 bg-white px-3 py-1 text-xs font-semibold text-[#4b3e51]">
                  {urgentComplaints.length} needs attention
                </span>
              </div>

              {urgentComplaints.length ? (
                <div className="space-y-2">
                  {urgentComplaints.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className={`flex flex-col gap-2 rounded-2xl border p-3 md:flex-row md:items-center md:justify-between ${
                        item.isBreached ? 'border-[#9d2235]/35 bg-[#fff1ef]' : 'border-amber-300/70 bg-[#fff8eb]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-[#221824]">{item.assets?.system_id || 'Unknown System'}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#5f5663]">
                            {item.assets?.lab || 'Unknown'} / {item.assets?.section || 'N/A'}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              item.priority === 'High'
                                ? 'bg-red-100 text-red-700'
                                : item.priority === 'Medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {item.priority}
                          </span>
                          <span className="rounded-full bg-[#ede8ea] px-2 py-0.5 text-[11px] text-[#5b525f]">
                            {item.status === 'in_progress' ? 'In Progress' : 'Pending'}
                          </span>
                        </div>
                        <p className="line-clamp-1 text-sm text-[#463a47]">{item.description}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-[#4f4654]">
                          <Clock3 size={12} /> Age {formatAgeLabel(item.ageHours)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.isBreached ? 'bg-[#9d2235] text-white' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.isBreached
                            ? `Overdue by ${formatAgeLabel(item.overdueHours)}`
                            : `Due in ${formatAgeLabel(Math.abs(item.overdueHours))}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => focusUrgentComplaint(item)}
                          className="rounded-xl border border-[#9d2235]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#4e4456] hover:border-[#9d2235]/45"
                        >
                          Focus in Board
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  No pending or in-progress complaints are near or beyond SLA right now.
                </div>
              )}
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
                  onClick={() => setKanbanFilters({ query: '', status: '', priority: '', affectedStudentsMin: '', lab: '', section: '', from: '', to: '', sort: 'newest' })}
                  className="rounded-xl border border-[#9d2235]/20 px-3 py-1.5 text-xs text-[#5f5663] hover:border-[#9d2235]/40"
                >
                  Reset
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
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
                  value={kanbanFilters.affectedStudentsMin}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, affectedStudentsMin: e.target.value }))}
                >
                  <option value="">All Affected Students</option>
                  <option value="2">2+ affected students</option>
                  <option value="3">3+ affected students</option>
                  <option value="5">5+ affected students</option>
                  <option value="10">10+ affected students</option>
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

                <input
                  type="date"
                  value={kanbanFilters.from}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, from: e.target.value }))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                />

                <input
                  type="date"
                  value={kanbanFilters.to}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, to: e.target.value }))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                />

                <select
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
                  value={kanbanFilters.sort}
                  onChange={(e) => setKanbanFilters((p) => ({ ...p, sort: e.target.value }))}
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="priority_high">Sort: Priority High-Low</option>
                  <option value="priority_low">Sort: Priority Low-High</option>
                </select>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Showing {filteredKanbanCards.length} of {cards.length} complaints.
                Pending: {kanbanStatusCounts.pending}, In Progress: {kanbanStatusCounts.in_progress}, Resolved: {kanbanStatusCounts.resolved}
              </p>
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
