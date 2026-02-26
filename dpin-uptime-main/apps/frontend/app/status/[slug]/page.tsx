import { API_BACKEND_URL } from "@/config";

async function getStatusPage(slug: string) {
  const response = await fetch(`${API_BACKEND_URL}/api/v1/status/${slug}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export default async function StatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStatusPage(slug);

  if (!data?.statusPage) {
    return (
      <div className="min-h-screen bg-slate-950 px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-8">
          <h1 className="text-2xl font-semibold">Status page unavailable</h1>
          <p className="mt-3 text-sm text-slate-300">This status page does not exist or is private.</p>
        </div>
      </div>
    );
  }

  const statusPage = data.statusPage;

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-semibold">{statusPage.title}</h1>
          <p className="mt-2 text-sm text-slate-300">{statusPage.url}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-sm">
            <span
              className={`h-2.5 w-2.5 rounded-full ${statusPage.currentStatus === "Good" ? "bg-emerald-400" : "bg-rose-400"}`}
            />
            Current status: {statusPage.currentStatus}
            {statusPage.currentLatency ? ` • ${Math.round(statusPage.currentLatency)}ms` : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold">Incident timeline</h2>
          {statusPage.timeline?.length ? (
            <ul className="mt-4 space-y-2 text-sm text-slate-200">
              {statusPage.timeline.slice(0, 30).map((event: { id: string; createdAt: string; type: string; message: string }) => (
                <li key={event.id} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()} • {event.type}</p>
                  <p className="mt-1">{event.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No incidents yet. Everything looks calm ✨</p>
          )}
        </div>
      </div>
    </div>
  );
}
