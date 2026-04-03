import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const columns = [
  { key: 'pending', title: 'Pending' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'resolved', title: 'Resolved' }
];

const priorityColor = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700'
};

export default function KanbanBoard({ items, onRefresh }) {
  const [dragId, setDragId] = useState(null);

  const grouped = useMemo(() => {
    const map = { pending: [], in_progress: [], resolved: [] };
    items.forEach((item) => map[item.status]?.push(item));
    return map;
  }, [items]);

  const move = async (id, status) => {
    try {
      await api.patch(`/admin/kanban/${id}`, { status });
      toast.success('Card moved');
      onRefresh();
    } catch {
      toast.error('Unable to move card');
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dragId && move(dragId, col.key)}
          className="rounded-3xl border border-white/60 bg-white/70 p-3 backdrop-blur-md"
        >
          <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">{col.title}</h4>
          <div className="space-y-3">
            {grouped[col.key].map((card) => (
              <motion.div
                key={card.id}
                draggable
                onDragStart={() => setDragId(card.id)}
                whileHover={{ y: -3 }}
                className="cursor-grab rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-gray-500">{card.assets?.system_id}</span>
                  <span className={`rounded-full px-2 py-1 text-xs ${priorityColor[card.priority] || 'bg-gray-100 text-gray-700'}`}>
                    {card.priority}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{card.description}</p>
                <p className="mt-2 text-xs text-gray-500">{card.assets?.lab} / {card.assets?.section}</p>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
