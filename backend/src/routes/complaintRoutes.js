import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { classifyComplaint } from '../services/aiService.js';
import { emitRoleUpdate, emitUserUpdate } from '../services/socket.js';

const router = express.Router();
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

router.get('/public-overdue', async (req, res, next) => {
  try {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const requestedLimit = Number.parseInt(req.query.limit, 10);

    const thresholdDays = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 30) : 3;
    const maxRows = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 20) : 6;
    const cutoffIso = new Date(Date.now() - thresholdDays * DAY_IN_MS).toISOString();

    const { data, error } = await supabase
      .from('complaints')
      .select('id, asset_id, description, status, created_at, assets(system_id, lab, section)')
      .in('status', ['pending', 'in_progress'])
      .lt('created_at', cutoffIso)
      .order('created_at', { ascending: true })
      .limit(maxRows);

    if (error) throw error;

    const now = Date.now();
    const payload = (data || []).map((item) => {
      const openedAt = new Date(item.created_at).getTime();
      const ageDays = Number.isFinite(openedAt) ? Math.max(0, Math.floor((now - openedAt) / DAY_IN_MS)) : 0;

      return {
        ...item,
        ageDays
      };
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
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

router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const filtered = (data || []).filter((item) => {
      const roleMatched = !item.role_target || item.role_target === req.user.role;
      const userMatched = !item.user_id || item.user_id === req.user.id;
      return roleMatched && userMatched;
    });

    return res.json(filtered.slice(0, 25));
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/plus', authenticate, async (req, res, next) => {
  try {
    const { data: complaint, error: complaintError } = await supabase
      .from('complaints')
      .select('id, asset_id, user_id, status, support_count, supporter_ids, assets(system_id, lab, section)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (complaintError) throw complaintError;

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found.' });
    }

    if (complaint.status === 'resolved') {
      return res.status(400).json({ message: 'Cannot support a resolved complaint.' });
    }

    if (complaint.user_id === req.user.id) {
      return res.status(400).json({ message: 'Reporter cannot +1 their own complaint.' });
    }

    const supporters = complaint.supporter_ids || [];
    const alreadySupported = supporters.includes(req.user.id);
    if (alreadySupported) {
      return res.json({
        complaintId: complaint.id,
        support_count: Number.isFinite(complaint.support_count) ? complaint.support_count : supporters.length,
        has_supported: true,
        message: 'You already supported this complaint.'
      });
    }

    const nextSupporters = [...supporters, req.user.id];
    const nextSupportCount = (Number.isFinite(complaint.support_count) ? complaint.support_count : supporters.length) + 1;

    const { data: updatedComplaint, error: updateError } = await supabase
      .from('complaints')
      .update({
        supporter_ids: nextSupporters,
        support_count: nextSupportCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', complaint.id)
      .select('id, asset_id, support_count')
      .single();

    if (updateError) throw updateError;

    const systemLabel = complaint.assets?.system_id || complaint.asset_id;
    const locationLabel = complaint.assets ? `${complaint.assets.lab}/${complaint.assets.section}` : 'Unknown Lab';

    await supabase.from('history').insert({
      asset_id: complaint.asset_id,
      event_type: 'Complaint +1',
      details: `${req.user.name} confirmed an existing issue on ${systemLabel}. Support count is now ${nextSupportCount}.`
    });

    await supabase.from('notifications').insert({
      title: 'Complaint received +1 support',
      message: `${req.user.name} confirmed an existing issue on ${systemLabel} in ${locationLabel}. Support count: ${nextSupportCount}.`,
      role_target: 'admin'
    });

    emitRoleUpdate('admin', {
      type: 'complaint_supported',
      complaintId: complaint.id,
      assetId: complaint.asset_id,
      userId: req.user.id,
      supportCount: nextSupportCount
    });

    emitUserUpdate(req.user.id, {
      type: 'complaint_supported',
      complaintId: complaint.id,
      assetId: complaint.asset_id,
      userId: req.user.id,
      supportCount: nextSupportCount
    });

    return res.json({
      complaintId: updatedComplaint.id,
      support_count: updatedComplaint.support_count,
      has_supported: true,
      message: 'Support added.'
    });
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

    const { data: assetData } = await supabase
      .from('assets')
      .select('system_id, lab, section')
      .eq('id', assetId)
      .maybeSingle();

    const systemLabel = assetData?.system_id || assetId;
    const locationLabel = assetData ? `${assetData.lab}/${assetData.section}` : 'Unknown Lab';

    await supabase.from('history').insert({
      asset_id: assetId,
      event_type: 'Complaint Logged',
      details: `${req.user.name} reported issue on ${systemLabel}: ${description.slice(0, 120)}${description.length > 120 ? '...' : ''} (Priority: ${finalPriority})`
    });

    const adminMessage = `${req.user.name} (${req.user.email}) reported ${systemLabel} in ${locationLabel}. Priority: ${finalPriority}.`;

    await supabase.from('notifications').insert({
      title: 'New complaint submitted',
      message: adminMessage,
      role_target: 'admin'
    });

    emitRoleUpdate('admin', {
      type: 'complaint_created',
      complaintId: complaint.id,
      assetId,
      userId: req.user.id
    });

    return res.status(201).json(complaint);
  } catch (error) {
    return next(error);
  }
});

export default router;
