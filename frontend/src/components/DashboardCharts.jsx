import { BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';

const pieColors = ['#9d2235', '#e7a7b0', '#f4d3d8'];
const priorityColors = ['#9d2235', '#f59e0b', '#10b981'];

export default function DashboardCharts({ data }) {
  return (
    <div className="space-y-4">
      {/* 14-Day Trend Chart */}
      <div className="rounded-3xl bg-white p-4 shadow-glass">
        <h4 className="mb-4 font-semibold">14-Day Complaint Trend</h4>
        <div className="h-64">
          {(!data.trend14Days || data.trend14Days.length === 0) ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-sm">No complaint data available for the past 14 days</p>
                <p className="text-xs mt-1">Chart will display when complaints are recorded</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend14Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0d9dd" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#9d2235" 
                  fill="#fca5a5" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <h4 className="mb-4 font-semibold">Complaints Per Lab</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.complaintsPerLab || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0d9dd" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#9d2235" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <h4 className="mb-4 font-semibold">Complaint Status Split</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.byStatus || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {(data.byStatus || []).map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-glass">
          <h4 className="mb-4 font-semibold">Priority Distribution</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byPriority || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0d9dd" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {(data.byPriority || []).map((entry, index) => (
                    <Cell key={`priority-${index}`} fill={priorityColors[index % priorityColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
