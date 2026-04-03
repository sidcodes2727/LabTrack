import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/admin/notifications');
        setItems(data || []);
      } catch {
        setItems([]);
      }
    };
    load();
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setOpen((p) => !p)} className="rounded-xl border border-gray-200 p-2 hover:bg-gray-50">
        <Bell size={18} className="text-accent" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-gray-100 bg-white p-3 shadow-glass"
          >
            <h4 className="mb-2 text-sm font-semibold">Notifications</h4>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl bg-gray-50 p-2 text-xs">
                  <div className="font-semibold text-ink">{item.title}</div>
                  <div className="text-gray-600">{item.message}</div>
                </div>
              ))}
              {!items.length && <p className="text-xs text-gray-500">No notifications yet.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
