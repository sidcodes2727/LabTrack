import { motion } from 'framer-motion';

const getAssetNodeKey = (pc) => pc?.id || pc?.system_id || `${pc?.lab || 'lab'}-${pc?.section || 'sec'}-${pc?.row_num || 0}-${pc?.position || 0}`;

const statusStyles = {
  working: {
    screen: 'border-emerald-500 bg-emerald-50',
    stand: 'bg-emerald-600',
    base: 'bg-emerald-300/70',
    text: 'text-emerald-700',
    mark: null
  },
  faulty: {
    screen: 'border-red-500 bg-red-50',
    stand: 'bg-red-600',
    base: 'bg-red-300/70',
    text: 'text-red-700',
    mark: '!'
  },
  maintenance: {
    screen: 'border-amber-500 bg-amber-50',
    stand: 'bg-amber-600',
    base: 'bg-amber-300/70',
    text: 'text-amber-700',
    mark: '⚙'
  }
};

function PcNode({ pc, onSelect, selectedId, label }) {
  const tone = statusStyles[pc.status] || statusStyles.working;
  const isSelected = selectedId === getAssetNodeKey(pc);

  return (
    <motion.button
      whileHover={{ y: -2, scale: 1.03 }}
      transition={{ duration: 0.08, ease: 'linear' }}
      onClick={() => onSelect(pc)}
      className={[
        'group relative flex h-[62px] w-[46px] flex-col items-center justify-start rounded-md p-1 transition duration-75 hover:bg-[#9d2235]/6',
        isSelected ? 'bg-[#9d2235]/12 ring-2 ring-[#9d2235]/30 shadow-[0_0_0_2px_rgba(157,34,53,0.12)]' : ''
      ].join(' ')}
    >
      <div
        className={[
          'relative h-[26px] w-[34px] rounded-[5px] border-2 transition',
          tone.screen,
          isSelected ? 'border-[#9d2235] ring-2 ring-[#9d2235]/20' : ''
        ].join(' ')}
      >
        <div className="absolute inset-x-0 top-0 h-2 rounded-t-[3px] bg-white/30" />
        {tone.mark ? <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-current">{tone.mark}</span> : null}
      </div>

      <div className={['mt-0.5 h-[4px] w-[10px] rounded-b-[3px]', tone.stand].join(' ')} />
      <div className={['mt-[2px] h-[3px] w-[18px] rounded-[2px]', tone.base].join(' ')} />

      <span className={['mt-[2px] text-[9px] font-semibold tracking-tight', tone.text, isSelected ? 'font-bold' : ''].join(' ')}>{label}</span>

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
      <div className="grid grid-cols-10 gap-2">
        {benchA.map((pc) => (
          <PcNode key={getAssetNodeKey(pc)} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-[#9d2235]/30 bg-[#fff6f7] py-1 text-center font-mono text-[11px] text-[#9d2235]/75">
        Main Aisle
      </div>

      <div className="grid grid-cols-10 gap-2">
        {benchB.map((pc) => (
          <PcNode key={getAssetNodeKey(pc)} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
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
      <div className="grid grid-cols-[88px_1fr_88px] items-center gap-2 rounded-xl border border-[#9d2235]/35 bg-[#fff6f7] p-2 font-mono text-[11px] text-[#9d2235]">
        <div className="rounded-md border border-dashed border-[#9d2235]/35 bg-white/80 py-1 text-center text-[10px] uppercase tracking-wide text-[#8d3445]">Door</div>
        <div className="rounded-md border border-[#9d2235]/25 bg-white py-1 text-center text-[10px] uppercase tracking-wide text-[#7b2434]">Smart Board</div>
        <div className="rounded-md border border-dashed border-[#9d2235]/35 bg-white/80 py-1 text-center text-[10px] uppercase tracking-wide text-[#8d3445]">Door</div>
      </div>
      <div className="grid grid-cols-[1fr_96px_1fr] gap-3">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-gray-500">Left Wing</p>
          <div className="space-y-2">
            {leftRows.map((rowItems, idx) => (
              <div key={`l-${idx}`} className="grid grid-cols-4 gap-2">
                {rowItems.map((pc) => (
                  <PcNode key={getAssetNodeKey(pc)} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
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
                  <PcNode key={getAssetNodeKey(pc)} pc={pc} onSelect={onSelect} selectedId={selectedId} label={`P${String(pc.position).padStart(2, '0')}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
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

  const orderedLab2Sections = ['2A', '2B', '2C'];

  return (
    <div className="space-y-8 rounded-3xl border border-[#9d2235]/20 bg-white p-4 shadow-glass">
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-emerald-500" /> working</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-red-500" /> faulty</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-amber-500" /> maintenance</span>
      </div>

      {activeLab === 'LAB 2'
        ? (() => {
            const lab2Sections = [...orderedLab2Sections, ...Object.keys(grouped).filter((key) => !orderedLab2Sections.includes(key))]
              .filter((section) => grouped[section]?.length);

            return (
              <div className="grid gap-4 lg:grid-cols-[112px_1fr]">
                <div className="flex self-stretch">
                  <div className="grid w-full flex-1 grid-rows-[52px_1fr_52px] gap-2 rounded-xl border border-[#9d2235]/35 bg-[#fff6f7] p-2 font-mono text-[11px] text-[#9d2235]">
                    <div className="rounded-md border border-dashed border-[#9d2235]/35 bg-white/85 py-1 text-center text-[10px] uppercase tracking-wide text-[#8d3445]">Door</div>
                    <div className="grid place-items-center rounded-md border border-[#9d2235]/25 bg-white/95 px-1 py-2 shadow-sm">
                      <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7b2434]">Smart Board</span>
                    </div>
                    <div className="rounded-md border border-dashed border-[#9d2235]/35 bg-white/85 py-1 text-center text-[10px] uppercase tracking-wide text-[#8d3445]">Door</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {lab2Sections.map((section) => {
                    const sectionAssets = grouped[section];
                    const rows = sectionAssets.reduce((acc, item) => {
                      if (!acc[item.row_num]) acc[item.row_num] = [];
                      acc[item.row_num].push(item);
                      return acc;
                    }, {});

                    return (
                      <div key={section} className="rounded-2xl border border-[#9d2235]/20 bg-[#fffdfd] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-gray-700">LAB {section}</h3>
                          <p className="font-mono text-[11px] text-gray-500">2 wall facing rows x 10 PCs</p>
                        </div>

                        <div className="rounded-xl border border-[#9d2235]/20 bg-white p-3">
                          <div className="overflow-x-auto">
                            <div className="min-w-[760px]">
                              <Lab2Layout groupedRows={rows} onSelect={onSelect} selectedId={selectedId} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
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
