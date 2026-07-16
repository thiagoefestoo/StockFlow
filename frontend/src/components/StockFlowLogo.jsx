export default function StockFlowLogo({ compact = false }) {
  return (
    <span className={`stockflow-logo ${compact ? 'compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img" focusable="false">
        <defs>
          <linearGradient id="stockflowLogoGradient" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.48" stopColor="#2563eb" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect x="5" y="5" width="38" height="38" rx="13" fill="url(#stockflowLogoGradient)" />
        <path d="M15 17.5 24 12l9 5.5-9 5.4-9-5.4Z" fill="white" opacity=".96" />
        <path d="M15 21.6 24 27l9-5.4v8.9L24 36l-9-5.5v-8.9Z" fill="white" opacity=".78" />
        <path d="M24 22.9V36" stroke="#dbeafe" strokeWidth="2" strokeLinecap="round" opacity=".9" />
        <circle cx="35.5" cy="12.5" r="4.5" fill="#22c55e" stroke="white" strokeWidth="2" />
      </svg>
    </span>
  );
}
