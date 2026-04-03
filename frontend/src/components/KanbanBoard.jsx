import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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

export default function KanbanBoard({ items, onRefresh }) {
  const [boardItems, setBoardItems] = useState(items || []);
  const [activeId, setActiveId] = useState(null);

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
    } catch {
      toast.error('Unable to move card');
      onRefresh();
    }
  };

  const onDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const onDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const sourceStatus = findColumnByCardId(active.id);
    const overId = over.id;
    const targetStatus = columnKeys.has(overId) ? overId : findColumnByCardId(overId);

    if (!sourceStatus || !targetStatus || sourceStatus === targetStatus) return;
    moveCardLocal(active.id, targetStatus);
  };

  const onDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const droppedStatus = findColumnByCardId(active.id);
    const originalStatus = (items || []).find((item) => item.id === active.id)?.status;

    if (droppedStatus && originalStatus && droppedStatus !== originalStatus) {
      move(active.id, droppedStatus);
    }
  };

  const activeCard = boardItems.find((card) => card.id === activeId) || null;

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
          <KanbanColumn key={col.key} id={col.key} title={col.title} cards={grouped[col.key]} />
        ))}
      </div>

      <DragOverlay>
        {activeCard ? <KanbanCard card={activeCard} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ id, title, cards }) {
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
          <KanbanCard key={card.id} card={card} />
        ))}
      </div>
    </motion.div>
  );
}

function KanbanCard({ card, dragging = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <motion.div
      ref={setNodeRef}
      layout
      style={style}
      whileHover={{ y: -3 }}
      className={`rounded-2xl border border-gray-100 bg-white p-3 shadow-sm ${
        isDragging || dragging ? 'cursor-grabbing opacity-90 shadow-lg' : 'cursor-grab'
      }`}
      {...listeners}
      {...attributes}
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
  );
}
