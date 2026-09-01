import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { Shell } from "./components/Shell";
import { Catalog } from "./pages/Catalog";
import { Connect } from "./pages/Connect";
import { Engagements } from "./pages/Engagements";
import { Findings } from "./pages/Findings";
import { Glossary } from "./pages/Glossary";
import { Guided } from "./pages/Guided";
import { Overview } from "./pages/Overview";
import { Report } from "./pages/Report";
import { Rollback } from "./pages/Rollback";
import { Run } from "./pages/Run";
import { Vault } from "./pages/Vault";
import type { CatalogResponse, DoctorResponse, Engagement, GuideResponse, HealthResponse } from "./types";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [guide, setGuide] = useState<GuideResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSeededRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextDoctor, nextGuide, nextCatalog, nextEngagements] = await Promise.all([
        api.health(), api.doctor(), api.guide(), api.catalog(), api.engagements(),
      ]);
      setHealth(nextHealth); setDoctor(nextDoctor); setGuide(nextGuide); setCatalog(nextCatalog);
      setEngagements(nextEngagements.engagements);
      setCurrentId((current) => current ?? nextEngagements.engagements[0]?.id ?? null);
      setError(null);
      setLoaded(true);
    } catch (err) {
      // Leave `loaded` false on the first failure so the retry screen shows;
      // a later transient failure keeps the already-rendered console up.
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Zero-friction start: if nothing exists yet, seed the offline demo once so no page is empty.
  useEffect(() => {
    if (loaded && !autoSeededRef.current && engagements.length === 0) {
      autoSeededRef.current = true;
      void seedDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, engagements.length]);

  const current = useMemo(
    () => engagements.find((item) => item.id === currentId) ?? engagements[0] ?? null,
    [engagements, currentId],
  );

  function upsertEngagement(engagement: Engagement) {
    setEngagements((items) => [engagement, ...items.filter((item) => item.id !== engagement.id)]);
    setCurrentId(engagement.id);
  }

  async function createEngagement(body: { name: string; domain: string; dc: string; notes: string }) {
    const created = await api.createEngagement(body);
    upsertEngagement(created.engagement);
    await refresh();
  }

  async function seedDemo() {
    try {
      const created = await api.demoEngagement();
      upsertEngagement(created.engagement);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const mark = useCallback(async (stepId: string) => {
    if (current) await api.markGuided(current.id, stepId);
    await refresh();
  }, [current, refresh]);

  async function handleConnected(engagement: Engagement) {
    upsertEngagement(engagement);
    await refresh();
  }

  async function handleRan(engagement: Engagement) {
    upsertEngagement(engagement);
    await refresh();
  }

  if (!loaded && error) {
    return <Fatal message={error} onRetry={() => void refresh()} />;
  }
  if (!loaded) {
    return <Splash />;
  }

  return (
    <Routes>
      <Route element={<Shell health={health} />}>
        <Route path="/" element={<Overview health={health} doctor={doctor} guide={guide} engagement={current} onSeedDemo={seedDemo} />} />
        <Route path="/guided" element={<Guided guide={guide} engagement={current} onDemo={() => void seedDemo()} onMark={(id) => void mark(id)} />} />
        <Route path="/catalog" element={<Catalog catalog={catalog} onViewGreen={() => void mark("green-catalog")} />} />
        <Route path="/glossary" element={<Glossary onSeen={() => void mark("glossary")} />} />
        <Route path="/engagements" element={<Engagements items={engagements} currentId={current?.id ?? null} onCreate={createEngagement} onDemo={() => void seedDemo()} onSelect={setCurrentId} />} />
        <Route path="/connect" element={<Connect engagement={current} onConnected={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/run" element={<Run engagement={current} catalog={catalog?.capabilities ?? []} onRan={(item) => void handleRan(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/findings" element={<Findings engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/vault" element={<Vault engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/rollback" element={<Rollback engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/report" element={<Report engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Splash() {
  return (
    <div className="splash">
      <div className="splash-mark">AD</div>
      <div className="brand-name">Assassin</div>
      <div className="muted">Starting console…</div>
    </div>
  );
}

function Fatal({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="fatal">
      <div className="fatal-card">
        <div className="splash-mark">AD</div>
        <h1>Cannot reach the console</h1>
        <p className="muted">
          The page loaded but could not reach the local API. The server may still be starting, or it
          stopped. Make sure <span className="mono">adassassin</span> is running in your terminal,
          then retry.
        </p>
        <pre className="log">{message}</pre>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
