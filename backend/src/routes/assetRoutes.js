import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

const router = express.Router();

router.get('/landing-snapshot', async (_req, res, next) => {
  try {
    const [{ data: assets, error: assetsError }, { data: history, error: historyError }] = await Promise.all([
      supabase.from('assets').select('lab, status'),
      supabase
        .from('history')
        .select('event_type, details, event_date')
        .order('event_date', { ascending: false })
        .limit(12)
    ]);

    if (assetsError) throw assetsError;
    if (historyError) throw historyError;

    const safeAssets = assets || [];
    const totalAssets = safeAssets.length;

    const statusCounts = safeAssets.reduce(
      (acc, item) => {
        const status = item.status || 'working';
        if (status === 'faulty') acc.faulty += 1;
        else if (status === 'maintenance') acc.maintenance += 1;
        else acc.working += 1;
        return acc;
      },
      { working: 0, maintenance: 0, faulty: 0 }
    );

    const toPercent = (count) => {
      if (!totalAssets) return 0;
      return Math.round((count / totalAssets) * 100);
    };

    const labs = safeAssets.reduce((acc, item) => {
      const key = item.lab || 'Unknown';
      if (!acc[key]) {
        acc[key] = { total: 0, working: 0, maintenance: 0, faulty: 0 };
      }

      acc[key].total += 1;
      if (item.status === 'faulty') acc[key].faulty += 1;
      else if (item.status === 'maintenance') acc[key].maintenance += 1;
      else acc[key].working += 1;

      return acc;
    }, {});

    const labStatuses = Object.entries(labs)
      .map(([lab, counts]) => {
        const state = counts.faulty > 0 ? 'fault' : counts.maintenance > 0 ? 'maint' : 'ok';
        return { id: lab, state };
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 3);

    const recentActivity = (history || []).slice(0, 3).map((item) => {
      const details = item.details || item.event_type || 'Lab activity updated';
      return details.length > 90 ? `${details.slice(0, 87)}...` : details;
    });

    return res.json({
      snapshot: {
        totalAssets,
        working: toPercent(statusCounts.working),
        maintenance: toPercent(statusCounts.maintenance),
        faulty: toPercent(statusCounts.faulty),
        summary: `Monitoring ${totalAssets} systems with ${statusCounts.faulty} critical faults and ${statusCounts.maintenance} in maintenance.`
      },
      labStatuses,
      recentActivity
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/labs', authenticate, async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('lab, section, system_id, status')
      .order('lab')
      .order('section');

    if (error) throw error;

    const grouped = data.reduce((acc, item) => {
      const key = `${item.lab}`;
      if (!acc[key]) {
        acc[key] = { lab: item.lab, sections: {}, total: 0, faulty: 0 };
      }
      acc[key].sections[item.section] = (acc[key].sections[item.section] || 0) + 1;
      acc[key].total += 1;
      if (item.status === 'faulty') acc[key].faulty += 1;
      return acc;
    }, {});

    return res.json(Object.values(grouped));
  } catch (error) {
    return next(error);
  }
});

router.get('/:lab', authenticate, async (req, res, next) => {
  try {
    const { q } = req.query;

    let query = supabase.from('assets').select('*').eq('lab', req.params.lab).order('row_num').order('position');

    if (q) {
      query = query.or(`system_id.ilike.%${q}%,original_id.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/detail/:systemId', authenticate, async (req, res, next) => {
  try {
    const { data: asset, error } = await supabase
      .from('assets')
      .select('*')
      .eq('system_id', req.params.systemId)
      .maybeSingle();

    if (error) throw error;
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const { data: history, error: historyError } = await supabase
      .from('history')
      .select('*')
      .eq('asset_id', asset.id)
      .order('event_date', { ascending: false });

    if (historyError) throw historyError;

    const { data: complaints, error: complaintsError } = await supabase
      .from('complaints')
      .select('id, user_id, description, priority, status, image_url, created_at, updated_at, support_count, supporter_ids, users(name)')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending: false });

    if (complaintsError) throw complaintsError;

    const enrichedComplaints = (complaints || []).map((item) => {
      const supporterIds = item.supporter_ids || [];
      return {
        ...item,
        support_count: Number.isFinite(item.support_count) ? item.support_count : supporterIds.length,
        has_supported: supporterIds.includes(req.user.id),
        supporter_ids: undefined
      };
    });

    return res.json({ asset, history, complaints: enrichedComplaints });
  } catch (error) {
    return next(error);
  }
});

export default router;
