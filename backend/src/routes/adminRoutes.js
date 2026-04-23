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

// ===== Detailed PDF rendering helpers =====

const PDF_STATUS_COLORS = { pending: '#f59e0b', in_progress: '#3b82f6', resolved: '#10b981' };
const PDF_PRIORITY_COLORS = { High: '#9d2235', Medium: '#f59e0b', Low: '#10b981' };
const PDF_ASSET_STATUS_FILL = {
  working: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  maintenance: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  faulty: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }
};

const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

const drawSectionHeader = (doc, title) => {
  ensureSpace(doc, 30);
  const y = doc.y;
  doc.save();
  doc.rect(40, y + 2, 4, 14).fill('#9d2235');
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(title, 52, y, { width: 508 });
  doc.moveDown(0.5);
};

const drawKpiCard = (doc, x, y, w, h, label, value, fillColor = '#ffffff', textColor = '#111827') => {
  doc.save();
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(fillColor, '#e5e7eb');
  doc.restore();
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#6b7280')
    .text(String(label || '').toUpperCase(), x + 8, y + 8, { width: w - 16 });
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(textColor)
    .text(String(value ?? '0'), x + 8, y + 22, { width: w - 16 });
};

const drawKpiGrid = (doc, items) => {
  const cols = 4;
  const gap = 8;
  const totalWidth = 520;
  const cardW = (totalWidth - gap * (cols - 1)) / cols;
  const cardH = 48;
  const rows = Math.ceil(items.length / cols);
  ensureSpace(doc, rows * (cardH + gap) + 4);
  const startY = doc.y;
  items.forEach((item, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cx = 40 + col * (cardW + gap);
    const cy = startY + row * (cardH + gap);
    drawKpiCard(doc, cx, cy, cardW, cardH, item.label, item.value, item.bg || '#ffffff', item.text || '#111827');
  });
  doc.y = startY + rows * (cardH + gap) + 4;
};

