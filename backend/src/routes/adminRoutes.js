import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { parse } from 'csv-parse/sync';
import { authenticate, authorize } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { emitRoleUpdate, emitUserUpdate } from '../services/socket.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const ALLOWED_KANBAN_STATUSES = ['pending', 'in_progress', 'resolved'];
const ALLOWED_EXPORT_FORMATS = ['csv', 'excel', 'pdf'];
const ALLOWED_EXPORT_DATA_TYPES = ['inventory', 'complaints', 'both'];

const INVENTORY_COLUMNS = [
  { header: 'Asset ID', key: 'id', width: 38 },
  { header: 'System ID', key: 'system_id', width: 20 },
  { header: 'Original ID', key: 'original_id', width: 20 },
  { header: 'Category', key: 'category', width: 14 },
  { header: 'Lab', key: 'lab', width: 14 },
  { header: 'Section', key: 'section', width: 12 },
  { header: 'Row', key: 'row_num', width: 10 },
  { header: 'Position', key: 'position', width: 10 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'CPU', key: 'cpu', width: 22 },
  { header: 'RAM', key: 'ram', width: 14 },
  { header: 'Purchase Date', key: 'purchase_date', width: 15 },
  { header: 'Last Maintenance', key: 'last_maintenance', width: 18 },
  { header: 'Created At', key: 'created_at', width: 20 },
  { header: 'Open Complaints', key: 'open_complaints', width: 16 },
  { header: 'Total Complaints', key: 'total_complaints', width: 16 },
  { header: 'Latest Complaint At', key: 'latest_complaint_at', width: 20 }
];

