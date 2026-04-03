import { motion } from 'framer-motion';

const statusColors = {
  working: 'text-emerald-600 border-emerald-500',
  faulty: 'text-red-600 border-red-500',
  maintenance: 'text-amber-600 border-amber-500'
};

function PcNode({ pc, onSelect, selectedId, label }) {
  return (
    <motion.button
      whileHover={{ y: -3, scale: 1.03 }}
      onClick={() => onSelect(pc)}
      title={pc.system_id}
      className="group relative flex h-16 w-14 flex-col items-center justify-start"
    >
      <div
        className={`relative h-9 w-11 rounded-md border-2 bg-white shadow-sm transition ${
          selectedId === pc.id ? 'border-[#9d2235] ring-2 ring-[#9d2235]/25' : statusColors[pc.status]
        }`}
      >
        <div className="mx-auto mt-1.5 h-1.5 w-6 rounded-sm bg-slate-900" />
        <div className="mx-auto mt-0.5 h-1 w-3 rounded-sm bg-slate-500" />
        <span className="absolute inset-x-0 bottom-0.5 text-center font-mono text-[9px] text-slate-600">{label}</span>
      </div>

      <div
        className={`mt-1 h-5 w-7 rounded-t-[10px] rounded-b-[8px] border-2 bg-[#f2e7e8] ${
          selectedId === pc.id ? 'border-[#9d2235]' : statusColors[pc.status]
        }`}
      />

      <div
        className={`absolute -right-1 top-0 h-3.5 w-3.5 rounded-full border-2 bg-white ${
          selectedId === pc.id ? 'border-[#9d2235]' : statusColors[pc.status]
        }`}
      />
    </motion.button>
  );
}

function Lab2Layout({ groupedRows, onSelect, selectedId }) {
  const rowKeys = Object.keys(groupedRows).sort((a, b) => Number(a) - Number(b));
  const benchA = (groupedRows[rowKeys[0]] || []).sort((a, b) => a.position - b.position);
  const benchB = (groupedRows[rowKeys[1]] || []).sort((a, b) => a.position - b.position);
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">Wall Bench A</p>
      <div className="grid grid-cols-9 gap-2">
        {benchA.map((pc) => (
          <PcNode key={pc.id} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-[#9d2235]/30 bg-[#fff6f7] py-1 text-center font-mono text-[11px] text-[#9d2235]/75">
        Main Aisle
      </div>

      <div className="grid grid-cols-9 gap-2">
        {benchB.map((pc) => (
          <PcNode key={pc.id} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-gray-500">Wall Bench B</p>
    </div>
  );
}

function buildRows(groupedRows) {
  return Object.keys(groupedRows || {})
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => (groupedRows[key] || []).sort((a, b) => a.position - b.position));
}

function Lab3Layout({ leftRows, rightRows, onSelect, selectedId }) {

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-[#9d2235]/35 bg-[#fff6f7] py-1 text-center font-mono text-[11px] text-[#9d2235]">Instructor Console</div>
      <div className="grid grid-cols-[1fr_96px_1fr] gap-3">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-gray-500">Left Wing</p>
          <div className="space-y-2">
            {leftRows.map((rowItems, idx) => (
              <div key={`l-${idx}`} className="grid grid-cols-4 gap-2">
                {rowItems.map((pc) => (
                  <PcNode key={pc.id} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center rounded-xl border border-dashed border-[#9d2235]/30 bg-[#fff8f8] font-mono text-[11px] text-[#9d2235]/75">
          Open Lane
        </div>

        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-gray-500">Right Wing</p>
          <div className="space-y-2">
            {rightRows.map((rowItems, idx) => (
              <div key={`r-${idx}`} className="grid grid-cols-4 gap-2">
                {rowItems.map((pc) => (
                  <PcNode key={pc.id} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[#9d2235]/35 bg-[#fff6f7] py-1 text-center font-mono text-[11px] text-[#9d2235]">Entry / Exit</div>
    </div>
  );
}

export default function LabVisualizer({ assets, onSelect, selectedId }) {
  if (!assets.length) {
    return <p className="text-sm text-slate-500">No assets available for this lab.</p>;
  }

  const activeLab = assets[0].lab;
  const grouped = assets.reduce((acc, a) => {
    if (!acc[a.section]) acc[a.section] = [];
    acc[a.section].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-8 rounded-3xl border border-[#9d2235]/20 bg-white p-4 shadow-glass">
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-emerald-500" /> working</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-red-500" /> faulty</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-amber-500" /> maintenance</span>
      </div>

      {activeLab === 'LAB 2'
        ? Object.entries(grouped).map(([section, sectionAssets]) => {
            const rows = sectionAssets.reduce((acc, item) => {
              if (!acc[item.row_num]) acc[item.row_num] = [];
              acc[item.row_num].push(item);
              return acc;
            }, {});

            return (
              <div key={section} className="rounded-2xl border border-[#9d2235]/20 bg-[#fffdfd] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-gray-700">Section {section}</h3>
                  <p className="font-mono text-[11px] text-gray-500">2 facing rows x 9 PCs</p>
                </div>

                <div className="rounded-xl border border-[#9d2235]/20 bg-white p-3">
                  <div className="overflow-x-auto">
                    <div className="min-w-[690px]">
                      <Lab2Layout groupedRows={rows} onSelect={onSelect} selectedId={selectedId} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        : (() => {
            const leftRows = buildRows(
              (grouped.L || []).reduce((acc, item) => {
                if (!acc[item.row_num]) acc[item.row_num] = [];
                acc[item.row_num].push(item);
                return acc;
              }, {})
            );
            const rightRows = buildRows(
              (grouped.R || []).reduce((acc, item) => {
                if (!acc[item.row_num]) acc[item.row_num] = [];
                acc[item.row_num].push(item);
                return acc;
              }, {})
            );

            return (
              <div className="rounded-2xl border border-[#9d2235]/20 bg-[#fffdfd] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-gray-700">Dual Wing Layout</h3>
                  <p className="font-mono text-[11px] text-gray-500">Left + Right pods, 4 rows x 4 PCs each</p>
                </div>

                <div className="rounded-xl border border-[#9d2235]/20 bg-white p-3">
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <Lab3Layout leftRows={leftRows} rightRows={rightRows} onSelect={onSelect} selectedId={selectedId} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
    </div>
  );
}