const drawBarChart = (doc, data, options = {}) => {
  const { x = 40, width = 520, height = 150, color = '#9d2235', title } = options;
  if (!data || !data.length) return;
  const headerSpace = title ? 16 : 0;
  ensureSpace(doc, height + headerSpace + 24);
  let yCursor = doc.y;
  if (title) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(title, x, yCursor, { width });
    yCursor += 14;
  }
  const plotY = yCursor;
  const plotH = height - 30;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const n = data.length;
  const gap = 6;
  const barW = Math.max(6, (width - gap * (n + 1)) / n);

  // Baseline
  doc.save();
  doc.lineWidth(0.5).strokeColor('#e5e7eb').moveTo(x, plotY + plotH).lineTo(x + width, plotY + plotH).stroke();
  doc.restore();

  data.forEach((d, i) => {
    const value = Number(d.value) || 0;
    const bx = x + gap + i * (barW + gap);
    const bh = value > 0 ? Math.max(2, (value / max) * plotH) : 0;
    const by = plotY + plotH - bh;
    const fill = d.color || color;
    if (bh > 0) {
      doc.save();
      doc.roundedRect(bx, by, barW, bh, 2).fill(fill);
      doc.restore();
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#111827')
      .text(String(value), bx, by - 10, { width: barW, align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#4b5563')
      .text(String(d.name), bx - 4, plotY + plotH + 4, { width: barW + 8, align: 'center' });
  });

  doc.y = plotY + plotH + 22;
};

const drawStackedBar = (doc, segments, options = {}) => {
  const { x = 40, width = 520, height = 22, title } = options;
  const valid = (segments || []).filter((s) => (Number(s.value) || 0) > 0);
  const total = valid.reduce((s, v) => s + (Number(v.value) || 0), 0);
  const headerSpace = title ? 16 : 0;
  ensureSpace(doc, height + headerSpace + 28);
  let yCursor = doc.y;
  if (title) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(title, x, yCursor, { width });
    yCursor += 14;
  }
  doc.save();
  doc.roundedRect(x, yCursor, width, height, 4).fillAndStroke('#f3f4f6', '#e5e7eb');
  doc.restore();
  if (total > 0) {
    let bx = x;
    valid.forEach((seg) => {
      const segW = (seg.value / total) * width;
      if (segW < 0.5) return;
      doc.save();
      doc.rect(bx, yCursor, segW, height).fill(seg.color);
      doc.restore();
      if (segW > 26) {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#ffffff')
          .text(String(seg.value), bx + 4, yCursor + (height / 2 - 4), { width: segW - 8 });
      }
      bx += segW;
    });
  }
  // Legend
  const legendY = yCursor + height + 6;
  let lx = x;
  (segments || []).forEach((seg) => {
    doc.save();
    doc.rect(lx, legendY + 2, 8, 8).fill(seg.color);
    doc.restore();
    const lbl = `${titleCase(seg.name)} (${seg.value || 0})`;
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(lbl, lx + 12, legendY + 2);
    lx += doc.widthOfString(lbl) + 28;
  });
  doc.y = legendY + 18;
};

const drawFilterChips = (doc, chips) => {
  if (!chips.length) return;
  let x = 40;
  let y = doc.y;
  const padX = 8;
  const padY = 4;
  const chipH = 16;
  const maxX = 560;
  chips.forEach(([k, v]) => {
    const text = `${k}: ${v}`;
    const textW = doc.font('Helvetica').fontSize(8).widthOfString(text);
    const w = textW + padX * 2;
    if (x + w > maxX) {
      x = 40;
      y += chipH + 4;
    }
    doc.save();
    doc.roundedRect(x, y, w, chipH, 8).fillAndStroke('#fff1f2', '#fecdd3');
    doc.restore();
    doc.font('Helvetica').fontSize(8).fillColor('#9f1239').text(text, x + padX, y + padY, { width: textW + 2 });
    x += w + 6;
  });
  doc.y = y + chipH + 6;
};

const drawLabLayout = (doc, assets, filters) => {
  if (!assets || !assets.length) return;
  const title = filters.lab ? `Lab Layout — ${filters.lab}` : 'Lab Layout — All Labs';
  drawSectionHeader(doc, title);
  
  // Enhanced description for All Labs
  const description = filters.lab 
    ? `Physical arrangement of ${assets.length} asset(s) in ${filters.lab}. Color indicates status.${filters.assetStatus ? ` Filtered by "${filters.assetStatus}".` : ''}`
    : `Physical arrangement of ${assets.length} asset(s) across all labs. Color indicates status.${filters.assetStatus ? ` Filtered by "${filters.assetStatus}".` : ''}`;
  
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#4b5563')
    .text(description, 40, doc.y, { width: 520 });
  doc.moveDown(0.3);

  // Legend
  const legendY = doc.y;
  let lx = 40;
  [
    { label: 'Working', key: 'working' },
    { label: 'Maintenance', key: 'maintenance' },
    { label: 'Faulty', key: 'faulty' }
  ].forEach((l) => {
    const style = PDF_ASSET_STATUS_FILL[l.key];
    doc.save();
    doc.roundedRect(lx, legendY + 2, 10, 10, 2).fillAndStroke(style.bg, style.border);
    doc.restore();
    doc.font('Helvetica').fontSize(8).fillColor('#374151').text(l.label, lx + 14, legendY + 2);
    lx += 80;
  });
  doc.y = legendY + 18;

  // Group by lab then section
  const byLab = assets.reduce((acc, a) => {
    const lab = a.lab || 'Unknown';
    if (!acc[lab]) acc[lab] = {};
    const sec = a.section || '—';
    if (!acc[lab][sec]) acc[lab][sec] = [];
    acc[lab][sec].push(a);
    return acc;
  }, {});
  const labKeys = Object.keys(byLab).sort();

  // If showing all labs, add a summary before individual labs
  if (!filters.lab && labKeys.length > 1) {
    drawSectionHeader(doc, 'All Labs Summary');
    const labStats = labKeys.map(lab => {
      const labAssets = Object.values(byLab[lab]).flat();
      const working = labAssets.filter(a => a.status === 'working').length;
      const maintenance = labAssets.filter(a => a.status === 'maintenance').length;
      const faulty = labAssets.filter(a => a.status === 'faulty').length;
      return { lab, total: labAssets.length, working, maintenance, faulty };
    });

    // Create summary table
    const summaryY = doc.y;
    ensureSpace(doc, 80);
    
    // Table headers
    const headers = ['Lab', 'Total', 'Working', 'Maintenance', 'Faulty'];
    const colWidths = [80, 80, 80, 100, 80];
    let x = 40;
    
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
    headers.forEach((header, i) => {
      doc.text(header, x, summaryY, { width: colWidths[i] });
      x += colWidths[i];
    });
    
    // Table rows
    let y = summaryY + 12;
    labStats.forEach(stat => {
      x = 40;
      const row = [stat.lab, stat.total, stat.working, stat.maintenance, stat.faulty];
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      row.forEach((value, i) => {
        doc.text(String(value), x, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      y += 10;
    });
    
    doc.y = y + 10;
    doc.moveDown(0.5);
  }

  labKeys.forEach((lab) => {
    drawSectionHeader(doc, lab);
    const sections = byLab[lab];
    const sectionKeys = Object.keys(sections).sort();

    // Add lab summary for each lab
    const labAssets = Object.values(sections).flat();
    const working = labAssets.filter(a => a.status === 'working').length;
    const maintenance = labAssets.filter(a => a.status === 'maintenance').length;
    const faulty = labAssets.filter(a => a.status === 'faulty').length;
    
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6b7280')
      .text(`Total: ${labAssets.length} | Working: ${working} | Maintenance: ${maintenance} | Faulty: ${faulty}`, 40, doc.y, { width: 520 });
    doc.moveDown(0.4);

    sectionKeys.forEach((section) => {
      const items = sections[section];
      const byRow = items.reduce((acc, a) => {
        const r = a.row_num ?? 0;
        if (!acc[r]) acc[r] = [];
        acc[r].push(a);
        return acc;
      }, {});
      const rowKeys = Object.keys(byRow).sort((a, b) => Number(a) - Number(b));

      const cellW = 26;
      const cellH = 22;
      const gap = 3;
      const rowH = cellH + gap;
      const totalH = rowKeys.length * rowH + 22;
      ensureSpace(doc, totalH + 10);

      const startY = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#7b2434')
        .text(`Section ${section}`, 40, startY, { width: 520 });
      const gridY = startY + 14;

      rowKeys.forEach((r, rowIdx) => {
        const rowItems = byRow[r].slice().sort((a, b) => (a.position || 0) - (b.position || 0));
        rowItems.forEach((a, i) => {
          const cx = 40 + i * (cellW + gap);
          const cy = gridY + rowIdx * rowH;
          const style = PDF_ASSET_STATUS_FILL[a.status] || PDF_ASSET_STATUS_FILL.working;
          const dim = filters.assetStatus && a.status !== filters.assetStatus;
          doc.save();
          if (dim) doc.fillOpacity(0.3).strokeOpacity(0.3);
          doc.lineWidth(1).roundedRect(cx, cy, cellW, cellH, 3).fillAndStroke(style.bg, style.border);
          doc.restore();
          doc
            .font('Helvetica-Bold')
            .fontSize(6.5)
            .fillColor(dim ? '#9ca3af' : style.text)
            .text(`P${String(a.position || 0).padStart(2, '0')}`, cx, cy + cellH / 2 - 3, { width: cellW, align: 'center' });
        });
      });

      doc.y = gridY + rowKeys.length * rowH + 6;
    });
  });
};

const drawCoverHeader = (doc, { dataType, filters, generatedAt, adminName }) => {
  // Generate report ID
  const dateStr = generatedAt.toISOString().split('T')[0];
  const timeStr = generatedAt.toTimeString().split(' ')[0].replace(/:/g, '-');
  const reportId = `LT-${dateStr}-${timeStr}-0003`;

  doc.save();
  doc.roundedRect(40, 30, 520, 110, 10).fill('#9d2235');
  doc.restore();

  // Main title
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#ffffff')
    .text('LabTrack Complaint Report', 52, 50, { width: 496 });
  
  // Subtitle
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#ffe4e6')
    .text('Campus Lab Asset Reliability and Service Analytics', 52, 75, { width: 496 });

  // Report metadata
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#fecdd3')
    .text(`Generated: ${generatedAt.toLocaleString()} | Report ID: ${reportId}`, 52, 95, { width: 496 });

  // Applied filters indicator
  const hasFilters = filters.lab || filters.status || filters.priority || filters.assetStatus || filters.from || filters.to;
  if (hasFilters) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#fecdd3')
      .text('Filters Applied', 52, 108, { width: 496 });
  } else {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#fecdd3')
      .text('No filters applied', 52, 108, { width: 496 });
  }

  doc.y = 155;

  // Scope and range info below header
  const scope = filters.lab ? `Scope: ${filters.lab}` : 'Scope: All Labs';
  const range =
    filters.from || filters.to ? `${filters.from || 'Start'} → ${filters.to || 'Today'}` : 'All-time data';
  
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#374151')
    .text(`${scope}  ·  ${range}`, 40, doc.y, { width: 520 });
  doc.moveDown(0.3);

  if (adminName) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(`Generated by: ${adminName}`, 40, doc.y, { width: 520 });
    doc.moveDown(0.3);
  }
};

const renderDetailedReport = (doc, ctx) => {
  const { dataType, filters, inventoryRows, complaintRows, layoutAssets, generatedAt, adminName } = ctx;

  drawCoverHeader(doc, { dataType, filters, generatedAt, adminName });

  // Table of Contents style overview for All Labs
  if (!filters.lab && layoutAssets.length > 0) {
    drawSectionHeader(doc, 'Report Overview');
    const overviewText = filters.lab 
      ? `This report provides a comprehensive analysis of ${titleCase(dataType)} for ${filters.lab}.`
      : `This report provides a comprehensive analysis of ${titleCase(dataType)} across all labs (${layoutAssets.length} total assets).`;
    
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#374151')
      .text(overviewText, 40, doc.y, { width: 520 });
    doc.moveDown(0.4);
    
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text('The report includes executive summary, analytics charts, lab layouts, and detailed data listings.', 40, doc.y, { width: 520 });
    doc.moveDown(0.6);
  }

  // Applied filters
  drawSectionHeader(doc, 'Applied Filters');
  const chips = [
    ['Data Type', titleCase(dataType)],
    ['Lab', filters.lab || 'All'],
    ['Section', filters.section || 'All'],
    ['Complaint Status', filters.status ? titleCase(filters.status) : 'All'],
    ['Priority', filters.priority || 'All'],
    ['Asset Status', filters.assetStatus ? titleCase(filters.assetStatus) : 'All'],
    ['From', filters.from || '—'],
    ['To', filters.to || 'Today'],
    ['Search', filters.search || '—']
  ];
  drawFilterChips(doc, chips);

  const wantComplaints = dataType === 'complaints' || dataType === 'both';
  const wantInventory = dataType === 'inventory' || dataType === 'both';

  // KPI counts
  const cKpi = { total: complaintRows.length, pending: 0, in_progress: 0, resolved: 0, high: 0 };
  complaintRows.forEach((r) => {
    if (cKpi[r.status] !== undefined) cKpi[r.status] += 1;
    if (r.priority === 'High') cKpi.high += 1;
  });
  const iKpi = { total: inventoryRows.length, working: 0, maintenance: 0, faulty: 0 };
  inventoryRows.forEach((r) => {
    if (iKpi[r.status] !== undefined) iKpi[r.status] += 1;
  });

  drawSectionHeader(doc, 'Executive Summary');
  const kpiItems = [];
  if (wantComplaints) {
    kpiItems.push({ label: 'Total Complaints', value: cKpi.total });
    kpiItems.push({ label: 'Pending', value: cKpi.pending, bg: '#fef3c7', text: '#92400e' });
    kpiItems.push({ label: 'In Progress', value: cKpi.in_progress, bg: '#dbeafe', text: '#1e40af' });
    kpiItems.push({ label: 'Resolved', value: cKpi.resolved, bg: '#d1fae5', text: '#065f46' });
    kpiItems.push({ label: 'High Priority', value: cKpi.high, bg: '#fee2e2', text: '#991b1b' });
  }
  if (wantInventory) {
    kpiItems.push({ label: 'Total Assets', value: iKpi.total });
    kpiItems.push({ label: 'Working', value: iKpi.working, bg: '#d1fae5', text: '#065f46' });
    kpiItems.push({ label: 'Maintenance', value: iKpi.maintenance, bg: '#fef3c7', text: '#92400e' });
    kpiItems.push({ label: 'Faulty', value: iKpi.faulty, bg: '#fee2e2', text: '#991b1b' });
  }
  drawKpiGrid(doc, kpiItems);

  // Enhanced narrative
  const narrativeParts = [];
  if (wantComplaints) {
    const resolutionRate = cKpi.total ? Math.round((cKpi.resolved / cKpi.total) * 100) : 0;
    const scopeText = filters.lab ? `in ${filters.lab}` : 'across all labs';
    narrativeParts.push(
      `Period recorded ${cKpi.total} complaint(s) ${scopeText}. High priority: ${cKpi.high}. Resolution rate: ${resolutionRate}%.`
    );
  }
  if (wantInventory) {
    const uptime = iKpi.total ? Math.round((iKpi.working / iKpi.total) * 100) : 0;
    const scopeText = filters.lab ? `in ${filters.lab}` : 'across all labs';
    narrativeParts.push(
      `Asset fleet ${scopeText}: ${iKpi.working} working, ${iKpi.maintenance} in maintenance, ${iKpi.faulty} faulty (uptime ${uptime}%).`
    );
  }
  if (narrativeParts.length) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#374151')
      .text(narrativeParts.join(' '), 40, doc.y, { width: 520 });
    doc.moveDown(0.6);
  }

  // Complaint analytics
  if (wantComplaints && complaintRows.length) {
    drawSectionHeader(doc, 'Campus Lab Asset Reliability and Service Analytics');

    // Risk Score Calculation
    const backlogRatio = cKpi.total > 0 ? ((cKpi.pending + cKpi.in_progress) / cKpi.total) * 100 : 0;
    const unresolvedHighPriority = complaintRows.filter(r => 
      r.priority === 'High' && (r.status === 'pending' || r.status === 'in_progress')
    ).length;
    const highPriorityShare = cKpi.total > 0 ? (unresolvedHighPriority / cKpi.total) * 100 : 0;
    const riskScore = Math.round((backlogRatio * 0.4) + (highPriorityShare * 0.6));
    
    // 14-day trend analysis
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentComplaints = complaintRows.filter(c => new Date(c.created_at) >= fourteenDaysAgo);
    const olderComplaints = complaintRows.filter(c => new Date(c.created_at) < fourteenDaysAgo);
    const trendDirection = recentComplaints.length > olderComplaints.length ? 'increasing' : 
                         recentComplaints.length < olderComplaints.length ? 'decreasing' : 'stable';
    const trendWindow = `${fourteenDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`;

    // Executive Summary Box
    ensureSpace(doc, 120);
    const summaryY = doc.y;
    doc.save();
    doc.roundedRect(40, summaryY, 520, 110, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.restore();
    
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Executive Summary', 52, summaryY + 12);
    
    const summaryLines = [
      `• Report scope contains ${cKpi.total} complaint record${cKpi.total === 1 ? '' : 's'}.`,
      `• Backlog ratio (pending + in-progress): ${backlogRatio.toFixed(1)}%.`,
      `• High-priority share: ${highPriorityShare.toFixed(1)}%.`,
      `• 14-day complaint trend is ${trendDirection} (${recentComplaints.length} recent vs ${olderComplaints.length} previous).`,
      `• ${cKpi.resolved > 0 ? `Resolution-time benchmark: ${Math.round(cKpi.total / cKpi.resolved)} days average.` : 'No resolved complaints, so resolution-time benchmark is unavailable.'}`,
      `• Risk Score: ${riskScore}/100 (derived from backlog, severity mix, and concentration hotspots).`
    ];
    
    let lineY = summaryY + 30;
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    summaryLines.forEach(line => {
      doc.text(line, 52, lineY, { width: 480 });
      lineY += 12;
    });
    doc.y = summaryY + 120;

    // Status and Priority Distribution
    drawSectionHeader(doc, 'Status and Priority Distribution');
    
    const statusData = [
      { name: 'Pending', value: cKpi.pending, percentage: cKpi.total > 0 ? (cKpi.pending / cKpi.total * 100).toFixed(1) : '0.0' },
      { name: 'In Progress', value: cKpi.in_progress, percentage: cKpi.total > 0 ? (cKpi.in_progress / cKpi.total * 100).toFixed(1) : '0.0' },
      { name: 'Resolved', value: cKpi.resolved, percentage: cKpi.total > 0 ? (cKpi.resolved / cKpi.total * 100).toFixed(1) : '0.0' }
    ];
    
    const priorityData = ['High', 'Medium', 'Low'].map(p => ({
      name: p,
      value: complaintRows.filter(r => r.priority === p).length,
      percentage: cKpi.total > 0 ? (complaintRows.filter(r => r.priority === p).length / cKpi.total * 100).toFixed(1) : '0.0'
    }));

    // Status distribution with percentages
    ensureSpace(doc, 80);
    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Status Distribution', 40, y);
    y += 15;
    statusData.forEach(item => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`• ${item.name}: ${item.value} (${item.percentage}%)`, 52, y);
      y += 10;
    });
    
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Priority Distribution', 40, y);
    y += 15;
    priorityData.forEach(item => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`• ${item.name} Priority: ${item.value} (${item.percentage}%)`, 52, y);
      y += 10;
    });
    doc.y = y + 10;

    // 14-Day Complaint Trend
    drawSectionHeader(doc, '14-Day Complaint Trend');
    doc.font('Helvetica').fontSize(9).fillColor('#374151').text(
      `Direction: ${trendDirection.charAt(0).toUpperCase() + trendDirection.slice(1)} for the window ${trendWindow}`,
      40, doc.y, { width: 520 }
    );
    doc.moveDown(0.4);

    // Trend visualization (simple bar chart)
    const trendData = [
      { name: 'Previous 14 days', value: olderComplaints.length },
      { name: 'Recent 14 days', value: recentComplaints.length }
    ];
    drawBarChart(doc, trendData, { title: 'Complaint Volume Comparison', color: '#3b82f6', height: 100 });

    // Hotspots and Concentration
    drawSectionHeader(doc, 'Hotspots and Concentration');
    
    // Top Labs
    const labMap = {};
    const sectionMap = {};
    const systemMap = {};
    
    complaintRows.forEach((r) => {
      const lab = r.asset_lab || 'Unknown';
      labMap[lab] = (labMap[lab] || 0) + 1;
      
      const sec = r.asset_section || '—';
      const sectionKey = `${lab}/${sec}`;
      sectionMap[sectionKey] = (sectionMap[sectionKey] || 0) + 1;
      
      const system = r.asset_system_id || 'Unknown';
      systemMap[system] = (systemMap[system] || 0) + 1;
    });
    
    const topLabs = Object.entries(labMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    
    const topSections = Object.entries(sectionMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    
    const topSystems = Object.entries(systemMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Display hotspots
    ensureSpace(doc, 120);
    y = doc.y;
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Top Labs', 40, y);
    y += 12;
    topLabs.forEach((item, i) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`${i + 1}. ${item.name} (${item.value})`, 52, y);
      y += 10;
    });
    
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Top Sections', 40, y);
    y += 12;
    topSections.forEach((item, i) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`${i + 1}. ${item.name} (${item.value})`, 52, y);
      y += 10;
    });
    
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text('Most Frequently Reported Systems', 40, y);
    y += 12;
    topSystems.forEach((item, i) => {
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`${i + 1}. ${item.name} (${item.value})`, 52, y);
      y += 10;
    });
    
    doc.y = y + 10;

    // Additional Analytics Charts
    drawSectionHeader(doc, 'Detailed Analytics');

    // By Lab chart
    drawBarChart(doc, topLabs, { title: 'Complaints by Lab', color: '#9d2235', height: 130 });

    // Status stacked
    drawStackedBar(
      doc,
      [
        { name: 'pending', value: cKpi.pending, color: PDF_STATUS_COLORS.pending },
        { name: 'in_progress', value: cKpi.in_progress, color: PDF_STATUS_COLORS.in_progress },
        { name: 'resolved', value: cKpi.resolved, color: PDF_STATUS_COLORS.resolved }
      ],
      { title: 'Status Distribution' }
    );

    // Priority bars
    const byPriority = ['High', 'Medium', 'Low'].map((p) => ({
      name: p,
      value: complaintRows.filter((r) => r.priority === p).length,
      color: PDF_PRIORITY_COLORS[p]
    }));
    drawBarChart(doc, byPriority, { title: 'Priority Distribution', height: 130 });
  }

  // Asset health analytics
  if (wantInventory && inventoryRows.length) {
    drawSectionHeader(doc, 'Asset Health Analytics');
    drawStackedBar(
      doc,
      [
        { name: 'working', value: iKpi.working, color: PDF_ASSET_STATUS_FILL.working.border },
        { name: 'maintenance', value: iKpi.maintenance, color: PDF_ASSET_STATUS_FILL.maintenance.border },
        { name: 'faulty', value: iKpi.faulty, color: PDF_ASSET_STATUS_FILL.faulty.border }
      ],
      { title: 'Asset Status Distribution' }
    );

    // Assets by lab
    const labMap = {};
    inventoryRows.forEach((r) => {
      const lab = r.lab || 'Unknown';
      labMap[lab] = (labMap[lab] || 0) + 1;
    });
    const byLab = Object.entries(labMap).map(([name, value]) => ({ name, value }));
    if (byLab.length) {
      drawBarChart(doc, byLab, { title: 'Assets by Lab', color: '#3b82f6', height: 130 });
    }
  }

  // Lab layout visualization
  doc.addPage();
  drawLabLayout(doc, layoutAssets, filters);

  // Detailed data sections
  if (wantInventory) {
    doc.addPage();
    writeInventoryPdfSection(doc, inventoryRows, filters);
  }
  if (wantComplaints) {
    doc.addPage();
    writeComplaintsPdfSection(doc, complaintRows, filters);
  }
};

