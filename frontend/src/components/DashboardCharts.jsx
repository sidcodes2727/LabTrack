import { BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const pieColors = ['#9d2235', '#e7a7b0', '#f4d3d8'];

export default function DashboardCharts({ data }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
