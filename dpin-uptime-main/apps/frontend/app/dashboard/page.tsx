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
    channel: "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
  }[];
  integrations: {
    id: string;
    type: "WEBHOOK" | "SLACK" | "DISCORD" | "TEAMS" | "PAGERDUTY" | "OPSGENIE";
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

function WebsiteCard({
  website,
  onAcknowledge,
  analytics,
  onLoadAnalytics,
  onAddIntegration,
  onAddAlertRoute,
  onAddOnCall,
}: {
  website: ProcessedWebsite;
  onAcknowledge: (incidentId: string) => Promise<void>;
  analytics?: WebsiteAnalytics;
  onLoadAnalytics: (websiteId: string) => Promise<void>;
  onAddIntegration: (websiteId: string) => Promise<void>;
  onAddAlertRoute: (websiteId: string) => Promise<void>;
  onAddOnCall: (websiteId: string) => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const openIncident = website.incidents.find((incident) => incident.status === "OPEN");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-400/30 hover:bg-white/10">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <StatusCircle status={website.status} />
          <div>
            <h3 className="select-text text-sm font-semibold text-white">{website.url}</h3>
            <p className="text-xs text-slate-400">Last checked {website.lastChecked}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="rounded-full border border-white/10 bg-slate-900/60 px-3 py-1 text-xs text-slate-200">
            {website.uptimePercentage.toFixed(1)}% uptime
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Last 30 minutes status</p>
          <UptimeTicks ticks={website.uptimeTicks} />

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
              {website.statusPageSlug ? (
                <a
                  href={`/status/${website.statusPageSlug}`}
                  target="_blank"
                  className="font-semibold text-cyan-300 hover:text-cyan-200"
                  rel="noreferrer"
                >
                  /status/{website.statusPageSlug}
                </a>
              ) : (
                <span className="font-semibold text-slate-500">not configured</span>
              )}
            </p>
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
                <button onClick={() => onAddOnCall(website.id)} className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:border-cyan-300">Add on-call</button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-300">Routes: {website.alertRoutes.length} • Integrations: {website.integrations.length} • Schedules: {website.onCallSchedules.length}</p>
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

  const loadAnalytics = async (websiteId: string) => {
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    const response = await axios.get(`${API_BACKEND_URL}/api/v1/website/${websiteId}/analytics`, { headers });
    setAnalyticsByWebsite((previous) => ({ ...previous, [websiteId]: response.data.analytics }));
  };

  const addIntegration = async (websiteId: string) => {
    const endpoint = window.prompt("Integration endpoint URL");
    if (!endpoint) return;
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/integrations`, { type: "WEBHOOK", endpoint }, { headers });
    await refreshWebsites();
  };

  const addAlertRoute = async (websiteId: string) => {
    const targetTeam = window.prompt("Route target team", "platform");
    if (!targetTeam) return;
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/alert-routes`, { targetTeam, minSeverity: "P2", channel: "WEBHOOK" }, { headers });
    await refreshWebsites();
  };

  const addOnCall = async (websiteId: string) => {
    const rotationName = window.prompt("On-call rotation name", "primary");
    if (!rotationName) return;
    const token = await getToken();
    const headers = token ? { Authorization: token } : {};
    await axios.post(`${API_BACKEND_URL}/api/v1/website/${websiteId}/on-call`, { rotationName, timezone: "UTC", quietHoursStart: 0, quietHoursEnd: 6 }, { headers });
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
                analytics={analyticsByWebsite[website.id]}
                onLoadAnalytics={loadAnalytics}
                onAddIntegration={addIntegration}
                onAddAlertRoute={addAlertRoute}
                onAddOnCall={addOnCall}
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