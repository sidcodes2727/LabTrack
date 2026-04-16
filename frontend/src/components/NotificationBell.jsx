import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { getStoredSession } from '../lib/auth';

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString();
};

export default function NotificationBell({ endpoint = '/admin/notifications', panelTitle = 'Notifications' }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [livePopup, setLivePopup] = useState(null);

  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const openRef = useRef(open);
  const popupTimerRef = useRef(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const rememberIds = (nextItems) => {
    nextItems.forEach((item) => {
      if (item?.id) seenIdsRef.current.add(item.id);
    });

    if (seenIdsRef.current.size > 300) {
      const ids = [...seenIdsRef.current];
      seenIdsRef.current = new Set(ids.slice(-200));
    }
  };

  const triggerPopup = (notification) => {
    if (!notification || openRef.current) return;

    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
    }

    setLivePopup(notification);
    popupTimerRef.current = setTimeout(() => {
      setLivePopup(null);
    }, 3600);
  };

  useEffect(() => {
    let mounted = true;

    const load = async ({ allowPopup = false } = {}) => {
      try {
        const { data } = await api.get(endpoint);
        if (!mounted) return;

        const nextItems = Array.isArray(data) ? data : [];
        const unseen = nextItems.filter((item) => item?.id && !seenIdsRef.current.has(item.id));

        if (initializedRef.current && allowPopup && unseen.length) {
          triggerPopup(unseen[0]);
        }

        rememberIds(nextItems);
        initializedRef.current = true;
        setItems(nextItems);
      } catch {
        if (mounted) setItems([]);
      }
    };

    load();

    const token = getStoredSession()?.token;
    const socket = getSocket(token);
    if (!socket) return undefined;

    const handleUpdate = () => {
      load({ allowPopup: true });
    };

    socket.on('labtrack:update', handleUpdate);

    return () => {
      mounted = false;
      socket.off('labtrack:update', handleUpdate);
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current);
        popupTimerRef.current = null;
      }
    };
  }, [endpoint]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((p) => !p)} className="relative rounded-xl border border-[#9d2235]/20 bg-white p-2 hover:border-[#9d2235]/35 hover:bg-[#fff8f8]">
        <Bell size={18} className="text-accent" />
        {!!items.length && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-[#9d2235]/12 bg-white p-3 shadow-glass"
          >
            <h4 className="mb-2 text-sm font-semibold">{panelTitle}</h4>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#9d2235]/10 bg-[#faf7f5] p-2.5 text-xs">
                  <div className="font-semibold text-[#181019]">{item.title}</div>
                  <div className="text-gray-600">{item.message}</div>
                  <div className="mt-1 text-[10px] text-gray-500">{formatTime(item.created_at)}</div>
                </div>
              ))}
              {!items.length && <p className="text-xs text-gray-500">No notifications yet.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && livePopup && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-[#9d2235]/15 bg-white/95 p-3 shadow-glass"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b4a5b]">New notification</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#1d1320]">{livePopup.title || 'Update'}</p>
            <p className="line-clamp-2 text-xs text-[#5b5262]">{livePopup.message}</p>
            <p className="mt-1 text-[10px] text-gray-500">{formatTime(livePopup.created_at)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
