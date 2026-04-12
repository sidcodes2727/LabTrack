import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

export default function ComplaintModal({ open, onClose, asset, onDone }) {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = (e) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('assetId', asset.id);
      formData.append('description', description);
      if (priority) formData.append('priority', priority);
      if (file) formData.append('image', file);

      await api.post('/complaints', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Issue submitted successfully');
      onDone();
      onClose();
      setDescription('');
      setPriority('');
      setFile(null);
      setPreview('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.form
            onSubmit={submit}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full max-w-lg space-y-3 rounded-3xl bg-white p-6"
          >
            <h3 className="text-xl font-semibold">Report Issue for {asset.system_id}</h3>
            <p className="rounded-xl border border-[#9d2235]/10 bg-[#fff7f6] px-3 py-2 text-xs text-[#6d3242]">
              Check Timeline first. If this issue is already active, use +1 support there instead of submitting a duplicate complaint.
            </p>
            <textarea
              className="min-h-28 w-full rounded-2xl border border-gray-200 p-3"
              placeholder="Describe the issue"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <select className="w-full rounded-2xl border border-gray-200 p-3" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Let AI suggest priority</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="w-full rounded-2xl border border-dashed border-gray-300 p-3" />
            {preview && <img src={preview} alt="preview" className="h-36 w-full rounded-2xl object-cover" />}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-xl border px-4 py-2" onClick={onClose}>
                Cancel
              </button>
              <button disabled={loading} className="rounded-xl bg-accent px-4 py-2 text-white">
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
