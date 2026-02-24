"use client"
import React from 'react';
import { Activity, ArrowRight, BarChart3, Bell, Check, Globe2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

function App() {
  const router = useRouter();
  const handleDemo = () => router.push('/dashboard');
  const handleStart = () => router.push('/dashboard');
  const handleEnterprise = () => {
    window.location.href = 'mailto:sales@dpinuptime.com?subject=Enterprise%20Plan%20Inquiry';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-cyan-500/20 blur-[160px]" />
          <div className="absolute right-0 top-20 h-96 w-96 rounded-full bg-indigo-500/20 blur-[160px]" />
        </div>
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              Live status intelligence for modern infrastructure
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-tight md:text-5xl">
              Uptime monitoring built for distributed, production-grade systems.
            </h1>
            <p className="mt-4 text-lg text-slate-300">
              DPin Uptime gives you instant incident visibility, SLA-ready reports, and global probes so your team can ship without anxiety.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
              >
                Launch dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={handleDemo}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm text-white/80 transition hover:border-white/30"
              >
                View live demo
              </button>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-slate-300 md:grid-cols-3">
              <Stat label="Global PoPs" value="32" icon={<Globe2 className="h-4 w-4" />} />
              <Stat label="Median response" value="312ms" icon={<Zap className="h-4 w-4" />} />
              <Stat label="SLA coverage" value="99.99%" icon={<ShieldCheck className="h-4 w-4" />} />
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/60">Current status</p>
                <p className="text-lg font-semibold">All systems operational</p>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">Healthy</span>
            </div>
            <div className="mt-6 space-y-4">
              <StatusRow title="API Edge" region="N. Virginia" uptime="100%" latency="214ms" />
              <StatusRow title="Realtime Workers" region="Frankfurt" uptime="99.98%" latency="308ms" />
              <StatusRow title="Webhooks" region="Singapore" uptime="100%" latency="263ms" />
            </div>
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs text-white/60">Incident response</p>
              <p className="mt-2 text-sm text-white/80">
                Avg. triage time <span className="font-semibold text-white">4m 12s</span> with auto escalation.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-slate-950 pb-8">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-cyan-300">Reliability toolkit</p>
              <h2 className="text-3xl font-semibold">Everything you need to stay ahead of outages.</h2>
            </div>
            <p className="max-w-md text-sm text-slate-300">
              Unified monitoring, alerting, and analytics designed to plug into modern devops workflows.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Bell className="h-6 w-6 text-cyan-300" />}
              title="Multi-channel alerts"
              description="Route incidents to Slack, email, PagerDuty, or custom webhooks with on-call schedules."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6 text-cyan-300" />}
              title="SLA dashboards"
              description="Visualize uptime trends, latency percentiles, and incident impact across services."
            />
            <FeatureCard
              icon={<Activity className="h-6 w-6 text-cyan-300" />}
              title="Smart anomaly scoring"
              description="Automatically classify anomalies and reduce noisy alerts with intelligent baselines."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 rounded-3xl border border-white/10 bg-white/5 p-10 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm text-cyan-300">Reliability playbook</p>
            <h3 className="mt-3 text-2xl font-semibold">Coordinate your incident response in one place.</h3>
            <p className="mt-4 text-sm text-slate-300">
              Assign owners, annotate alerts, and keep stakeholders updated with a single source of truth.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-200">
              <ChecklistItem>Automated incident timelines</ChecklistItem>
              <ChecklistItem>Regional redundancy insights</ChecklistItem>
              <ChecklistItem>Post-incident learning reports</ChecklistItem>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs text-white/60">Next action</p>
            <h4 className="mt-2 text-lg font-semibold">Escalate to on-call</h4>
            <p className="mt-2 text-sm text-slate-300">Auto-resolved incidents drop by 37% with proactive handoff.</p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-4 py-2 text-xs text-cyan-200">
              Run playbook
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-950 pb-16">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-cyan-300">Pricing</p>
              <h2 className="text-3xl font-semibold">Scale reliability without surprise costs.</h2>
            </div>
            <p className="text-sm text-slate-300">Plans designed for startups, growth teams, and enterprise ops.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <PricingCard
              title="Starter"
              price="29"
              actionLabel="Start monitoring"
              onAction={handleStart}
              features={[
                "10 monitors",
                "1-minute checks",
                "Email + Slack alerts",
                "5 team members",
                "7-day data retention",
              ]}
            />
            <PricingCard
              title="Professional"
              price="79"
              featured={true}
              actionLabel="Start monitoring"
              onAction={handleStart}
              features={[
                "50 monitors",
                "30-second checks",
                "All alert channels",
                "Unlimited team members",
                "30-day data retention",
                "API & integrations",
              ]}
            />
            <PricingCard
              title="Enterprise"
              price="199"
              actionLabel="Contact sales"
              onAction={handleEnterprise}
              features={[
                "Unlimited monitors",
                "15-second checks",
                "Dedicated success",
                "Custom SLAs",
                "90-day data retention",
                "Priority support",
              ]}
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-cyan-300" />
                <span className="text-lg font-semibold">DPin Uptime</span>
              </div>
              <p className="mt-3 text-sm text-slate-400">Always-on visibility for modern digital products.</p>
            </div>
            <FooterColumn title="Product" items={["Features", "Pricing", "Integrations", "Changelog"]} />
            <FooterColumn title="Company" items={["About", "Careers", "Blog", "Press"]} />
            <FooterColumn title="Trust" items={["Security", "Status", "Compliance", "Terms"]} />
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-500">
            © 2026 DPin Uptime. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-cyan-400/40 hover:bg-white/10">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-300">{description}</p>
    </div>
  );
}

interface PricingCardProps {
  title: string;
  price: string;
  features: string[];
  featured?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

function PricingCard({ title, price, features, featured = false, actionLabel = "Get started", onAction }: PricingCardProps) {
  return (
    <div className={`rounded-3xl border px-8 py-10 ${
      featured
        ? 'border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-indigo-500/20'
        : 'border-white/10 bg-white/5'
    }`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {featured ? <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-200">Most popular</span> : null}
      </div>
      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-white">${price}</span>
        <span className="text-sm text-slate-300">/month</span>
      </div>
      <ul className="mt-6 space-y-3 text-sm text-slate-200">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 text-cyan-300" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onAction}
        className={`mt-8 w-full rounded-full py-3 text-sm font-semibold transition ${
          featured
            ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
            : 'border border-white/15 text-white hover:border-white/30'
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-200">
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function StatusRow({ title, region, uptime, latency }: { title: string; region: string; uptime: string; latency: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-400">{region}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-emerald-300">{uptime} uptime</p>
        <p className="text-xs text-slate-400">{latency} latency</p>
      </div>
    </div>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Check className="h-4 w-4 text-cyan-300" />
      <span>{children}</span>
    </div>
  );
}

function FooterColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-400">
        {items.map((item) => (
          <li key={item}>
            <a className="transition hover:text-white" href="#">
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;