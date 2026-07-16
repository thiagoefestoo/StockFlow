import {
  Bar,
  Doughnut,
  Line,
  Pie,
} from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Legend, Tooltip);

const palette = [
  '20,85,255',
  '14,165,233',
  '16,185,129',
  '245,158,11',
  '239,68,68',
  '168,85,247',
  '236,72,153',
  '34,197,94',
  '99,102,241',
  '100,116,139',
];

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
    tooltip: { intersect: false, mode: 'index' },
  },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.22)' } },
  },
};

function color(index, alpha = 0.72) {
  return `rgba(${palette[index % palette.length]}, ${alpha})`;
}

function normalizeData({ labels = [], datasets = [] }, type) {
  const isRadial = type === 'doughnut' || type === 'pie';
  return {
    labels,
    datasets: datasets.map((dataset, index) => ({
      borderWidth: isRadial ? 1 : 2,
      tension: 0.35,
      fill: dataset.fill ?? false,
      borderRadius: dataset.borderRadius ?? 10,
      pointRadius: dataset.pointRadius ?? 3,
      ...dataset,
      backgroundColor: dataset.backgroundColor || (isRadial ? labels.map((_, i) => color(i, 0.78)) : color(index, 0.72)),
      borderColor: dataset.borderColor || (isRadial ? labels.map((_, i) => color(i, 0.96)) : color(index, 0.95)),
    })),
  };
}

export default function ChartPanel({ title, subtitle, type = 'bar', data, options, footer, tone = 'default' }) {
  const chartData = normalizeData(data || {}, type);
  const mergedOptions = {
    ...baseOptions,
    ...options,
    plugins: { ...baseOptions.plugins, ...(options?.plugins || {}) },
    scales: type === 'doughnut' || type === 'pie' ? undefined : { ...baseOptions.scales, ...(options?.scales || {}) },
  };

  const Component = type === 'line' ? Line : type === 'pie' ? Pie : type === 'doughnut' ? Doughnut : Bar;

  return (
    <article className={`chart-panel chart-tone-${tone}`}>
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="chart-box"><Component data={chartData} options={mergedOptions} /></div>
      {footer && <div className="chart-footer">{footer}</div>}
    </article>
  );
}