const COMPLAINT_COLUMNS = [
  { header: 'Complaint ID', key: 'id', width: 38 },
  { header: 'Asset ID', key: 'asset_id', width: 38 },
  { header: 'System ID', key: 'asset_system_id', width: 20 },
  { header: 'Original ID', key: 'asset_original_id', width: 20 },
  { header: 'Category', key: 'asset_category', width: 14 },
  { header: 'Lab', key: 'asset_lab', width: 14 },
  { header: 'Section', key: 'asset_section', width: 12 },
  { header: 'Asset Status', key: 'asset_status', width: 14 },
  { header: 'Priority', key: 'priority', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Student Name', key: 'user_name', width: 20 },
  { header: 'Student Email', key: 'user_email', width: 24 },
  { header: 'Affected Students', key: 'affected_students', width: 16 },
  { header: 'Description', key: 'description', width: 44 },
  { header: 'Created At', key: 'created_at', width: 20 },
  { header: 'Updated At', key: 'updated_at', width: 20 },
  { header: 'Status History', key: 'status_history', width: 50 }
];

const asDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIsoDayStart = (value) => {
  const date = asDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const toIsoDayEnd = (value) => {
  const date = asDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

const formatDateTime = (value) => {
  const date = asDate(value);
  if (!date) return '-';
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const formatDateOnly = (value) => {
  const date = asDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const safe = String(value).replace(/"/g, '""');
  return /[",\n]/.test(safe) ? `"${safe}"` : safe;
};

const buildCsv = (columns, rows) => {
  const header = columns.map((column) => csvEscape(column.header)).join(',');
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column.key])).join(','))
    .join('\n');
  return body ? `${header}\n${body}` : `${header}\n`;
};

const deriveAssetCategory = (asset) => {
  if (!asset) return 'Unknown';
  return asset.lab || 'Unassigned Lab';
};

const includesTerm = (value, term) => normalizeText(value).includes(normalizeText(term));

const prepareWorkbookSheet = (workbook, name, columns, rows) => {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  rows.forEach((row) => {
    const excelRow = {};
    columns.forEach((column) => {
      excelRow[column.key] = row[column.key] ?? '';
    });
    sheet.addRow(excelRow);
  });

  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };
};

const writeLabelValue = (doc, label, value, options = {}) => {
  const x = options.x || 44;
  const width = options.width || 510;
  doc.font('Helvetica-Bold').fillColor('#111827').fontSize(9).text(`${label}: `, x, doc.y, { continued: true, width });
  doc.font('Helvetica').fillColor('#374151').text(String(value ?? '-'));
};

const ensureSpace = (doc, heightNeeded) => {
  if (doc.y + heightNeeded > doc.page.height - 42) {
    doc.addPage();
    doc.y = 40;
  }
};

const fetchInventoryRows = async (filters) => {
  let assetQuery = supabase
    .from('assets')
    .select('id, system_id, original_id, lab, section, row_num, position, status, cpu, ram, purchase_date, last_maintenance, created_at')
    .order('lab', { ascending: true })
    .order('section', { ascending: true })
    .order('row_num', { ascending: true })
    .order('position', { ascending: true });

  if (filters.assetStatus) {
    assetQuery = assetQuery.eq('status', filters.assetStatus);
  }
  if (filters.fromIso) {
    assetQuery = assetQuery.gte('created_at', filters.fromIso);
  }
  if (filters.toIso) {
    assetQuery = assetQuery.lte('created_at', filters.toIso);
  }

  const { data: assets, error: assetError } = await assetQuery;
  if (assetError) throw assetError;

  const filteredAssets = (assets || []).filter((asset) => {
    const category = deriveAssetCategory(asset);

    if (filters.lab && !includesTerm(asset.lab, filters.lab)) return false;
    if (filters.section && !includesTerm(asset.section, filters.section)) return false;
    if (filters.category && !includesTerm(category, filters.category)) return false;

    if (filters.search) {
      const searchable = [asset.system_id, asset.original_id, asset.cpu, asset.ram, asset.lab, asset.section, category].join(' ');
      if (!includesTerm(searchable, filters.search)) return false;
    }

    return true;
  });

  if (!filteredAssets.length) return [];

  const assetIds = filteredAssets.map((asset) => asset.id);
  const { data: complaintRows, error: complaintError } = await supabase
    .from('complaints')
    .select('asset_id, status, created_at')
    .in('asset_id', assetIds);

  if (complaintError) throw complaintError;

  const complaintStatsByAsset = (complaintRows || []).reduce((acc, complaint) => {
    if (!acc[complaint.asset_id]) {
      acc[complaint.asset_id] = {
        total: 0,
        open: 0,
        latest: null
      };
    }

    acc[complaint.asset_id].total += 1;
    if (complaint.status !== 'resolved') {
      acc[complaint.asset_id].open += 1;
    }

    const latestDate = asDate(acc[complaint.asset_id].latest);
    const currentDate = asDate(complaint.created_at);
    if (!latestDate || (currentDate && currentDate > latestDate)) {
      acc[complaint.asset_id].latest = complaint.created_at;
    }

    return acc;
  }, {});

  return filteredAssets.map((asset) => {
    const stats = complaintStatsByAsset[asset.id] || { total: 0, open: 0, latest: null };
    return {
      ...asset,
      category: deriveAssetCategory(asset),
      purchase_date: formatDateOnly(asset.purchase_date),
      last_maintenance: formatDateOnly(asset.last_maintenance),
      created_at: formatDateTime(asset.created_at),
      open_complaints: stats.open,
      total_complaints: stats.total,
      latest_complaint_at: formatDateTime(stats.latest)
    };
  });
};

const fetchComplaintRows = async (filters) => {
  let complaintQuery = supabase
    .from('complaints')
    .select(
      'id, asset_id, user_id, description, priority, status, support_count, supporter_ids, created_at, updated_at, assets(id, system_id, original_id, lab, section, status, cpu, ram), users(name, email)'
    )
    .order('created_at', { ascending: false });

  if (filters.status) {
    complaintQuery = complaintQuery.eq('status', filters.status);
  }
  if (filters.priority) {
    complaintQuery = complaintQuery.eq('priority', filters.priority);
  }
  if (filters.fromIso) {
    complaintQuery = complaintQuery.gte('created_at', filters.fromIso);
  }
  if (filters.toIso) {
    complaintQuery = complaintQuery.lte('created_at', filters.toIso);
  }

  const { data: complaints, error: complaintError } = await complaintQuery;
  if (complaintError) throw complaintError;

  const filteredComplaints = (complaints || []).filter((item) => {
    const assetCategory = deriveAssetCategory(item.assets);

    if (filters.lab && !includesTerm(item.assets?.lab, filters.lab)) return false;
    if (filters.section && !includesTerm(item.assets?.section, filters.section)) return false;
    if (filters.assetStatus && !includesTerm(item.assets?.status, filters.assetStatus)) return false;
    if (filters.category && !includesTerm(assetCategory, filters.category)) return false;

    if (filters.search) {
      const searchable = [
        item.id,
        item.description,
        item.priority,
        item.status,
        item.assets?.system_id,
        item.assets?.original_id,
        item.assets?.lab,
        item.assets?.section,
        item.users?.name,
        item.users?.email
      ].join(' ');

      if (!includesTerm(searchable, filters.search)) return false;
    }

    return true;
  });

  if (!filteredComplaints.length) return [];

  const assetIds = [...new Set(filteredComplaints.map((item) => item.asset_id).filter(Boolean))];
  let historyRows = [];

  if (assetIds.length) {
    const { data, error } = await supabase
      .from('history')
      .select('asset_id, event_type, details, event_date')
      .in('asset_id', assetIds)
      .order('event_date', { ascending: false });

    if (error) throw error;
    historyRows = data || [];
  }

  const historyByAsset = historyRows.reduce((acc, item) => {
    if (!acc[item.asset_id]) {
      acc[item.asset_id] = [];
    }
    acc[item.asset_id].push(item);
    return acc;
  }, {});

  return filteredComplaints.map((item) => {
    const assetEvents = (historyByAsset[item.asset_id] || [])
      .filter((event) => /complaint/i.test(event.event_type || '') || /complaint/i.test(event.details || ''))
      .slice(0, 4)
      .map((event) => `${formatDateTime(event.event_date)} - ${event.event_type}: ${String(event.details || '').slice(0, 140)}`);

    const timeline = [`Created (${item.status === 'pending' ? 'pending' : 'reported'}): ${formatDateTime(item.created_at)}`];

    if (item.updated_at && item.updated_at !== item.created_at) {
      timeline.push(`Last status update (${item.status}): ${formatDateTime(item.updated_at)}`);
    }

    if (assetEvents.length) {
      timeline.push(...assetEvents);
    }

    const supporterIds = Array.isArray(item.supporter_ids) ? item.supporter_ids : [];
    const affectedStudents = Number.isFinite(item.support_count) ? item.support_count + 1 : supporterIds.length + 1;

    return {
      id: item.id,
      asset_id: item.asset_id,
      asset_system_id: item.assets?.system_id || '-',
      asset_original_id: item.assets?.original_id || '-',
      asset_category: deriveAssetCategory(item.assets),
      asset_lab: item.assets?.lab || '-',
      asset_section: item.assets?.section || '-',
      asset_status: item.assets?.status || '-',
      asset_cpu: item.assets?.cpu || '-',
      asset_ram: item.assets?.ram || '-',
      priority: item.priority,
      status: item.status,
      user_name: item.users?.name || '-',
      user_email: item.users?.email || '-',
      affected_students: affectedStudents,
      description: item.description,
      created_at: formatDateTime(item.created_at),
      updated_at: formatDateTime(item.updated_at || item.created_at),
      status_history: timeline.join(' | '),
      status_history_lines: timeline
    };
  });
};

const writeInventoryPdfSection = (doc, inventoryRows, filters) => {
  ensureSpace(doc, 90);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('Inventory Export', 40, doc.y, { width: 520 });
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(9.5).fillColor('#4b5563').text('Detailed asset report grouped by category with operational summaries.', 40, doc.y, { width: 520 });
  doc.moveDown(0.4);

  const byStatus = inventoryRows.reduce(
    (acc, row) => {
      if (row.status === 'faulty') acc.faulty += 1;
      else if (row.status === 'maintenance') acc.maintenance += 1;
      else acc.working += 1;
      return acc;
    },
    { working: 0, maintenance: 0, faulty: 0 }
  );

  const byCategory = inventoryRows.reduce((acc, row) => {
    const key = row.category || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const summaryLine = `Total Assets: ${inventoryRows.length} | Working: ${byStatus.working} | Maintenance: ${byStatus.maintenance} | Faulty: ${byStatus.faulty}`;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#9d2235').text(summaryLine, 40, doc.y, { width: 520 });
  doc.moveDown(0.4);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Assets Per Category', 40, doc.y, { width: 520 });
  const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  if (!categoryRows.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('No inventory records found for selected filters.', 40, doc.y, { width: 520 });
    doc.moveDown(0.4);
  } else {
    categoryRows.forEach(([category, count]) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`- ${category}: ${count}`, 44, doc.y, { width: 516 });
    });
    doc.moveDown(0.4);
  }

  const activeFilters = [
    ['Category', filters.category],
    ['Lab', filters.lab],
    ['Section', filters.section],
    ['Asset Status', filters.assetStatus],
    ['From', filters.from],
    ['To', filters.to]
  ].filter(([, value]) => value);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Applied Filters', 40, doc.y, { width: 520 });
  if (!activeFilters.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('None', 44, doc.y, { width: 516 });
  } else {
    activeFilters.forEach(([name, value]) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`- ${name}: ${value}`, 44, doc.y, { width: 516 });
    });
  }
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text('Detailed Asset Listing', 40, doc.y, { width: 520 });
  doc.moveDown(0.3);

  const maxRows = 180;
  const rowsToRender = inventoryRows.slice(0, maxRows);

  rowsToRender.forEach((row, index) => {
    const cardLines = [
      `System: ${row.system_id}  |  Original: ${row.original_id}  |  Category: ${row.category}`,
      `Location: ${row.lab} / ${row.section}  |  Row: ${row.row_num}  |  Position: ${row.position}`,
      `Status: ${row.status}  |  CPU: ${row.cpu}  |  RAM: ${row.ram}`,
      `Purchased: ${row.purchase_date}  |  Last Maintenance: ${row.last_maintenance}  |  Created: ${row.created_at}`,
      `Complaints: ${row.total_complaints} total, ${row.open_complaints} open, latest ${row.latest_complaint_at}`
    ];

    const textHeight = cardLines.reduce((acc, line) => acc + doc.heightOfString(line, { width: 496 }), 0);
    const cardHeight = Math.max(68, textHeight + 18);
    ensureSpace(doc, cardHeight + 8);

    const cardY = doc.y;
    doc.save();
    doc.roundedRect(40, cardY, 520, cardHeight, 7).fill(index % 2 === 0 ? '#f8fafc' : '#f1f5f9');
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827').text(`${index + 1}. Asset ${row.id}`, 48, cardY + 8, { width: 500 });
    let lineY = cardY + 21;
    cardLines.forEach((line) => {
      doc.font('Helvetica').fontSize(8.9).fillColor('#374151').text(line, 48, lineY, { width: 496 });
      lineY += doc.heightOfString(line, { width: 496 });
    });

    doc.y = cardY + cardHeight + 8;
  });

  if (inventoryRows.length > rowsToRender.length) {
    ensureSpace(doc, 20);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        `Showing ${rowsToRender.length} of ${inventoryRows.length} assets in PDF detail view. Use CSV/Excel export for full raw dataset.`,
        40,
        doc.y,
        { width: 520 }
      );
    doc.moveDown(0.4);
  }
};

