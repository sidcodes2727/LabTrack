import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { DndContext, DragOverlay, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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

const formatDateTime = (rawDate) => {
  if (!rawDate) return 'N/A';
  const d = new Date(rawDate);
  return d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export default function KanbanBoard({ items, onRefresh }) {
  const [boardItems, setBoardItems] = useState(items || []);
  const [activeId, setActiveId] = useState(null);
  const [detailCard, setDetailCard] = useState(null);

  useEffect(() => {
    setBoardItems(items || []);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const grouped = useMemo(() => {
    const map = { pending: [], in_progress: [], resolved: [] };
    boardItems.forEach((item) => map[item.status]?.push(item));
    return map;
  }, [boardItems]);

  const columnKeys = useMemo(() => new Set(columns.map((col) => col.key)), []);

  const findColumnByCardId = (id) => {
    const card = boardItems.find((item) => item.id === id);
    return card?.status || null;
  };

  const moveCardLocal = (id, targetStatus) => {
    setBoardItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: targetStatus } : item)));
  };

  const move = async (id, status) => {
    try {
      await api.patch(`/admin/kanban/${id}`, { status });
      toast.success('Card moved');
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to move card');
      onRefresh();
    }
  };

  const onDragStart = (event) => {
    const card = boardItems.find((item) => item.id === event.active.id);
    if (card?.status === 'resolved') {
      setActiveId(null);
      return;
    }

    setActiveId(event.active.id);
  };

  const onDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const sourceStatus = findColumnByCardId(active.id);
    const overId = over.id;
    const targetStatus = columnKeys.has(overId) ? overId : findColumnByCardId(overId);

    if (sourceStatus === 'resolved') return;
    if (!sourceStatus || !targetStatus || sourceStatus === targetStatus) return;
    moveCardLocal(active.id, targetStatus);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const droppedStatus = findColumnByCardId(active.id);
    const originalStatus = (items || []).find((item) => item.id === active.id)?.status;

    if (originalStatus === 'resolved' && droppedStatus !== 'resolved') {
      toast.error('Resolved complaints are locked and cannot be moved back.');
      onRefresh();
      return;
    }

    if (droppedStatus && originalStatus && droppedStatus !== originalStatus) {
      move(active.id, droppedStatus);
    }
  };

  const activeCard = boardItems.find((card) => card.id === activeId) || null;

  const openDetail = (card) => {
    setDetailCard(card);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <KanbanColumn key={col.key} id={col.key} title={col.title} cards={grouped[col.key]} onOpenDetail={openDetail} />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? <KanbanCard card={activeCard} dragging /> : null}
      </DragOverlay>

      <ComplaintDetailModal card={detailCard} onClose={() => setDetailCard(null)} />
    </DndContext>
  );
}

function KanbanColumn({ id, title, cards, onOpenDetail }) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      className={`rounded-3xl border p-3 backdrop-blur-md transition ${
        isOver ? 'border-accent/40 bg-[#fff6f7]' : 'border-white/60 bg-white/70'
      }`}
    >
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">{title}</h4>
      <div className="space-y-3">
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </motion.div>
  );
}

function KanbanCard({ card, dragging = false, onOpenDetail }) {
  const isLocked = card.status === 'resolved';
  const supportCount = Number.isFinite(card.support_count)
    ? card.support_count
    : Array.isArray(card.supporter_ids)
      ? card.supporter_ids.length
      : 0;
  const affectedStudents = supportCount + 1;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: isLocked });
  const [showPreview, setShowPreview] = useState(false);
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      style={style}
      whileHover={{ y: -3 }}
      className={`rounded-2xl border border-gray-100 bg-white p-3 shadow-sm ${
        isDragging || dragging
          ? 'cursor-grabbing opacity-90 shadow-lg'
          : isLocked
            ? 'cursor-not-allowed'
            : 'cursor-grab'
      }`}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
      onClick={() => onOpenDetail?.(card)}
      {...listeners}
      {...attributes}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-gray-500">{card.assets?.system_id}</span>
        <div className="flex items-center gap-1">
          {isLocked && <span className="rounded-full bg-[#ebe7e2] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#5e5664]">Locked</span>}
          <span className={`rounded-full px-2 py-1 text-xs ${priorityColor[card.priority] || 'bg-gray-100 text-gray-700'}`}>
            {card.priority}
          </span>
        </div>
      </div>
      <p className="line-clamp-2 text-sm text-gray-700">
        {card.description}
      </p>
      <p className="mt-2 text-xs text-gray-500">{card.assets?.lab} / {card.assets?.section}</p>
      <p className="mt-1 text-xs font-medium text-[#6a3f49]">Affected Students: {affectedStudents}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
        <span>Created: {formatDateTime(card.created_at)}</span>
        {card.updated_at && card.updated_at !== card.created_at && (
          <span>Last Updated: {formatDateTime(card.updated_at)}</span>
        )}
      </div>

      {showPreview && (
        <div className="mt-3 rounded-xl border border-[#9d2235]/12 bg-[#fbf7f5] p-2 text-xs">
          <p className="font-semibold text-[#181019]">{card.users?.name || 'Unknown student'}</p>
          <p className="text-gray-600">{card.users?.email || 'No email available'}</p>
        </div>
      )}
    </motion.div>
  );
}

function ComplaintDetailModal({ card, onClose }) {
  const supportCount = Number.isFinite(card?.support_count)
    ? card.support_count
    : Array.isArray(card?.supporter_ids)
      ? card.supporter_ids.length
      : 0;
  const affectedStudents = supportCount + 1;

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 14, opacity: 0 }}
            className="w-full max-w-xl rounded-3xl border border-[#9d2235]/15 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm text-[#5d5668]">{card.assets?.system_id || 'Unknown System'}</p>
                <h4 className="text-lg font-semibold text-[#17121b]">Complaint Details</h4>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#9d2235]/20 px-2.5 py-1 text-xs text-[#4d4554] hover:bg-[#faf4f5]"
              >
                Close
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-[#9d2235]/10 bg-[#fbf7f5] p-3 text-xs">
              <p className="font-semibold text-[#181019]">{card.users?.name || 'Unknown student'}</p>
              <p className="text-gray-600">{card.users?.email || 'No email available'}</p>
              <p className="mt-1 text-gray-500">{card.assets?.lab} / {card.assets?.section}</p>
            </div>

            <div className="mb-3 grid gap-2 rounded-xl border border-[#9d2235]/10 bg-white p-3 text-xs sm:grid-cols-2">
              <div>
                <p className="uppercase tracking-wide text-[#8b8392]">Status</p>
                <p className="mt-0.5 font-semibold text-[#221a26]">{(card.status || 'pending').replace('_', ' ')}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-[#8b8392]">Priority</p>
                <p className="mt-0.5 font-semibold text-[#221a26]">{card.priority || 'Medium'}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-[#8b8392]">Affected Students</p>
                <p className="mt-0.5 font-semibold text-[#221a26]">{affectedStudents}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-[#8b8392]">Reported On</p>
                <p className="mt-0.5 font-semibold text-[#221a26]">{formatDateTime(card.created_at)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-[#8b8392]">Last Updated</p>
                <p className="mt-0.5 font-semibold text-[#221a26]">{formatDateTime(card.updated_at || card.created_at)}</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-[#2d2430]">{card.description}</p>

            {card.image_url ? (
              <img
                src={card.image_url}
                alt="Complaint attachment"
                className="mt-3 h-64 w-full rounded-xl border border-[#9d2235]/10 object-cover"
              />
            ) : (
              <p className="mt-3 text-xs text-gray-500">No image attached</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
