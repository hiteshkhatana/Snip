import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ClicksByDay } from "../api";

// Formats "YYYY-MM-DD" into a short readable label (e.g. "Oct 15") for the
// chart axis, without changing the underlying date value used for the data.
function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ClicksChart({ clicksByDay }: { clicksByDay: ClicksByDay[] }) {
  if (clicksByDay.length === 0) {
    return <p>No click data available yet.</p>;
  }

  const chartData = clicksByDay.map((entry) => ({
    ...entry,
    label: formatDayLabel(entry.day),
  }));

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} label={{ value: "Clicks", angle: -90, position: "insideLeft" }} />
          <Tooltip formatter={(value) => [value, "Clicks"]} labelFormatter={(label) => label} />
          <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
