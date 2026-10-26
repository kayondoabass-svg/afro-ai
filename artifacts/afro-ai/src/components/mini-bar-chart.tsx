interface MiniBarChartProps {
  data: { date: string; views: number }[];
}

export default function MiniBarChart({ data }: MiniBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-end gap-0.5 h-16 mt-2">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex-1 bg-white/5 rounded-sm min-h-[4px]" />
        ))}
      </div>
    );
  }
  const last14 = [...data].slice(-14);
  const maxViews = Math.max(...last14.map((d) => d.views), 1);
  return (
    <div className="flex items-end gap-0.5 h-16 mt-2">
      {last14.map((d, i) => {
        const pct = (d.views / maxViews) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300 relative group"
            style={{ height: `${Math.max(pct, 4)}%`, background: "linear-gradient(to top, #d4af37, #f0d060)" }}
            data-testid={`bar-mini-chart-${i}`}
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black border border-white/10 rounded px-1.5 py-0.5 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              {d.views} views<br />{d.date}
            </div>
          </div>
        );
      })}
    </div>
  );
}

