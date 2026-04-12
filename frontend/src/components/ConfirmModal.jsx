import { AnimatePresence, motion } from 'framer-motion';

export default function ConfirmModal({ open, onClose, onConfirm, title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel' }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-xs rounded-2xl border border-[#9d2235]/15 bg-white p-6 text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-[#9d2235]">{title}</h3>
            {message && <p className="mb-4 text-sm text-[#6d3242]">{message}</p>}
            <div className="mt-4 flex justify-center gap-3">
              <button
                className="rounded-lg border border-[#9d2235]/20 bg-[#fff7f6] px-4 py-1.5 text-sm font-medium text-[#9d2235] hover:bg-[#fbeaec]"
                onClick={onClose}
                type="button"
              >
                {cancelText}
              </button>
              <button
                className="rounded-lg bg-[#9d2235] px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-[#7a1a2a]"
                onClick={() => { onConfirm(); onClose(); }}
                type="button"
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