router.use(authenticate, authorize('admin'));

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [{ count: totalAssets }, { count: faultyAssets }, { data: complaints }] = await Promise.all([
      supabase.from('assets').select('*', { count: 'exact', head: true }),
      supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'faulty'),
      supabase.from('complaints').select('id, status, priority, created_at, assets(lab)')
    ]);

    const complaintsPerLab = {};
    for (const c of complaints || []) {
      const lab = c.assets?.lab || 'Unknown';
      complaintsPerLab[lab] = (complaintsPerLab[lab] || 0) + 1;
    }

    // Calculate 14-day trend data
    const now = new Date();
    const trendData = [];
    
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayComplaints = (complaints || []).filter(c => {
        if (!c.created_at) return false;
        const createdDate = new Date(c.created_at);
        return createdDate >= dayStart && createdDate < dayEnd;
      }).length;
      
      trendData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: dateStr,
        count: dayComplaints
      });
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
      })),
      byPriority: ['High', 'Medium', 'Low'].map((priority) => ({
        name: priority,
        value: (complaints || []).filter((c) => c.priority === priority).length
      })),
      trend14Days: trendData
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
    let resolvedNotification = null;

    if (status === 'resolved') {
      const { data: insertedNotification, error: notificationError } = await supabase
        .from('notifications')
        .insert({
          title: 'Complaint resolved',
          message: `Your ${systemId} complaint has been resolved. Priority: ${currentComplaint.priority}.`,
          role_target: 'student',
          user_id: currentComplaint.user_id
        })
        .select('*')
        .single();

      if (notificationError) throw notificationError;
      resolvedNotification = insertedNotification;
    }

    emitRoleUpdate('admin', {
      type: 'complaint_updated',
      complaintId: req.params.id,
      assetId: currentComplaint.asset_id,
      userId: currentComplaint.user_id,
      status
    });

    emitRoleUpdate('student', {
      type: status === 'resolved' ? 'complaint_resolved' : 'complaint_updated',
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
      status,
      notification: resolvedNotification
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

      emitRoleUpdate('admin', {
        type: 'inventory_imported',
        imported: finalRows.length
      });

      emitRoleUpdate('student', {
        type: 'inventory_imported',
        imported: finalRows.length
      });
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
      // Fetch layout assets for lab diagram when a single lab is selected
      let layoutAssets = [];
      if (filters.lab) {
        const { data: labAssetRows, error: layoutErr } = await supabase
          .from('assets')
          .select('id, system_id, lab, section, row_num, position, status')
          .eq('lab', filters.lab)
          .order('section', { ascending: true })
          .order('row_num', { ascending: true })
          .order('position', { ascending: true });
        if (layoutErr) throw layoutErr;
        layoutAssets = labAssetRows || [];
      } else {
        // When no lab selected, fetch assets for all labs to show a combined layout
        const { data: allAssetRows, error: allErr } = await supabase
          .from('assets')
          .select('id, system_id, lab, section, row_num, position, status')
          .order('lab', { ascending: true })
          .order('section', { ascending: true })
          .order('row_num', { ascending: true })
          .order('position', { ascending: true });
        if (allErr) throw allErr;
        layoutAssets = allAssetRows || [];
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('error', (err) => next(err));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileBase}-report.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);
      });

      renderDetailedReport(doc, {
        dataType,
        filters,
        inventoryRows,
        complaintRows,
        layoutAssets,
        generatedAt: new Date(),
        adminName: req.user?.name || req.user?.email || ''
      });

      // Footer page numbers across all buffered pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#9ca3af')
          .text(`Page ${i + 1} of ${range.count}`, 40, doc.page.height - 24, {
            align: 'right',
            width: 520
          });
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#9ca3af')
          .text('LabTrack · Computing Lab Operations Report', 40, doc.page.height - 24, {
            align: 'left',
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
