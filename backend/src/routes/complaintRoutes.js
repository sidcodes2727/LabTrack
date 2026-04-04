import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { classifyComplaint } from '../services/aiService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported image format'));
    }
    return cb(null, true);
  }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*, assets(system_id, lab, section), users(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (req.user.role === 'student') {
      const own = data.filter((item) => item.user_id === req.user.id);
      return res.json(own);
    }

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/', authenticate, upload.single('image'), async (req, res, next) => {
  try {
    const { assetId, description, priority } = req.body;
    if (!assetId || !description) {
      return res.status(400).json({ message: 'Asset and description are required' });
    }

    let imageUrl = null;

    if (req.file) {
      const path = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET || 'complaint-images')
        .upload(path, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET || 'complaint-images')
        .getPublicUrl(path);

      imageUrl = publicData.publicUrl;
    }

    const ai = await classifyComplaint(description);

    const finalPriority = priority || ai.priority;

    const { data: complaint, error: complaintError } = await supabase
      .from('complaints')
      .insert({
        asset_id: assetId,
        user_id: req.user.id,
        description,
        priority: finalPriority,
        ai_priority: ai.priority,
        image_url: imageUrl,
        status: 'pending'
      })
      .select('*')
      .single();

    if (complaintError) throw complaintError;

    const { error: assetStatusError } = await supabase
      .from('assets')
      .update({ status: 'faulty' })
      .eq('id', assetId);

    if (assetStatusError) throw assetStatusError;

    await supabase.from('history').insert({
      asset_id: assetId,
      event_type: 'Complaint Logged',
      details: `Complaint ${complaint.id} created with priority ${finalPriority}`
    });

    await supabase.from('notifications').insert({
      title: 'New complaint created',
      message: `Complaint ${complaint.id} created with priority ${finalPriority}`,
      role_target: 'admin'
    });

    return res.status(201).json(complaint);
  } catch (error) {
    return next(error);
  }
});

export default router;
