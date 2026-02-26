"use client";
import React, { useState, useMemo } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Clock, Globe, Plus, Search } from 'lucide-react';
import { useWebsites } from '@/hooks/useWebsites';
import axios from 'axios';
import { API_BACKEND_URL } from '@/config';
import { useAuth } from '@clerk/nextjs';

type UptimeStatus = "good" | "bad" | "unknown";

function StatusCircle({ status }: { status: UptimeStatus }) {
  return (
    <div
      className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-white/10 ${
        status === 'good'
          ? 'bg-emerald-400 ring-emerald-400/10'
          : status === 'bad'
            ? 'bg-rose-400 ring-rose-400/10'
            : 'bg-slate-400 ring-slate-400/10'
      }`}
    />
  );
}

function UptimeTicks({ ticks }: { ticks: UptimeStatus[] }) {
  return (
    <div className="flex gap-1 mt-3">
      {ticks.map((tick, index) => (
        <div
          key={index}
          className={`h-2 w-7 rounded-full ${
            tick === 'good'
              ? 'bg-emerald-400/80'
              : tick === 'bad'
                ? 'bg-rose-400/80'
                : 'bg-slate-500/60'
          }`}
        />
      ))}
    </div>
  );
}

function CreateWebsiteModal({ isOpen, onClose }: { isOpen: boolean; onClose: (url: string | null) => void }) {
  const [url, setUrl] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Add a website monitor</h2>
        <p className="mt-2 text-sm text-slate-400">We will ping your endpoint every minute and alert on anomalies.</p>
        <div className="mt-6">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">
            Website URL
          </label>
          <input
            type="url"
            className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 hover:border-white/20"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={() => onClose(url)}
            className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            Add monitor
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProcessedWebsite {
  id: string;
  url: string;
  status: UptimeStatus;
  uptimePercentage: number;
  lastChecked: string;
  uptimeTicks: UptimeStatus[];
  minuteHealth: {
    timestamp: Date;
    health: number | null;
    latency: number | null;
  }[];
  cooldownMinutes: number;
  retries: number;
  quorum: number;
  validatorsPerRound: number;
  escalationMinutes: number;
  statusPageSlug?: string | null;
  statusPagePublic?: boolean;
  checkType: "HTTP" | "MULTI_STEP" | "KEYWORD" | "DNS" | "TLS";
  sloTarget: number;
  teamName: string;
  incidents: {
    id: string;
    status: "OPEN" | "RESOLVED";
    startedAt: string;
    acknowledgedAt?: string | null;
    escalatedAt?: string | null;
    events: { id: string; type: string; message: string; createdAt: string }[];
  }[];
  alertRoutes: {
    id: string;
    targetTeam: string;
    minSeverity: "P1" | "P2" | "P3";
    channel: "EMAIL" | "SMS" | "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
  }[];
  integrations: {
    id: string;
    type: "EMAIL" | "SMS" | "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
    endpoint: string;
    enabled: boolean;
  }[];
  onCallSchedules: {
    id: string;
    rotationName: string;
    timezone: string;
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
  }[];
  components: {
    id: string;
    name: string;
    checkType: "HTTP" | "MULTI_STEP" | "KEYWORD" | "DNS" | "TLS";
    path?: string | null;
    targetUrl?: string | null;
    ticks: {
      id: string;
      createdAt: string;
      status: string;
      latency: number;
      details?: string | null;
    }[];
  }[];
}

interface WebsiteAnalytics {
  sli: number;
  sloTarget: number;
  errorBudgetRemaining: number;
  latency: { p50: number; p95: number; p99: number };
  mttaMs: number;
  mttrMs: number;
  regionalHeatmap: { region: string; total: number; errorRate: number }[];
}

interface AlertDeliveryRow {
  id: string;
  channelType: string;
  destination: string;
  status: string;
  notificationKind: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  sentAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

function AdvancedLiveGraph({
  series,
  lockedMetric,
  title,
}: {
  series: { timestamp: Date; health: number | null; latency: number | null }[];
  lockedMetric?: "health" | "latency" | "compare";
  title?: string;
}) {
  const [metric, setMetric] = useState<"health" | "latency" | "compare">("health");
  const [rangeMinutes, setRangeMinutes] = useState<30 | 60 | 120>(60);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activeMetric = lockedMetric ?? metric;

  const sliced = series.slice(-rangeMinutes);
  const width = 700;
  const height = 210;
  const padX = 24;
  const padY = 18;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2;

  const healthValues = sliced
    .map((point) => point.health)
    .filter((value): value is number => value !== null);

  const latencyValues = sliced
    .map((point) => point.latency)
    .filter((value): value is number => value !== null);

  const values = sliced
    .map((point) => activeMetric === "latency" ? point.latency : point.health)
    .filter((value): value is number => value !== null);

  const average = (arr: number[]) => arr.length > 0 ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0;
  const mean = average(values);
  const variance = values.length > 0 ? average(values.map((value) => (value - mean) ** 2)) : 0;
  const stdDev = Math.sqrt(variance);

  const smooth = (arr: number[], alpha = 0.28) => {
    if (arr.length === 0) return [] as number[];
    const out: number[] = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      out.push(alpha * arr[i] + (1 - alpha) * out[i - 1]);
    }
    return out;
  };

  const healthFloor = healthValues.length > 0
    ? Math.max(0, Math.floor((Math.min(...healthValues) - 2) / 2) * 2)
    : 80;

  const yMax = activeMetric === "latency"
    ? Math.max(500, Math.ceil((Math.max(0, ...values) * 1.15) / 50) * 50)
    : 100;

  const yMin = activeMetric === "health" ? healthFloor : 0;

  const yMaxLatency = Math.max(500, Math.ceil((Math.max(0, ...latencyValues) * 1.15) / 50) * 50);

  const yTicks = activeMetric === "latency"
    ? [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((value) => Math.round(value))
    : [yMin, yMin + (100 - yMin) * 0.25, yMin + (100 - yMin) * 0.5, yMin + (100 - yMin) * 0.75, 100].map((value) => Math.round(value));

  const latencyTicks = [0, yMaxLatency * 0.25, yMaxLatency * 0.5, yMaxLatency * 0.75, yMaxLatency].map((value) => Math.round(value));

  const scaleY = (value: number, min: number, max: number) => {
    if (max === min) return padY + plotHeight / 2;
    const clampedValue = Math.min(max, Math.max(min, value));
    const normalized = (clampedValue - min) / (max - min);
    return padY + (1 - normalized) * plotHeight;
  };

  const healthPoints = sliced.map((point, index) => {
    const x = padX + (index / Math.max(1, sliced.length - 1)) * plotWidth;
    if (point.health === null) {
      return { x, y: null as number | null, value: null as number | null };
    }
    const y = scaleY(point.health, healthFloor, 100);
    return { x, y, value: point.health };
  });

  const latencyPoints = sliced.map((point, index) => {
    const x = padX + (index / Math.max(1, sliced.length - 1)) * plotWidth;
    if (point.latency === null) {
      return { x, y: null as number | null, value: null as number | null };
    }
    const y = scaleY(point.latency, 0, yMaxLatency);
    return { x, y, value: point.latency };
  });

  const activePoints = activeMetric === "latency" ? latencyPoints : healthPoints;

  const toSegments = (points: { x: number; y: number | null }[]) => {
    const segments: { x: number; y: number }[][] = [];
    let currentSegment: { x: number; y: number }[] = [];

    for (const point of points) {
      if (point.y === null) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
        continue;
      }
      currentSegment.push({ x: point.x, y: point.y });
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments;
  };

  const smoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  };

  const segments = toSegments(activePoints);
  const compareSegments = toSegments(latencyPoints);

  const smoothedValues = smooth(values);
  const smoothedPoints = smoothedValues.map((value, idx) => {
    const x = padX + (idx / Math.max(1, smoothedValues.length - 1)) * plotWidth;
    const y = activeMetric === "latency"
      ? scaleY(value, 0, yMax)
      : scaleY(value, yMin, 100);
    return { x, y };
  });

  const latestHealth = [...sliced].reverse().find((point) => point.health !== null)?.health ?? null;
  const latestLatency = [...sliced].reverse().find((point) => point.latency !== null)?.latency ?? null;

  const averageHealth = healthValues.length > 0 ? healthValues.reduce((sum, value) => sum + value, 0) / healthValues.length : null;
  const averageLatency = latencyValues.length > 0 ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length : null;

  const latestValue = activeMetric === "latency" ? latestLatency : latestHealth;
  const averageValue = activeMetric === "latency" ? averageLatency : averageHealth;
  const peakValue = values.length > 0 ? Math.max(...values) : null;
  const lowValue = values.length > 0 ? Math.min(...values) : null;
  const previousValue = values.length > 1 ? values[values.length - 2] : null;
  const trendDelta = latestValue !== null && previousValue !== null ? latestValue - previousValue : null;
  const trendLabel = trendDelta === null
    ? "—"
    : activeMetric === "health"
      ? `${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(2)}%`
      : `${trendDelta >= 0 ? "+" : ""}${trendDelta.toFixed(0)} ms`;
  const volatilityLabel = values.length > 1
    ? activeMetric === "health"
      ? `${stdDev.toFixed(2)}%`
      : `${stdDev.toFixed(0)} ms`
    : "—";

  const stroke = activeMetric === "latency" ? "rgba(244,114,182,0.95)" : "rgba(34,211,238,0.95)";
  const area = activeMetric === "latency"
    ? "rgba(244,114,182,0.22)"
    : "rgba(34,211,238,0.22)";

  const compareStroke = "rgba(244,114,182,0.95)";
  const compareArea = "rgba(244,114,182,0.16)";

  const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (sliced.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const index = Math.round(normalizedX * (sliced.length - 1));
    setHoverIndex(Math.min(Math.max(index, 0), sliced.length - 1));
  };

  const handlePointerLeave = () => setHoverIndex(null);

  const activeIndex = hoverIndex !== null
    ? Math.min(Math.max(hoverIndex, 0), Math.max(sliced.length - 1, 0))
    : null;

  const active = activeIndex !== null ? sliced[activeIndex] : null;
  const activeX = activeIndex !== null
    ? padX + (activeIndex / Math.max(1, sliced.length - 1)) * plotWidth
    : null;

  const activeHealthY = active?.health === null || active?.health === undefined
    ? null
    : scaleY(active.health, healthFloor, 100);

  const activeLatencyY = active?.latency === null || active?.latency === undefined
    ? null
    : scaleY(active.latency, 0, yMaxLatency);

  const tooltipLabel = active
    ? active.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const anomalyIndices = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => stdDev > 0 && Math.abs(value - mean) > stdDev * 1.8)
    .map(({ index }) => index);

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">{title ?? "Live telemetry"}</p>
          <p className="text-xs text-slate-300">Updates every minute</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!lockedMetric ? (
            <div className="flex rounded-full border border-white/15 bg-slate-950/60 p-1 text-[11px]">
              <button
                className={`rounded-full px-3 py-1 ${activeMetric === "health" ? "bg-cyan-400/20 text-cyan-100" : "text-slate-300"}`}
                onClick={() => setMetric("health")}
              >
                Health %
              </button>
              <button
                className={`rounded-full px-3 py-1 ${activeMetric === "latency" ? "bg-pink-400/20 text-pink-100" : "text-slate-300"}`}
                onClick={() => setMetric("latency")}
              >
                Latency
              </button>
              <button
                className={`rounded-full px-3 py-1 ${activeMetric === "compare" ? "bg-violet-400/20 text-violet-100" : "text-slate-300"}`}
                onClick={() => setMetric("compare")}
              >
                Compare
              </button>
            </div>
          ) : null}
          <div className="flex rounded-full border border-white/15 bg-slate-950/60 p-1 text-[11px]">
            {[30, 60, 120].map((minutes) => (
              <button
                key={minutes}
                className={`rounded-full px-3 py-1 ${rangeMinutes === minutes ? "bg-white/15 text-white" : "text-slate-300"}`}
                onClick={() => setRangeMinutes(minutes as 30 | 60 | 120)}
              >
                {minutes}m
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        {activeMetric !== "compare" ? (
          <>
            <StatPill label="Current" value={latestValue === null ? "--" : activeMetric === "health" ? `${latestValue.toFixed(1)}%` : `${latestValue.toFixed(0)} ms`} />
            <StatPill label="Average" value={averageValue === null ? "--" : activeMetric === "health" ? `${averageValue.toFixed(1)}%` : `${averageValue.toFixed(0)} ms`} />
            <StatPill label="Trend" value={trendLabel} tone={trendDelta !== null && trendDelta < 0 && activeMetric === "latency" ? "good" : trendDelta !== null && trendDelta > 0 && activeMetric === "health" ? "good" : "neutral"} />
            <StatPill label="Volatility" value={volatilityLabel} />
          </>
        ) : (
          <>
            <StatPill label="Current health" value={latestHealth === null ? "--" : `${latestHealth.toFixed(1)}%`} />
            <StatPill label="Current latency" value={latestLatency === null ? "--" : `${latestLatency.toFixed(0)} ms`} />
            <StatPill label="Avg health" value={averageHealth === null ? "--" : `${averageHealth.toFixed(1)}%`} />
            <StatPill label="Avg latency" value={averageLatency === null ? "--" : `${averageLatency.toFixed(0)} ms`} />
          </>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full overflow-visible rounded-md"
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
      >
        <defs>
          <linearGradient id="healthArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.36)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
          </linearGradient>
          <linearGradient id="latencyArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(244,114,182,0.28)" />
            <stop offset="100%" stopColor="rgba(244,114,182,0.02)" />
          </linearGradient>
        </defs>

        {activeMetric === "health" ? (
          <>
            <rect x={padX} y={padY} width={plotWidth} height={Math.max(0, scaleY(99, yMin, 100) - padY)} fill="rgba(16,185,129,0.08)" />
            <rect x={padX} y={scaleY(95, yMin, 100)} width={plotWidth} height={Math.max(0, scaleY(99, yMin, 100) - scaleY(95, yMin, 100))} fill="rgba(245,158,11,0.08)" />
            <rect x={padX} y={scaleY(yMin, yMin, 100)} width={plotWidth} height={Math.max(0, scaleY(95, yMin, 100) - scaleY(yMin, yMin, 100))} fill="rgba(244,63,94,0.08)" />
            <line x1={padX} y1={scaleY(99.9, yMin, 100)} x2={width - padX} y2={scaleY(99.9, yMin, 100)} stroke="rgba(16,185,129,0.55)" strokeDasharray="6 6" />
          </>
        ) : activeMetric === "latency" ? (
          <>
            <rect x={padX} y={scaleY(0, 0, yMax)} width={plotWidth} height={Math.max(0, scaleY(200, 0, yMax) - scaleY(0, 0, yMax))} fill="rgba(16,185,129,0.08)" />
            <rect x={padX} y={scaleY(200, 0, yMax)} width={plotWidth} height={Math.max(0, scaleY(500, 0, yMax) - scaleY(200, 0, yMax))} fill="rgba(245,158,11,0.08)" />
            <rect x={padX} y={scaleY(500, 0, yMax)} width={plotWidth} height={Math.max(0, scaleY(yMax, 0, yMax) - scaleY(500, 0, yMax))} fill="rgba(244,63,94,0.08)" />
            <line x1={padX} y1={scaleY(300, 0, yMax)} x2={width - padX} y2={scaleY(300, 0, yMax)} stroke="rgba(244,114,182,0.55)" strokeDasharray="6 6" />
          </>
        ) : null}

        {yTicks.map((line, index) => {
          const y = activeMetric === "latency" ? scaleY(line, 0, yMax) : scaleY(line, yMin, 100);
          return (
            <g key={`y-${activeMetric}-${line}-${index}`}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="rgba(148,163,184,0.25)" strokeDasharray="3 4" />
              <text x={4} y={y + 3} fill="rgba(148,163,184,0.7)" fontSize="10">{activeMetric === "latency" ? `${line}ms` : `${line}%`}</text>
            </g>
          );
        })}

        {activeMetric === "compare" && latencyTicks.map((line, index) => {
          const y = scaleY(line, 0, yMaxLatency);
          return (
            <text key={`lat-${line}-${index}`} x={width - padX + 4} y={y + 3} fill="rgba(244,114,182,0.7)" fontSize="10">
              {line}ms
            </text>
          );
        })}

        {segments.map((segment, index) => {
          const d = smoothPath(segment);

          const areaD = `${d} L ${segment[segment.length - 1].x} ${height - padY} L ${segment[0].x} ${height - padY} Z`;

          return (
            <g key={index}>
              <path d={areaD} fill={activeMetric === "latency" ? "url(#latencyArea)" : "url(#healthArea)"} />
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "all 420ms ease" }}
              />
            </g>
          );
        })}

        {metric === "compare" && compareSegments.map((segment, index) => {
          const d = smoothPath(segment);

          const areaD = `${d} L ${segment[segment.length - 1].x} ${height - padY} L ${segment[0].x} ${height - padY} Z`;

          return (
            <g key={`compare-${index}`}>
              <path d={areaD} fill={compareArea} />
              <path
                d={d}
                fill="none"
                stroke={compareStroke}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transition: "all 420ms ease" }}
              />
            </g>
          );
        })}

        {metric !== "compare" && smoothedPoints.length > 1 ? (
          <path
            d={smoothPath(smoothedPoints)}
            fill="none"
            stroke="rgba(226,232,240,0.88)"
            strokeDasharray="5 5"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {metric !== "compare" && anomalyIndices.map((idx) => {
          const point = activePoints[idx];
          if (!point || point.y === null) return null;
          return (
            <g key={`anomaly-${idx}`}>
              <circle cx={point.x} cy={point.y} r={6} fill="rgba(244,63,94,0.25)" />
              <circle cx={point.x} cy={point.y} r={2.6} fill="rgba(244,63,94,0.95)" />
            </g>
          );
        })}

        {activeX !== null ? (
          <line
            x1={activeX}
            y1={padY}
            x2={activeX}
            y2={height - padY}
            stroke="rgba(148,163,184,0.5)"
            strokeDasharray="4 4"
          />
        ) : null}

        {activeX !== null && activeHealthY !== null ? (
          <circle cx={activeX} cy={activeHealthY} r={4} fill="rgba(34,211,238,1)" stroke="rgba(8,47,73,1)" strokeWidth="2" />
        ) : null}

        {activeMetric === "compare" && activeX !== null && activeLatencyY !== null ? (
          <circle cx={activeX} cy={activeLatencyY} r={4} fill="rgba(244,114,182,1)" stroke="rgba(79,7,36,1)" strokeWidth="2" />
        ) : null}

        {(() => {
          const lastPoint = [...activePoints].reverse().find((point) => point.y !== null);
          if (!lastPoint || lastPoint.y === null) return null;
          return (
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={4.5}
              fill={stroke}
              stroke="rgba(8,47,73,1)"
              strokeWidth="2"
            />
          );
        })()}

        {activeX !== null && tooltipLabel ? (
          <g transform={`translate(${Math.min(Math.max(activeX - 82, padX), width - 180)}, ${padY + 6})`}>
            <rect width="170" height={activeMetric === "compare" ? 62 : 48} rx="8" fill="rgba(2,6,23,0.9)" stroke="rgba(148,163,184,0.35)" />
            <text x="10" y="14" fill="rgba(226,232,240,0.95)" fontSize="10">{tooltipLabel}</text>
            {active ? (
              activeMetric === "compare" ? (
                <>
                  <text x="10" y="30" fill="rgba(34,211,238,0.95)" fontSize="10">H: {active.health === null ? "--" : `${active.health.toFixed(1)}%`}</text>
                  <text x="10" y="44" fill="rgba(244,114,182,0.95)" fontSize="10">L: {active.latency === null ? "--" : `${active.latency.toFixed(0)} ms`}</text>
                  <text x="10" y="56" fill="rgba(148,163,184,0.95)" fontSize="10">Dual-axis mode</text>
                </>
              ) : (
                <>
                  <text x="10" y="30" fill="rgba(226,232,240,0.95)" fontSize="10">
                    {activeMetric === "health"
                      ? `Health: ${active.health === null ? "--" : `${active.health.toFixed(1)}%`}`
                      : `Latency: ${active.latency === null ? "--" : `${active.latency.toFixed(0)} ms`}`}
                  </text>
                  <text x="10" y="42" fill="rgba(148,163,184,0.9)" fontSize="10">EMA overlay enabled</text>
                </>
              )
            ) : null}
          </g>
        ) : null}
      </svg>

      <p className="mt-2 text-[11px] text-slate-400">
        {activeMetric === "health"
          ? "Bands: healthy ≥99%, warning 95-99%, critical <95%. Dashed white line = EMA trend."
          : activeMetric === "latency"
            ? "Bands: fast <200ms, elevated 200-500ms, high >500ms. Dashed white line = EMA trend."
            : "Compare overlays health and latency with independent scales for realistic correlation checks."}
      </p>
    </div>
  );
}

function StatPill({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  const toneClass = tone === "good"
    ? "text-emerald-200"
    : tone === "warn"
      ? "text-amber-200"
      : "text-slate-100";

  return (
    <div className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xs font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function WebsiteCard({
  website,
  onAcknowledge,
  onDeleteWebsite,
  analytics,
  onLoadAnalytics,
  onAddIntegration,
  onAddAlertRoute,
  onSendTestAlert,
  onAddOnCall,
  deliveries,
  onLoadDeliveries,
  onRetryDelivery,
  onAddComponent,
  onToggleStatusPageVisibility,
}: {
  website: ProcessedWebsite;
  onAcknowledge: (incidentId: string) => Promise<void>;
  onDeleteWebsite: (websiteId: string) => Promise<void>;
  analytics?: WebsiteAnalytics;
  onLoadAnalytics: (websiteId: string) => Promise<void>;
  onAddIntegration: (websiteId: string) => Promise<void>;
  onAddAlertRoute: (websiteId: string) => Promise<void>;
  onSendTestAlert: (websiteId: string) => Promise<void>;
  onAddOnCall: (websiteId: string) => Promise<void>;
  deliveries: AlertDeliveryRow[];
  onLoadDeliveries: (websiteId: string) => Promise<void>;
  onRetryDelivery: (deliveryId: string, websiteId: string) => Promise<void>;
  onAddComponent: (websiteId: string) => Promise<void>;
  onToggleStatusPageVisibility: (websiteId: string, makePublic: boolean) => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const openIncident = website.incidents.find((incident) => incident.status === "OPEN");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-400/30 hover:bg-white/10">
      <div
        role="button"
        tabIndex={0}
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsExpanded((previous) => !previous);
          }
        }}
      >
        <div className="flex items-center gap-4">
          <StatusCircle status={website.status} />
          <div>
            <h3 className="select-text text-sm font-semibold text-white">{website.url}</h3>
            <p className="text-xs text-slate-400">Last checked {website.lastChecked}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={(event) => {
              event.stopPropagation();
              void onDeleteWebsite(website.id);
            }}
            className="rounded-full border border-rose-400/40 px-3 py-1 text-[11px] font-semibold text-rose-200 hover:border-rose-300"
          >
            Remove
          </button>
          <span className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">
            {website.uptimePercentage.toFixed(1)}% uptime
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Last 30 minutes status</p>
          <UptimeTicks ticks={website.uptimeTicks} />
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <AdvancedLiveGraph
              series={website.minuteHealth}
              lockedMetric="health"
              title="Health trend"
            />
            <AdvancedLiveGraph
              series={website.minuteHealth}
              lockedMetric="latency"
              title="Latency trend"
            />
          </div>

          <div className="mt-4 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
            <p>Cooldown: <span className="font-semibold text-white">{website.cooldownMinutes}m</span></p>
            <p>Retries: <span className="font-semibold text-white">{website.retries}</span></p>
            <p>Quorum: <span className="font-semibold text-white">{website.quorum}</span></p>
            <p>Validators/round: <span className="font-semibold text-white">{website.validatorsPerRound}</span></p>
            <p>Escalation: <span className="font-semibold text-white">{website.escalationMinutes}m</span></p>
            <p>Check type: <span className="font-semibold text-white">{website.checkType}</span></p>
            <p>SLO target: <span className="font-semibold text-white">{website.sloTarget.toFixed(2)}%</span></p>
            <p>Team: <span className="font-semibold text-white">{website.teamName}</span></p>
            <p>
              Status page:{" "}
              {website.statusPageSlug && website.statusPagePublic ? (
                <a
                  href={`/status/${website.statusPageSlug}`}
                  target="_blank"
                  className="font-semibold text-cyan-300 hover:text-cyan-200"
                  rel="noreferrer"
                >
                  /status/{website.statusPageSlug}
                </a>
              ) : website.statusPageSlug ? (
                <span className="font-semibold text-amber-300">private</span>
              ) : (
                <span className="font-semibold text-slate-500">not configured</span>
              )}
            </p>
            {website.statusPageSlug ? (
              <p>
                Visibility:{" "}
                <button
                  onClick={() => onToggleStatusPageVisibility(website.id, !website.statusPagePublic)}
                  className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-semibold hover:border-cyan-300"
                >
                  {website.statusPagePublic ? "Make private" : "Make public"}
                </button>
              </p>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Incident timeline</p>
            {website.incidents.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No incidents recorded yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {website.incidents.slice(0, 2).map((incident) => (
                  <div key={incident.id} className="rounded-lg border border-white/10 bg-slate-950/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${incident.status === "OPEN" ? "text-rose-300" : "text-emerald-300"}`}>
                        {incident.status}
                      </span>
                      {incident.status === "OPEN" && !incident.acknowledgedAt ? (
                        <button
                          onClick={() => onAcknowledge(incident.id)}
                          className="rounded-full border border-cyan-400/50 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:border-cyan-300"
                        >
                          Acknowledge
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">Started: {new Date(incident.startedAt).toLocaleString()}</p>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                      {incident.events.slice(0, 3).map((event) => (
                        <li key={event.id}>• {event.type}: {event.message}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {openIncident?.escalatedAt ? (
              <p className="mt-2 text-xs text-amber-300">Escalated at {new Date(openIncident.escalatedAt).toLocaleTimeString()}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Alerting setup</p>
              <div className="flex gap-2">
                <button onClick={() => onAddIntegration(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Add integration</button>
                <button onClick={() => onAddAlertRoute(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Add route</button>
                <button onClick={() => onSendTestAlert(website.id)} className="rounded-full border border-emerald-400/30 px-3 py-1 text-[11px] text-emerald-200 hover:border-emerald-300">Send test alert</button>
                <button onClick={() => onAddOnCall(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Add on-call</button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-300">Routes: {website.alertRoutes.length} • Integrations: {website.integrations.length} • Schedules: {website.onCallSchedules.length}</p>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Component-based monitoring</p>
              <button onClick={() => onAddComponent(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Add component</button>
            </div>
            {website.components.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No components configured yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {website.components.map((component) => {
                  const latestTick = component.ticks[0];
                  const isGood = latestTick?.status === "Good";
                  return (
                    <div key={component.id} className="rounded-md border border-white/10 bg-slate-950/70 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-white">{component.name}</span>
                        <span className={isGood ? "text-emerald-300" : latestTick ? "text-rose-300" : "text-slate-400"}>
                          {latestTick ? latestTick.status : "Unknown"}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-400">{component.targetUrl ?? component.path ?? "/"} • {component.checkType}</p>
                      {latestTick ? (
                        <p className="mt-1 text-slate-300">Latency {latestTick.latency.toFixed(0)} ms • {new Date(latestTick.createdAt).toLocaleTimeString()}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Alert delivery center</p>
              <button onClick={() => onLoadDeliveries(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Refresh deliveries</button>
            </div>
            {deliveries.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No deliveries yet. Send a test alert to populate this list.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {deliveries.slice(0, 8).map((delivery) => (
                  <div key={delivery.id} className="rounded-md border border-white/10 bg-slate-950/70 p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{delivery.notificationKind} • {delivery.channelType}</span>
                      <span className={delivery.status === "sent" ? "text-emerald-300" : delivery.status === "failed" ? "text-rose-300" : "text-amber-300"}>{delivery.status}</span>
                    </div>
                    <p className="mt-1 text-slate-300">{delivery.destination}</p>
                    <p className="mt-1 text-slate-400">Attempts {delivery.attempts}/{delivery.maxAttempts} • {new Date(delivery.createdAt).toLocaleString()}</p>
                    {delivery.lastError ? <p className="mt-1 text-rose-300">{delivery.lastError}</p> : null}
                    {delivery.status !== "sent" ? (
                      <button
                        onClick={() => onRetryDelivery(delivery.id, website.id)}
                        className="mt-2 rounded-full border border-amber-300/40 px-3 py-1 text-[11px] text-amber-200 hover:border-amber-300"
                      >
                        Retry now
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Reliability analytics</p>
              <button onClick={() => onLoadAnalytics(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Refresh analytics</button>
            </div>
            {analytics ? (
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 text-slate-200">
                <p>SLI/SLO: <span className="font-semibold">{analytics.sli.toFixed(2)}% / {analytics.sloTarget.toFixed(2)}%</span></p>
                <p>Error budget remaining: <span className="font-semibold">{analytics.errorBudgetRemaining.toFixed(2)}%</span></p>
                <p>P50/P95/P99: <span className="font-semibold">{analytics.latency.p50.toFixed(0)} / {analytics.latency.p95.toFixed(0)} / {analytics.latency.p99.toFixed(0)} ms</span></p>
                <p>MTTA / MTTR: <span className="font-semibold">{(analytics.mttaMs / 60000).toFixed(2)} / {(analytics.mttrMs / 60000).toFixed(2)} min</span></p>
                <div className="md:col-span-2">
                  <p className="text-slate-400">Regional heatmap</p>
                  <ul className="mt-1 space-y-1">
                    {analytics.regionalHeatmap.slice(0, 5).map((region) => (
                      <li key={region.region}>• {region.region}: {region.errorRate.toFixed(2)}% errors ({region.total} checks)</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No analytics loaded yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const {websites, refreshWebsites} = useWebsites();
  const { getToken } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [analyticsByWebsite, setAnalyticsByWebsite] = useState<Record<string, WebsiteAnalytics>>({});
  const [deliveriesByWebsite, setDeliveriesByWebsite] = useState<Record<string, AlertDeliveryRow[]>>({});

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const processedWebsites = useMemo(() => {
    return websites.map(website => {
      // Sort ticks by creation time
      const sortedTicks = [...website.ticks].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Get the most recent 30 minutes of ticks
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const recentTicks = sortedTicks.filter(tick => 
        new Date(tick.createdAt) > thirtyMinutesAgo
      );

      // Aggregate ticks into 3-minute windows (10 windows total)
      const windows: UptimeStatus[] = [];

      for (let i = 0; i < 10; i++) {
        const windowStart = new Date(Date.now() - (i + 1) * 3 * 60 * 1000);
        const windowEnd = new Date(Date.now() - i * 3 * 60 * 1000);
        
        const windowTicks = recentTicks.filter(tick => {
          const tickTime = new Date(tick.createdAt);
          return tickTime >= windowStart && tickTime < windowEnd;
        });

        // Window is considered up if majority of ticks are up
        const upTicks = windowTicks.filter(tick => tick.status === 'Good').length;
        windows[9 - i] = windowTicks.length === 0 ? "unknown" : (upTicks / windowTicks.length) >= 0.5 ? "good" : "bad";
      }

      // Calculate overall status and uptime percentage
      const totalTicks = sortedTicks.length;
      const upTicks = sortedTicks.filter(tick => tick.status === 'Good').length;
      const uptimePercentage = totalTicks === 0 ? 100 : (upTicks / totalTicks) * 100;

      // Build minute-wise telemetry graph points (last 120 minutes)
      const now = new Date();
      const currentMinute = new Date(now);
      currentMinute.setSeconds(0, 0);
      const minuteHealth = Array.from({ length: 120 }).map((_, idx) => {
        const minuteStart = new Date(currentMinute.getTime() - (119 - idx) * 60 * 1000);
        const minuteEnd = new Date(minuteStart.getTime() + 60 * 1000);

        const ticksInMinute = sortedTicks.filter((tick) => {
          const tickTime = new Date(tick.createdAt);
          return tickTime >= minuteStart && tickTime < minuteEnd;
        });

        if (ticksInMinute.length === 0) {
          return {
            timestamp: minuteStart,
            health: null,
            latency: null,
          };
        }

        const goodInMinute = ticksInMinute.filter((tick) => tick.status === 'Good').length;
        const avgLatency = ticksInMinute.reduce((sum, tick) => sum + tick.latency, 0) / ticksInMinute.length;
        return {
          timestamp: minuteStart,
          health: (goodInMinute / ticksInMinute.length) * 100,
          latency: avgLatency,
        };
      });

      // Get the most recent status
      const currentStatus = windows[windows.length - 1];

      // Format the last checked time
      const lastChecked = sortedTicks[0]
        ? new Date(sortedTicks[0].createdAt).toLocaleTimeString()
        : 'Never';

      return {
        id: website.id,
        url: website.url,
        status: currentStatus,
        uptimePercentage,
        lastChecked,
        uptimeTicks: windows,
        minuteHealth,
        cooldownMinutes: website.cooldownMinutes,
        retries: website.retries,
        quorum: website.quorum,
        validatorsPerRound: website.validatorsPerRound,
        escalationMinutes: website.escalationMinutes,
        statusPageSlug: website.statusPageSlug,
        statusPagePublic: website.statusPagePublic,
        checkType: website.checkType,
        sloTarget: website.sloTarget,
        teamName: website.teamName,
        incidents: website.incidents,
        alertRoutes: website.alertRoutes,
        integrations: website.integrations,
        onCallSchedules: website.onCallSchedules,
        components: website.components,
      };
    });
  }, [websites]);

  // Theme is handled globally via ThemeProvider; no manual class toggling here.

  if (!mounted) {
    return null;
  }

  const totalMonitors = processedWebsites.length;
  const upMonitors = processedWebsites.filter((website) => website.status === "good").length;
  const downMonitors = processedWebsites.filter((website) => website.status === "bad").length;
  const averageUptime = totalMonitors === 0
    ? 100
    : processedWebsites.reduce((sum, website) => sum + website.uptimePercentage, 0) / totalMonitors;
  const filteredWebsites = processedWebsites.filter((website) =>
    website.url.toLowerCase().includes(query.toLowerCase())
  );

  const acknowledgeIncident = async (incidentId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.post(`${API_BACKEND_URL}/api/v1/incidents/${incidentId}/ack`, {}, { headers });
    await refreshWebsites();
  };

  const deleteWebsite = async (websiteId: string) => {
    const shouldDelete = window.confirm("Remove this monitor URL? This will disable it from active monitoring.");
    if (!shouldDelete) return;

    const token = await getToken();
    const headers = token ? { Authorization: token } : {};

    try {
      await axios.delete(`${API_BACKEND_URL}/api/v1/website/`, {
        headers,
        data: { websiteId },
      });
      await refreshWebsites();
      window.alert("Monitor removed successfully.");
    } catch (error) {
      window.alert(`Failed to remove monitor: ${parseApiError(error)}`);
    }
  };

  const loadAnalytics = async (websiteId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    const response = await axios.get(`${API_BACKEND_URL}/api/v1/website/${websiteId}/analytics`, { headers });
    setAnalyticsByWebsite((previous) => ({ ...previous, [websiteId]: response.data.analytics }));
  };

  const parseApiError = (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const apiMessage = error.response?.data?.error;
      if (typeof apiMessage === "string" && apiMessage.trim()) {
        return apiMessage;
      }
      if (error.message) {
        return error.message;
      }
    }
    return "Request failed. Please verify type/endpoint and try again.";
  };

  const normalizeChannel = (input: string) => input.trim().toUpperCase();

  const validateIntegrationEndpoint = (type: string, endpoint: string) => {
    if (type === "EMAIL") {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endpoint);
    }
    if (type === "SMS") {
      return /^\+[1-9]\d{6,14}$/.test(endpoint);
    }
    return true;
  };

  const addIntegration = async (websiteId: string) => {
    const typeInput = window.prompt("Integration type: EMAIL, SMS, or WEBHOOK", "EMAIL");
    if (!typeInput) return;
    const type = normalizeChannel(typeInput);
    if (!["EMAIL", "SMS", "WEBHOOK"].includes(type)) {
      window.alert("Unsupported integration type. Use EMAIL, SMS, or WEBHOOK.");
      return;
    }

    const endpointPrompt = type === "EMAIL"
      ? "Destination email"
      : type === "SMS"
        ? "Destination phone number (E.164, e.g. +15551234567)"
        : "Webhook URL";

    const endpoint = window.prompt(endpointPrompt);
    if (!endpoint) return;

    if (!validateIntegrationEndpoint(type, endpoint)) {
      window.alert(
        type === "EMAIL"
          ? "Please enter a valid email address."
          : "Please enter a valid E.164 phone number (e.g. +15551234567)."
      );
      return;
    }

    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    try {
      await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/integrations`, { type, endpoint }, { headers });
      await refreshWebsites();
    } catch (error) {
      window.alert(`Failed to add integration: ${parseApiError(error)}`);
    }
  };

  const addAlertRoute = async (websiteId: string) => {
    const targetTeam = window.prompt("Route target team", "platform");
    if (!targetTeam) return;

    const channelInput = window.prompt("Route channel: EMAIL, SMS, or WEBHOOK", "EMAIL");
    if (!channelInput) return;
    const channel = normalizeChannel(channelInput);
    if (!["EMAIL", "SMS", "WEBHOOK"].includes(channel)) {
      window.alert("Unsupported route channel. Use EMAIL, SMS, or WEBHOOK.");
      return;
    }

    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    try {
      await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/alert-routes`, { targetTeam, minSeverity: "P2", channel }, { headers });
      await refreshWebsites();
    } catch (error) {
      window.alert(`Failed to add route: ${parseApiError(error)}`);
    }
  };

  const addOnCall = async (websiteId: string) => {
    const rotationName = window.prompt("On-call rotation name", "primary");
    if (!rotationName) return;
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/on-call`, { rotationName, timezone: "UTC", quietHoursStart: 0, quietHoursEnd: 6 }, { headers });
    await refreshWebsites();
  };

  const sendTestAlert = async (websiteId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};

    try {
      const response = await axios.post(
        `${API_BACKEND_URL}/api/v1/website/${websiteId}/test-alert`,
        {},
        { headers }
      );

      const queued = response.data?.queued ?? 0;
      window.alert(`Test alert queued for ${queued} integration(s). It will be delivered by the hub loop shortly.`);
      await loadDeliveries(websiteId);
      await refreshWebsites();
    } catch (error) {
      window.alert(`Failed to queue test alert: ${parseApiError(error)}`);
    }
  };

  const loadDeliveries = async (websiteId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    try {
      const response = await axios.get(`${API_BACKEND_URL}/api/v1/website/${websiteId}/alert-deliveries?limit=30`, { headers });
      setDeliveriesByWebsite((previous) => ({ ...previous, [websiteId]: response.data.deliveries ?? [] }));
    } catch (error) {
      window.alert(`Failed to load deliveries: ${parseApiError(error)}`);
    }
  };

  const retryDelivery = async (deliveryId: string, websiteId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    try {
      await axios.post(`${API_BACKEND_URL}/api/v1/alert-delivery/${deliveryId}/retry`, {}, { headers });
      await loadDeliveries(websiteId);
    } catch (error) {
      window.alert(`Failed to retry delivery: ${parseApiError(error)}`);
    }
  };

  const addComponent = async (websiteId: string) => {
    const name = window.prompt("Component name", "API");
    if (!name) return;

    const path = window.prompt("Path (e.g. /api/health) or leave blank for /", "/");
    const checkTypeInput = window.prompt("Check type: HTTP, KEYWORD, DNS, TLS, or MULTI_STEP", "HTTP");
    if (!checkTypeInput) return;
    const checkType = checkTypeInput.trim().toUpperCase();

    if (!["HTTP", "KEYWORD", "DNS", "TLS", "MULTI_STEP"].includes(checkType)) {
      window.alert("Invalid check type.");
      return;
    }

    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    try {
      await axios.post(
        `${API_BACKEND_URL}/api/v1/website/${websiteId}/components`,
        {
          name,
          path: path || "/",
          checkType,
        },
        { headers }
      );
      await refreshWebsites();
    } catch (error) {
      window.alert(`Failed to add component: ${parseApiError(error)}`);
    }
  };

  const toggleStatusPageVisibility = async (websiteId: string, makePublic: boolean) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.patch(
      `${API_BACKEND_URL}/api/v1/website/${websiteId}/status-page`,
      { isPublic: makePublic },
      { headers }
    );
    await refreshWebsites();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-cyan-300">
              <Activity className="h-4 w-4" />
              Live monitoring
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Uptime command center</h1>
            <p className="mt-2 text-sm text-slate-400">Track status changes, latency, and availability in real time.</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            <Plus className="h-4 w-4" />
            Add monitor
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <DashboardStat label="Total monitors" value={totalMonitors.toString()} icon={<Globe className="h-4 w-4" />} />
          <DashboardStat label="Healthy" value={upMonitors.toString()} icon={<Activity className="h-4 w-4" />} accent="emerald" />
          <DashboardStat label="Degraded" value={downMonitors.toString()} icon={<AlertTriangle className="h-4 w-4" />} accent="rose" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Clock className="h-4 w-4" />
            Avg. uptime {averageUptime.toFixed(1)}%
          </div>
          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search monitors"
              className="w-full rounded-full border border-white/10 bg-slate-900 py-2 pl-9 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredWebsites.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center">
              <Globe className="mx-auto h-10 w-10 text-cyan-300" />
              <h2 className="mt-4 text-lg font-semibold">No monitors yet</h2>
              <p className="mt-2 text-sm text-slate-400">Add your first website to start tracking uptime and latency.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                <Plus className="h-4 w-4" />
                Add a monitor
              </button>
            </div>
          ) : (
            filteredWebsites.map((website) => (
              <WebsiteCard
                key={website.id}
                website={website}
                onAcknowledge={acknowledgeIncident}
                onDeleteWebsite={deleteWebsite}
                analytics={analyticsByWebsite[website.id]}
                onLoadAnalytics={loadAnalytics}
                onAddIntegration={addIntegration}
                onAddAlertRoute={addAlertRoute}
                onSendTestAlert={sendTestAlert}
                onAddOnCall={addOnCall}
                deliveries={deliveriesByWebsite[website.id] ?? []}
                onLoadDeliveries={loadDeliveries}
                onRetryDelivery={retryDelivery}
                onAddComponent={addComponent}
                onToggleStatusPageVisibility={toggleStatusPageVisibility}
              />
            ))
          )}
        </div>
      </div>

      <CreateWebsiteModal
        isOpen={isModalOpen}
        onClose={async (url) => {
            if (url === null) {
                setIsModalOpen(false);
                return;
            }

            setIsModalOpen(false)
            const token = await getToken();
            const headers = token ? { Authorization: token } : {};
            axios.post(`${API_BACKEND_URL}/api/v1/website`, {
              url,
            }, { headers })
            .then(() => {
              refreshWebsites();
            })
            .catch(() => {
              setIsModalOpen(true);
            })
        }}
      />
    </div>
  );
}

export default App;

function DashboardStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "emerald" | "rose";
}) {
  const accentClasses = accent === "emerald"
    ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/20"
    : accent === "rose"
      ? "text-rose-300 bg-rose-400/10 border-rose-400/20"
      : "text-cyan-300 bg-cyan-400/10 border-cyan-400/20";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${accentClasses}`}>
        {icon}
        {label}
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
    </div>
  );
}