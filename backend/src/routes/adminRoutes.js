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

    const { data: currentComplaint, error: currentComplaintError } = await supabase
      .from('complaints')
      .select('id, asset_id')
      .eq('id', req.params.id)
      .single();

    if (currentComplaintError) throw currentComplaintError;

    const { data, error } = await supabase
      .from('complaints')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    if (status === 'resolved') {
      const { count: unresolvedCount, error: unresolvedError } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('asset_id', currentComplaint.asset_id)
        .in('status', ['pending', 'in_progress']);

      if (unresolvedError) throw unresolvedError;

      const nextAssetStatus = unresolvedCount > 0 ? 'faulty' : 'working';
      const { error: assetStatusError } = await supabase
        .from('assets')
        .update({ status: nextAssetStatus })
        .eq('id', currentComplaint.asset_id);

      if (assetStatusError) throw assetStatusError;

      await supabase.from('history').insert({
        asset_id: currentComplaint.asset_id,
        event_type: 'Complaint Resolved',
        details: `Complaint ${req.params.id} moved to resolved`
      });
    } else {
      const { error: assetStatusError } = await supabase
        .from('assets')
        .update({ status: 'faulty' })
        .eq('id', currentComplaint.asset_id);

      if (assetStatusError) throw assetStatusError;
    }

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
      .select('id, description, priority, status, created_at, updated_at, assets(system_id, lab, section)')
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

      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      doc.pipe(res);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 80;
      const leftX = 40;

      const asDate = (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      };

      const pct = (part, total) => (total ? `${((part / total) * 100).toFixed(1)}%` : '0.0%');

      const bar = (x, y, width, height, value, max, color) => {
        const safeMax = max || 1;
        const fill = Math.max(0, Math.min(width, (value / safeMax) * width));
        doc.roundedRect(x, y, width, height, 4).fill('#eef2f7');
        doc.roundedRect(x, y, fill, height, 4).fill(color);
      };

      const ensureSpace = (heightNeeded) => {
        if (doc.y + heightNeeded > doc.page.height - 45) {
          doc.addPage();
          doc.y = 40;
        }
      };

      const resetCursor = () => {
        doc.x = leftX;
      };

      const total = filtered.length;
      const byStatus = {
        pending: filtered.filter((c) => c.status === 'pending').length,
        in_progress: filtered.filter((c) => c.status === 'in_progress').length,
        resolved: filtered.filter((c) => c.status === 'resolved').length
      };

      const byPriority = {
        High: filtered.filter((c) => c.priority === 'High').length,
        Medium: filtered.filter((c) => c.priority === 'Medium').length,
        Low: filtered.filter((c) => c.priority === 'Low').length
      };

      const byLab = {};
      const bySection = {};
      const byAsset = {};

      filtered.forEach((item) => {
        const labKey = item.assets?.lab || 'Unknown';
        const sectionKey = `${item.assets?.lab || 'Unknown'} / ${item.assets?.section || 'N/A'}`;
        const assetKey = item.assets?.system_id || 'Unknown';
        byLab[labKey] = (byLab[labKey] || 0) + 1;
        bySection[sectionKey] = (bySection[sectionKey] || 0) + 1;
        byAsset[assetKey] = (byAsset[assetKey] || 0) + 1;
      });

      const topLabs = Object.entries(byLab)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const topSections = Object.entries(bySection)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const topAssets = Object.entries(byAsset)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const today = new Date();
      const trendDays = 14;
      const trend = Array.from({ length: trendDays }, (_, idx) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (trendDays - 1 - idx));
        const key = d.toISOString().slice(0, 10);
        return { date: key, count: 0 };
      });

      const trendMap = Object.fromEntries(trend.map((t) => [t.date, t]));
      filtered.forEach((item) => {
        const date = asDate(item.created_at);
        if (!date) return;
        const key = date.toISOString().slice(0, 10);
        if (trendMap[key]) trendMap[key].count += 1;
      });

      const trendMax = Math.max(1, ...trend.map((t) => t.count));
      const recentWindow = trend.slice(-7).reduce((sum, t) => sum + t.count, 0);
      const previousWindow = trend.slice(0, 7).reduce((sum, t) => sum + t.count, 0);
      const trendDirection = recentWindow > previousWindow ? 'Increasing' : recentWindow < previousWindow ? 'Decreasing' : 'Stable';

      const resolvedWithDurations = filtered
        .filter((c) => c.status === 'resolved')
        .map((c) => {
          const start = asDate(c.created_at);
          const end = asDate(c.updated_at || c.created_at);
          if (!start || !end) return null;
          const hours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
          return hours;
        })
        .filter((v) => v !== null);

      const avgResolutionHours = resolvedWithDurations.length
        ? resolvedWithDurations.reduce((a, b) => a + b, 0) / resolvedWithDurations.length
        : 0;

      const unresolvedRatio = total ? (byStatus.pending + byStatus.in_progress) / total : 0;
      const highRatio = total ? byPriority.High / total : 0;
      const concentration = total && topLabs.length ? topLabs[0][1] / total : 0;
      const riskScore = Math.round((unresolvedRatio * 45 + highRatio * 35 + concentration * 20) * 100);

      const activeFilters = [
        ['Lab', lab],
        ['Section', section],
        ['Status', status],
        ['Priority', priority],
        ['From', from],
        ['To', to]
      ].filter(([, value]) => Boolean(value));

      const drawHeader = () => {
        doc.save();
        doc.roundedRect(40, 30, contentWidth, 68, 12).fill('#9d2235');
        doc.fillColor('#ffffff').fontSize(19).font('Helvetica-Bold').text('LabTrack Complaint Report', 56, 50);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Generated: ${new Date().toLocaleString()}`, 56, 74);
        doc.restore();
      };

      const drawFilterAndKpi = () => {
        doc.y = 115;
        resetCursor();
        doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(11).text('Applied Filters', leftX, doc.y, { width: contentWidth });

        if (!activeFilters.length) {
          doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('None', leftX, doc.y, { width: contentWidth });
        } else {
          activeFilters.forEach(([label, value]) => {
            resetCursor();
            doc
              .font('Helvetica')
              .fontSize(10)
              .fillColor('#374151')
              .text(`${label}: `, leftX, doc.y, { continued: true, width: contentWidth })
              .font('Helvetica-Bold')
              .text(String(value));
          });
        }

        const statsY = doc.y + 10;
        const statWidth = (contentWidth - 20) / 4;
        const stats = [
          { label: 'Total', value: total },
          { label: 'Pending', value: byStatus.pending },
          { label: 'In Progress', value: byStatus.in_progress },
          { label: 'Resolved', value: byStatus.resolved }
        ];

        stats.forEach((stat, idx) => {
          const x = 40 + idx * (statWidth + 6);
          doc.save();
          doc.roundedRect(x, statsY, statWidth, 44, 8).fill('#f8fafc');
          doc.restore();
          doc
            .fillColor('#6b7280')
            .font('Helvetica')
            .fontSize(9)
            .text(stat.label, x + 10, statsY + 8)
            .fillColor('#111827')
            .font('Helvetica-Bold')
            .fontSize(16)
            .text(String(stat.value), x + 10, statsY + 20);
        });

        doc.y = statsY + 58;
      };

      const drawExecutiveSummary = () => {
        ensureSpace(120);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Executive Summary', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.3);

        const lines = [
          `Report scope contains ${total} complaint records after filters.`,
          `Backlog ratio (pending + in-progress): ${pct(byStatus.pending + byStatus.in_progress, total)}.`,
          `High-priority share: ${pct(byPriority.High, total)}.`,
          `14-day complaint trend is ${trendDirection.toLowerCase()} (${recentWindow} recent vs ${previousWindow} previous).`,
          byStatus.resolved
            ? `Average resolution time for resolved items: ${avgResolutionHours.toFixed(1)} hours.`
            : 'No resolved complaints in current scope, so resolution-time benchmark is unavailable.'
        ];

        lines.forEach((line) => {
          resetCursor();
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`- ${line}`, leftX, doc.y, { width: contentWidth });
        });

        doc.moveDown(0.6);
        resetCursor();
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#9d2235')
          .text(`Risk Score: ${riskScore}/100`, leftX, doc.y, { width: contentWidth });
        resetCursor();
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#374151')
          .text('(derived from backlog, severity mix, and concentration hotspots)', leftX, doc.y + 2, { width: contentWidth });

        doc.moveDown(0.5);
      };

      const drawDistributionSection = () => {
        ensureSpace(170);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Status and Priority Distribution', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        const statusRows = [
          ['Pending', byStatus.pending, '#c2410c'],
          ['In Progress', byStatus.in_progress, '#9d2235'],
          ['Resolved', byStatus.resolved, '#166534']
        ];

        statusRows.forEach(([label, value, color]) => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(String(label), 40, y);
          doc.font('Helvetica-Bold').fillColor('#111827').text(`${value} (${pct(value, total)})`, 150, y);
          bar(290, y + 1, 230, 9, value, total || 1, color);
          doc.y = y + 18;
        });

        doc.moveDown(0.3);

        const priorityRows = [
          ['High', byPriority.High, '#b91c1c'],
          ['Medium', byPriority.Medium, '#d97706'],
          ['Low', byPriority.Low, '#15803d']
        ];

        priorityRows.forEach(([label, value, color]) => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(String(label), 40, y);
          doc.font('Helvetica-Bold').fillColor('#111827').text(`${value} (${pct(value, total)})`, 150, y);
          bar(290, y + 1, 230, 9, value, total || 1, color);
          doc.y = y + 18;
        });

        doc.moveDown(0.5);
      };

      const drawTrendSection = () => {
        ensureSpace(170);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('14-Day Complaint Trend', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.3);

        const chartX = leftX;
        const chartY = doc.y + 8;
        const chartW = contentWidth;
        const chartH = 90;
        const colW = chartW / trend.length;

        doc.roundedRect(chartX, chartY, chartW, chartH, 8).fill('#f8fafc');

        trend.forEach((t, i) => {
          const barH = (t.count / trendMax) * (chartH - 20);
          const x = chartX + i * colW + 2;
          const y = chartY + chartH - barH - 8;
          doc.rect(x, y, Math.max(2, colW - 4), barH).fill('#9d2235');
        });

        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#4b5563')
          .text(`Window: ${trend[0]?.date || '-'} to ${trend[trend.length - 1]?.date || '-'} | Direction: ${trendDirection}`, chartX, chartY + chartH + 6);

        doc.y = chartY + chartH + 24;
      };

      const drawHotspotsSection = () => {
        ensureSpace(210);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Hotspots and Concentration', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        const maxLab = Math.max(1, ...topLabs.map(([, c]) => c), 1);
        const maxSection = Math.max(1, ...topSections.map(([, c]) => c), 1);

        resetCursor();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Top Labs', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.2);
        topLabs.forEach(([name, count]) => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(name, 40, y);
          doc.font('Helvetica-Bold').fillColor('#111827').text(`${count}`, 240, y);
          bar(290, y + 1, 230, 9, count, maxLab, '#9d2235');
          doc.y = y + 17;
        });

        if (!topLabs.length) {
          resetCursor();
          doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No lab concentration data available.', leftX, doc.y, { width: contentWidth });
        }

        doc.moveDown(0.4);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Top Sections', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.2);
        topSections.forEach(([name, count]) => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(name, 40, y, { width: 190 });
          doc.font('Helvetica-Bold').fillColor('#111827').text(`${count}`, 240, y);
          bar(290, y + 1, 230, 9, count, maxSection, '#b45309');
          doc.y = y + 17;
        });

        if (!topSections.length) {
          resetCursor();
          doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No section hotspot data available.', leftX, doc.y, { width: contentWidth });
        }

        doc.moveDown(0.5);
      };

      const drawAssetHotspotSection = () => {
        ensureSpace(200);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Most Frequently Reported Systems', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        if (!topAssets.length) {
          resetCursor();
          doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No system-level complaint data available.', leftX, doc.y, { width: contentWidth });
          doc.moveDown(0.4);
          return;
        }

        const maxAsset = Math.max(1, ...topAssets.map(([, c]) => c), 1);
        topAssets.forEach(([systemId, count]) => {
          const y = doc.y;
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(systemId, 40, y, { width: 230 });
          doc.font('Helvetica-Bold').fillColor('#111827').text(`${count}`, 280, y);
          bar(320, y + 1, 200, 9, count, maxAsset, '#1d4ed8');
          doc.y = y + 16;
        });

        doc.moveDown(0.5);
      };

      const drawRecommendations = () => {
        ensureSpace(150);
        resetCursor();
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Recommended Actions', leftX, doc.y, { width: contentWidth });
        doc.moveDown(0.4);

        const actions = [];
        if (byPriority.High > 0) {
          actions.push(`Prioritize ${byPriority.High} high-severity complaints for same-day triage.`);
        }
        if (byStatus.pending > 0) {
          actions.push(`Backlog reduction target: close or progress at least ${Math.ceil(byStatus.pending * 0.5)} pending tickets this cycle.`);
        }
        if (topLabs[0] && topLabs[0][1] / (total || 1) >= 0.4) {
          actions.push(`Run focused preventive maintenance in ${topLabs[0][0]} (highest concentration).`);
        }
        if (avgResolutionHours > 48) {
          actions.push(`Resolution SLA is slow (${avgResolutionHours.toFixed(1)}h average). Introduce escalation for >48h unresolved items.`);
        }
        if (topAssets[0] && topAssets[0][1] >= 3) {
          actions.push(`Investigate repeated failures on ${topAssets[0][0]} and consider replacement decision.`);
        }
        if (!actions.length) {
          actions.push('Current complaint portfolio is stable; continue routine preventive checks and weekly trend reviews.');
        }

        actions.forEach((a) => {
          resetCursor();
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(`- ${a}`, leftX, doc.y, { width: contentWidth });
        });
      };

      drawHeader();
      drawFilterAndKpi();

      if (!total) {
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#111827')
          .text('No Data for Selected Filters')
          .moveDown(0.3)
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#6b7280')
          .text('Try broadening the filter set to generate a full analytical report.');
      } else {
        drawExecutiveSummary();
        drawDistributionSection();
        drawTrendSection();
        drawHotspotsSection();
        drawAssetHotspotSection();
        drawRecommendations();
      }

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i += 1) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#9ca3af')
          .text(`Page ${i + 1} of ${pageCount}`, 40, doc.page.height - 25, { align: 'right', width: contentWidth });
      }

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
