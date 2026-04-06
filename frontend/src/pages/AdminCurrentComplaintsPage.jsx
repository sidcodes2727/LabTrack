import { useEffect, useMemo, useState } from 'react';
import { List, LogOut, RefreshCw, Search, Workflow } from 'lucide-react';
import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import NotificationBell from '../components/NotificationBell';
import { getSocket } from '../lib/socket';
import KanbanBoard from '../components/KanbanBoard';

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-CA');
};

const statusTone = {
  pending: 'bg-[#f7ddd7] text-[#a6483b]',
  in_progress: 'bg-[#f7ddd7] text-[#a6483b]'
};

export default function AdminCurrentComplaintsPage({ session, onLogout }) {
  const [complaints, setComplaints] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [filters, setFilters] = useState({
    lab: '',
    status: '',
    query: '',
    sort: 'newest'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: allComplaints }, { data: kanbanCards }] = await Promise.all([
        api.get('/complaints'),
        api.get('/admin/kanban')
      ]);
      setComplaints((allComplaints || []).filter((item) => item.status !== 'resolved'));
      setCards(kanbanCards || []);
    } catch {
      toast.error('Failed to load current complaints');
      setComplaints([]);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const socket = getSocket(session?.token);
    if (!socket) return undefined;

    const handleUpdate = () => {
      loadData();
    };

    socket.on('labtrack:update', handleUpdate);

    return () => {
      socket.off('labtrack:update', handleUpdate);
    };
  }, [session?.token]);

  const filteredComplaints = useMemo(() => {
    const visible = complaints.filter((item) => {
      const lab = (item.assets?.lab || '').toLowerCase();
      const systemId = (item.assets?.system_id || '').toLowerCase();
      const issue = (item.description || '').toLowerCase();
      const reporter = (item.users?.name || '').toLowerCase();
      const query = filters.query.trim().toLowerCase();

      const matchLab = !filters.lab || lab.includes(filters.lab.trim().toLowerCase());
      const matchStatus = !filters.status || item.status === filters.status;
      const matchQuery = !query || systemId.includes(query) || issue.includes(query) || reporter.includes(query);

      return matchLab && matchStatus && matchQuery;
    });

    const sorted = [...visible].sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return filters.sort === 'oldest' ? aTime - bTime : bTime - aTime;
    });

    return sorted;
  }, [complaints, filters.lab, filters.status, filters.query, filters.sort]);

  const pendingCount = useMemo(() => complaints.filter((item) => item.status === 'pending').length, [complaints]);
  const inProgressCount = useMemo(() => complaints.filter((item) => item.status === 'in_progress').length, [complaints]);

  const resetFilters = () => {
    setFilters({ lab: '', status: '', query: '', sort: 'newest' });
  };

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

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 mx-auto max-w-6xl p-6"
      >
        <div className="rounded-3xl border border-[#9d2235]/10 bg-white/90 p-4 shadow-glass backdrop-blur-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#1f1417]">Current Complaints</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${viewMode === 'list' ? 'border-[#9d2235]/35 bg-[#fff6f7] text-[#6e1f30]' : 'border-[#9d2235]/20 bg-white text-gray-600'}`}
              >
                <List size={14} /> List
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${viewMode === 'board' ? 'border-[#9d2235]/35 bg-[#fff6f7] text-[#6e1f30]' : 'border-[#9d2235]/20 bg-white text-gray-600'}`}
              >
                <Workflow size={14} /> Resolution Board
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#9d2235]/10 bg-[#faf7f5] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Open Total</p>
              <p className="font-mono text-xl text-[#1e1720]">{complaints.length}</p>
            </div>
            <div className="rounded-2xl border border-[#9d2235]/10 bg-[#faf7f5] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pending</p>
              <p className="font-mono text-xl text-[#7b2c30]">{pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-[#9d2235]/10 bg-[#faf7f5] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">In Progress</p>
              <p className="font-mono text-xl text-[#7b2c30]">{inProgressCount}</p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <input
              type="text"
              placeholder="Filter by Lab"
              value={filters.lab}
              onChange={(e) => setFilters((prev) => ({ ...prev, lab: e.target.value }))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option value="">All Open Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
            </select>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent/40"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by system, issue, or student"
                value={filters.query}
                onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/40"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm text-gray-600 hover:border-[#9d2235]/40"
              >
                <RefreshCw size={14} /> Reset
              </button>
              <button
                onClick={loadData}
                className="rounded-xl border border-[#9d2235]/20 bg-white px-3 py-2 text-sm text-gray-600 hover:border-[#9d2235]/40"
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading current complaints...</p>
          ) : viewMode === 'board' ? (
            <KanbanBoard items={cards} onRefresh={loadData} />
          ) : filteredComplaints.length ? (
            <div className="space-y-3">
              {filteredComplaints.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#ded8d6] border-l-[3px] border-l-[#ad2240] bg-[#f1edeb] px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[16px] font-semibold leading-none tracking-tight text-[#17131a]">
                      {item.assets?.system_id || 'Unknown System'}
                    </p>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-tight ${statusTone[item.status] || 'bg-[#ebebeb] text-[#555]'}`}>
                      {item.status}
                    </span>
                  </div>

                  <p className="text-[14px] leading-snug text-[#575061]">{item.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#958e9c]">
                    <span>Date: {formatDate(item.created_at)}</span>
                    <span>Lab: {item.assets?.lab || '-'}</span>
                    <span>Section: {item.assets?.section || '-'}</span>
                    <span>Student: {item.users?.name || '-'}</span>
                    <span>Priority: <span className="font-semibold text-[#8f2f45]">{item.priority || 'Medium'}</span></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No open complaints found for the selected filters.</p>
          )}
        </div>
      </motion.main>
    </div>
  );
}
