import React from 'react';

interface ScoreGaugeProps {
  score: number;
  label: string;
  verdict: string;
  size?: number;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  label,
  verdict,
  size = 116,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    clamped >= 75
      ? 'var(--status-ok)'
      : clamped >= 50
        ? 'var(--status-warn)'
        : 'var(--status-err)';

  const textToneStyle = { color: strokeColor };

  return (
    <div
      className="flex flex-col items-center gap-2.5"
      role="img"
      aria-label={`${label}: ${clamped} sur 100, ${verdict}`}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono-tabular text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            {clamped}
          </span>
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">/100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
          {label}
        </p>
        <p className="text-xs font-semibold mt-0.5" style={textToneStyle}>
          {verdict}
        </p>
      </div>
    </div>
  );
};