const writeComplaintsPdfSection = (doc, complaintRows, filters) => {
  ensureSpace(doc, 90);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('Complaints Export', 40, doc.y, { width: 520 });
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#4b5563')
    .text('Detailed complaint report including user details, status timeline, timestamps, and related asset context.', 40, doc.y, {
      width: 520
    });
  doc.moveDown(0.4);

  const byStatus = complaintRows.reduce(
    (acc, row) => {
      if (row.status === 'pending') acc.pending += 1;
      else if (row.status === 'in_progress') acc.in_progress += 1;
      else if (row.status === 'resolved') acc.resolved += 1;
      return acc;
    },
    { pending: 0, in_progress: 0, resolved: 0 }
  );

  const byPriority = complaintRows.reduce(
    (acc, row) => {
      if (row.priority === 'High') acc.High += 1;
      else if (row.priority === 'Medium') acc.Medium += 1;
      else if (row.priority === 'Low') acc.Low += 1;
      return acc;
    },
    { High: 0, Medium: 0, Low: 0 }
  );

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#9d2235')
    .text(
      `Total Complaints: ${complaintRows.length} | Pending: ${byStatus.pending} | In Progress: ${byStatus.in_progress} | Resolved: ${byStatus.resolved}`,
      40,
      doc.y,
      { width: 520 }
    );
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#374151')
    .text(`Priority Mix - High: ${byPriority.High}, Medium: ${byPriority.Medium}, Low: ${byPriority.Low}`, 40, doc.y + 2, {
      width: 520
    });
  doc.moveDown(0.5);

  const activeFilters = [
    ['Category', filters.category],
    ['Lab', filters.lab],
    ['Section', filters.section],
    ['Complaint Status', filters.status],
    ['Asset Status', filters.assetStatus],
    ['Priority', filters.priority],
    ['From', filters.from],
    ['To', filters.to]
  ].filter(([, value]) => value);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Applied Filters', 40, doc.y, { width: 520 });
  if (!activeFilters.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('None', 44, doc.y, { width: 516 });
  } else {
    activeFilters.forEach(([name, value]) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`- ${name}: ${value}`, 44, doc.y, { width: 516 });
    });
  }
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111827').text('Detailed Complaint Listing', 40, doc.y, { width: 520 });
  doc.moveDown(0.3);

  const maxRows = 140;
  const rowsToRender = complaintRows.slice(0, maxRows);

  rowsToRender.forEach((row, index) => {
    const historyLines = row.status_history_lines.slice(0, 5);
    const description = String(row.description || '-').replace(/\s+/g, ' ').trim();
    const descriptionLine = `Description: ${description.length > 280 ? `${description.slice(0, 277)}...` : description}`;

    const fixedLines = [
      `Complaint: ${row.id}`,
      `Asset: ${row.asset_system_id} (${row.asset_original_id}) | ${row.asset_lab}/${row.asset_section} | Asset Status: ${row.asset_status}`,
      `User: ${row.user_name} <${row.user_email}> | Priority: ${row.priority} | Status: ${row.status}`,
      `Created: ${row.created_at} | Updated: ${row.updated_at} | Affected Students: ${row.affected_students}`,
      `Hardware: CPU ${row.asset_cpu} | RAM ${row.asset_ram}`,
      descriptionLine,
      'Status History:'
    ];

    const allLines = [...fixedLines, ...historyLines.map((line) => `- ${line}`)];
    const textHeight = allLines.reduce((acc, line) => acc + doc.heightOfString(line, { width: 496 }), 0);
    const cardHeight = Math.max(96, textHeight + 20);

    ensureSpace(doc, cardHeight + 8);
    const cardY = doc.y;

    doc.save();
    doc.roundedRect(40, cardY, 520, cardHeight, 7).fill(index % 2 === 0 ? '#fff7ed' : '#fff1f2');
    doc.restore();

    let lineY = cardY + 8;
    allLines.forEach((line, lineIndex) => {
      const isHeading = lineIndex === 0 || line === 'Status History:';
      doc
        .font(isHeading ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isHeading ? 9.4 : 8.9)
        .fillColor('#1f2937')
        .text(`${lineIndex === 0 ? `${index + 1}. ` : ''}${line}`, 48, lineY, { width: 496 });
      lineY += doc.heightOfString(`${lineIndex === 0 ? `${index + 1}. ` : ''}${line}`, { width: 496 });
    });

    doc.y = cardY + cardHeight + 8;
  });

  if (complaintRows.length > rowsToRender.length) {
    ensureSpace(doc, 20);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(
        `Showing ${rowsToRender.length} of ${complaintRows.length} complaints in PDF detail view. Use CSV/Excel export for full raw dataset.`,
        40,
        doc.y,
        { width: 520 }
      );
    doc.moveDown(0.4);
  }
};

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
      .select('*, assets(system_id, lab, section), users(name, email)')
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

    if (!ALLOWED_KANBAN_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid complaint status.' });
    }

    const { data: currentComplaint, error: currentComplaintError } = await supabase
      .from('complaints')
      .select('id, asset_id, user_id, priority, description, status, assets(system_id, lab, section), users(name, email)')
      .eq('id', req.params.id)
      .single();

    if (currentComplaintError) throw currentComplaintError;

    if (currentComplaint.status === 'resolved' && status !== 'resolved') {
      return res.status(400).json({ message: 'Resolved complaints are locked and cannot be moved back.' });
    }

    if (currentComplaint.status === status) {
      return res.json({ ...currentComplaint, status });
    }

    const { data, error } = await supabase
      .from('complaints')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;

    if (status === 'resolved') {
      const { data: unresolvedComplaints, error: unresolvedError } = await supabase
        .from('complaints')
        .select('status')
        .eq('asset_id', currentComplaint.asset_id)
        .in('status', ['pending', 'in_progress']);

      if (unresolvedError) throw unresolvedError;

      const hasInProgress = (unresolvedComplaints || []).some((item) => item.status === 'in_progress');
      const hasPending = (unresolvedComplaints || []).some((item) => item.status === 'pending');

      const nextAssetStatus = hasInProgress ? 'maintenance' : hasPending ? 'faulty' : 'working';
      const { error: assetStatusError } = await supabase
        .from('assets')
        .update({ status: nextAssetStatus })
        .eq('id', currentComplaint.asset_id);

      if (assetStatusError) throw assetStatusError;

      await supabase.from('history').insert({
        asset_id: currentComplaint.asset_id,
        event_type: 'Complaint Resolved',
        details: `Issue on ${currentComplaint.assets?.system_id || currentComplaint.asset_id} resolved by admin (${currentComplaint.users?.name || 'Unknown Student'}).`
      });
    } else {
      await supabase.from('history').insert({
        asset_id: currentComplaint.asset_id,
        event_type: 'Complaint Status Updated',
        details: `Complaint for ${currentComplaint.assets?.system_id || currentComplaint.asset_id} moved to ${status.replace('_', ' ')}.`
      });
    }

    const systemId = currentComplaint.assets?.system_id || currentComplaint.asset_id;
    if (status === 'resolved') {
      await supabase.from('notifications').insert({
        title: 'Complaint resolved',
        message: `Your ${systemId} complaint has been resolved. Priority: ${currentComplaint.priority}.`,
        role_target: 'student',
        user_id: currentComplaint.user_id
      });
    }

    emitRoleUpdate('admin', {
      type: 'complaint_updated',
      complaintId: req.params.id,
      assetId: currentComplaint.asset_id,
      userId: currentComplaint.user_id,
      status
    });

    emitUserUpdate(currentComplaint.user_id, {
      type: status === 'resolved' ? 'complaint_resolved' : 'complaint_updated',
      complaintId: req.params.id,
      assetId: currentComplaint.asset_id,
      userId: currentComplaint.user_id,
      status
    });

    if (status !== 'resolved') {
      const nextAssetStatus = status === 'in_progress' ? 'maintenance' : 'faulty';
      const { error: assetStatusError } = await supabase
        .from('assets')
        .update({ status: nextAssetStatus })
        .eq('id', currentComplaint.asset_id);

      if (assetStatusError) throw assetStatusError;
    }

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
      .or('role_target.eq.admin,role_target.is.null')
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
    const format = normalizeText(req.query.format || 'csv');
    const dataType = normalizeText(req.query.dataType || req.query.type || 'complaints');

    if (!ALLOWED_EXPORT_FORMATS.includes(format)) {
      return res.status(400).json({ message: `Invalid format. Allowed: ${ALLOWED_EXPORT_FORMATS.join(', ')}` });
    }

    if (!ALLOWED_EXPORT_DATA_TYPES.includes(dataType)) {
      return res.status(400).json({ message: `Invalid dataType. Allowed: ${ALLOWED_EXPORT_DATA_TYPES.join(', ')}` });
    }

    const filters = {
      category: String(req.query.category || '').trim(),
      lab: String(req.query.lab || '').trim(),
      section: String(req.query.section || '').trim(),
      status: String(req.query.status || '').trim(),
      assetStatus: String(req.query.assetStatus || '').trim(),
      priority: String(req.query.priority || '').trim(),
      from: String(req.query.from || '').trim(),
      to: String(req.query.to || '').trim(),
      search: String(req.query.search || '').trim(),
      fromIso: toIsoDayStart(req.query.from),
      toIso: toIsoDayEnd(req.query.to)
    };

    const inventoryRows = dataType === 'inventory' || dataType === 'both' ? await fetchInventoryRows(filters) : [];
    const complaintRows = dataType === 'complaints' || dataType === 'both' ? await fetchComplaintRows(filters) : [];

    const fileBase = dataType === 'both' ? 'inventory-complaints' : dataType;

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();

      if (dataType === 'inventory') {
        prepareWorkbookSheet(workbook, 'Inventory', INVENTORY_COLUMNS, inventoryRows);
      } else if (dataType === 'complaints') {
        prepareWorkbookSheet(workbook, 'Complaints', COMPLAINT_COLUMNS, complaintRows);
      } else {
        prepareWorkbookSheet(workbook, 'Inventory', INVENTORY_COLUMNS, inventoryRows);
        prepareWorkbookSheet(workbook, 'Complaints', COMPLAINT_COLUMNS, complaintRows);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);

      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      doc.pipe(res);

      doc.save();
      doc.roundedRect(40, 30, 520, 76, 10).fill('#9d2235');
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(21).fillColor('#ffffff').text('LabTrack Admin Export Report', 52, 50, { width: 500 });
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#ffe4e6')
        .text(
          `Dataset: ${dataType.toUpperCase()}  |  Generated: ${new Date().toLocaleString()}  |  Format: PDF`,
          52,
          79,
          { width: 500 }
        );

      doc.y = 122;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Export Overview', 40, doc.y, { width: 520 });
      writeLabelValue(doc, 'Inventory Records', inventoryRows.length);
      writeLabelValue(doc, 'Complaint Records', complaintRows.length);
      writeLabelValue(doc, 'Selected Data Type', dataType);
      writeLabelValue(doc, 'Applied Search', filters.search || 'None');
      doc.moveDown(0.4);

      if (dataType === 'inventory' || dataType === 'both') {
        writeInventoryPdfSection(doc, inventoryRows, filters);
      }

      if (dataType === 'both') {
        ensureSpace(doc, 32);
        doc.moveDown(0.3);
      }

      if (dataType === 'complaints' || dataType === 'both') {
        writeComplaintsPdfSection(doc, complaintRows, filters);
      }

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i += 1) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#9ca3af')
          .text(`Page ${i + 1} of ${pageCount}`, 40, doc.page.height - 24, {
            align: 'right',
            width: 520
          });
      }

      doc.end();
      return null;
    }

    if (dataType === 'inventory') {
      const csv = buildCsv(INVENTORY_COLUMNS, inventoryRows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
      return res.send(csv);
    }

    if (dataType === 'complaints') {
      const csv = buildCsv(COMPLAINT_COLUMNS, complaintRows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
      return res.send(csv);
    }

    const BOTH_COLUMNS = [
      { header: 'Record Type', key: 'record_type' },
      { header: 'Primary ID', key: 'primary_id' },
      { header: 'System ID', key: 'system_id' },
      { header: 'Category', key: 'category' },
      { header: 'Lab', key: 'lab' },
      { header: 'Section', key: 'section' },
      { header: 'Status', key: 'status' },
      { header: 'Priority', key: 'priority' },
      { header: 'User Name', key: 'user_name' },
      { header: 'User Email', key: 'user_email' },
      { header: 'Description / Specs', key: 'details' },
      { header: 'Created At', key: 'created_at' },
      { header: 'Updated At', key: 'updated_at' },
      { header: 'Extra Notes', key: 'extra' }
    ];

    const bothRows = [
      ...inventoryRows.map((row) => ({
        record_type: 'inventory',
        primary_id: row.id,
        system_id: row.system_id,
        category: row.category,
        lab: row.lab,
        section: row.section,
        status: row.status,
        priority: '',
        user_name: '',
        user_email: '',
        details: `CPU ${row.cpu} | RAM ${row.ram} | Original ${row.original_id}`,
        created_at: row.created_at,
        updated_at: row.last_maintenance,
        extra: `Complaints: ${row.total_complaints} total, ${row.open_complaints} open`
      })),
      ...complaintRows.map((row) => ({
        record_type: 'complaint',
        primary_id: row.id,
        system_id: row.asset_system_id,
        category: row.asset_category,
        lab: row.asset_lab,
        section: row.asset_section,
        status: row.status,
        priority: row.priority,
        user_name: row.user_name,
        user_email: row.user_email,
        details: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        extra: row.status_history
      }))
    ];

    const csv = buildCsv(BOTH_COLUMNS, bothRows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

export default router;
