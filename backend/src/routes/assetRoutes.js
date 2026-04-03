import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

const router = express.Router();

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

    return res.json({ asset, history });
  } catch (error) {
    return next(error);
  }
});

export default router;
