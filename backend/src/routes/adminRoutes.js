import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { parse } from 'csv-parse/sync';
import { authenticate, authorize } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, authorize('admin'));

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [{ count: totalAssets }, { count: faultyAssets }, { data: complaints }] = await Promise.all([
      supabase.from('assets').select('*', { count: 'exact', head: true }),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'faulty'),
      supabase.from('complaints').select('id, status, priority, assets(lab)')
    ]);

    const complaintsPerLab = {};
    for (const c of complaints || []) {
      const lab = c.assets?.lab || 'Unknown';
      complaintsPerLab[lab] = (complaintsPerLab[lab] || 0) + 1;
    }

    return res.json({
      totals: {
        assets: totalAssets || 0,
        faulty: faultyAssets || 0,
        complaints: complaints?.length || 0
      },
      complaintsPerLab: Object.entries(complaintsPerLab).map(([name, value]) => ({ name, value })),
      byStatus: ['pending', 'in_progress', 'resolved'].map((status) => ({
        name: status,
        value: (complaints || []).filter((c) => c.status === status).length
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/kanban', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*, assets(system_id, lab, section), users(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.patch('/kanban/:id', async (req, res, next) => {
  try {
    const { status } = req.body;

    const { data, error } = await supabase
      .from('complaints')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    await supabase.from('notifications').insert({
      title: 'Complaint status updated',
      message: `Complaint ${req.params.id} moved to ${status}`,
      role_target: 'student'
    });

    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.get('/notifications', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const isCsv = req.file.originalname.toLowerCase().endsWith('.csv');

    const rows = isCsv
      ? parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true })
      : XLSX.utils.sheet_to_json(XLSX.read(req.file.buffer, { type: 'buffer' }).Sheets.Sheet1);

    const validationErrors = [];
    const dedup = new Set();
    const validRows = [];

    for (const row of rows) {
      if (!row.system_id || !row.original_id || !row.lab || !row.section) {
        validationErrors.push({ row, reason: 'Missing required fields' });
        continue;
      }
      if (dedup.has(row.system_id)) {
        validationErrors.push({ row, reason: 'Duplicate system_id in file' });
        continue;
      }
      dedup.add(row.system_id);
      validRows.push(row);
    }

    const { data: existing } = await supabase
      .from('assets')
      .select('system_id')
      .in('system_id', [...dedup]);

    const existingSet = new Set((existing || []).map((r) => r.system_id));
    const finalRows = validRows.filter((r) => !existingSet.has(r.system_id));

    if (finalRows.length) {
      const { error } = await supabase.from('assets').insert(finalRows);
      if (error) throw error;
    }

    return res.json({
      imported: finalRows.length,
      skippedDuplicates: validRows.length - finalRows.length,
      validationErrors
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const { lab, status, priority, section, format = 'csv', from, to } = req.query;

    let query = supabase
      .from('complaints')
      .select('id, description, priority, status, created_at, assets(system_id, lab, section)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = (data || []).filter((item) => {
      if (lab && item.assets?.lab !== lab) return false;
      if (section && item.assets?.section !== section) return false;
      return true;
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Complaints');
      sheet.columns = [
        { header: 'ID', key: 'id' },
        { header: 'System ID', key: 'system' },
        { header: 'Lab', key: 'lab' },
        { header: 'Section', key: 'section' },
        { header: 'Priority', key: 'priority' },
        { header: 'Status', key: 'status' },
        { header: 'Description', key: 'description' },
        { header: 'Created At', key: 'created' }
      ];

      filtered.forEach((item) => {
        sheet.addRow({
          id: item.id,
          system: item.assets?.system_id,
          lab: item.assets?.lab,
          section: item.assets?.section,
          priority: item.priority,
          status: item.status,
          description: item.description,
          created: item.created_at
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="complaints.xlsx"');
      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="complaints.pdf"');

      const doc = new PDFDocument();
      doc.pipe(res);
      doc.fontSize(18).text('LabTrack Complaints Export', { underline: true });
      doc.moveDown();

      filtered.forEach((item) => {
        doc
          .fontSize(10)
          .text(
            `#${item.id} | ${item.assets?.system_id} | ${item.priority} | ${item.status} | ${new Date(item.created_at).toLocaleString()}`
          )
          .text(item.description)
          .moveDown(0.5);
      });

      doc.end();
      return null;
    }

    const csvHeader = 'id,system_id,lab,section,priority,status,description,created_at\n';
    const csvRows = filtered
      .map(
        (item) =>
          `${item.id},${item.assets?.system_id || ''},${item.assets?.lab || ''},${item.assets?.section || ''},${item.priority},${item.status},"${String(item.description).replace(/"/g, '""')}",${item.created_at}`
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="complaints.csv"');
    return res.send(csvHeader + csvRows);
  } catch (error) {
    return next(error);
  }
});

export default router;
