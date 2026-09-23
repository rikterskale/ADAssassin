import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { Shell } from "./components/Shell";
import { ToastProvider, useToast } from "./components/Toasts";
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
import { StartHere } from "./pages/StartHere";
import { Vault } from "./pages/Vault";
import {
  readCurrentEngagement,
  readOnboardingSeen,
  writeCurrentEngagement,
  writeOnboardingSeen,
} from "./storage";
import type { CatalogResponse, DoctorResponse, Engagement, GuideResponse, HealthResponse } from "./types";

type GuideState = { engagementId: string | null } & (
  | { status: "loading" }
  | { status: "ready"; data: GuideResponse }
  | { status: "unavailable"; message: string }
);

export default function App() {
  return (
    <ToastProvider>
      <Console />
    </ToastProvider>
  );
}

function Console() {
  const notify = useToast();
  const location = useLocation();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [guideState, setGuideState] = useState<GuideState>({ engagementId: null, status: "loading" });
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSeededRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);
  const guideRequestRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const [firstRun, setFirstRun] = useState(() => !readOnboardingSeen());

  const loadGuide = useCallback(async (engagementId: string | null) => {
    const request = ++guideRequestRef.current;
    const isCurrent = () => request === guideRequestRef.current && engagementId === currentIdRef.current;
    setGuideState({ engagementId, status: "loading" });
    try {
      const data = await api.guide(engagementId);
      if (!isCurrent()) return false;
      if (!data.ok || (data.engagement_id !== undefined && data.engagement_id !== engagementId)) {
        throw new Error("The guide response does not match the selected workspace. Retry guided progress.");
      }
      setGuideState({ engagementId, status: "ready", data });
      return true;
    } catch (err) {
      if (isCurrent()) {
        setGuideState({ engagementId, status: "unavailable", message: err instanceof Error ? err.message : String(err) });
      }
      return false;
    }
  }, []);

  const selectEngagement = useCallback((id: string) => {
    // Update the ref before starting a request, including programmatic selections.
    currentIdRef.current = id;
    setCurrentId(id);
    void loadGuide(id);
  }, [loadGuide]);

  const refresh = useCallback(async () => {
    const request = ++refreshRequestRef.current;
    setRefreshing(true);
    try {
      const [nextHealth, nextDoctor, nextCatalog, nextEngagements] = await Promise.all([
        api.health(), api.doctor(), api.catalog(), api.engagements(),
      ]);
      if (request !== refreshRequestRef.current) return;
      const ids = new Set(nextEngagements.engagements.map((item) => item.id));
      const stored = readCurrentEngagement();
      const selected = currentIdRef.current && ids.has(currentIdRef.current)
        ? currentIdRef.current
        : stored && ids.has(stored)
          ? stored
          : nextEngagements.engagements[0]?.id ?? null;
      setHealth(nextHealth); setDoctor(nextDoctor); setCatalog(nextCatalog);
      setEngagements(nextEngagements.engagements);
      currentIdRef.current = selected;
      setCurrentId(selected);
      setError(null);
      // Commit selection before awaiting the guide so a later user selection wins.
      if (await loadGuide(selected)) setLoaded(true);
    } catch (err) {
      // Leave `loaded` false on the first failure so the retry screen shows;
      // a later transient failure keeps the already-rendered console up.
      if (request === refreshRequestRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (request === refreshRequestRef.current) setRefreshing(false);
    }
  }, [loadGuide]);

  useEffect(() => {
    void refresh();
    return () => {
      guideRequestRef.current += 1;
      refreshRequestRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (currentId) writeCurrentEngagement(currentId);
  }, [currentId]);

  useEffect(() => {
    if (loaded && location.pathname === "/start" && firstRun) {
      writeOnboardingSeen();
      setFirstRun(false);
    }
  }, [firstRun, loaded, location.pathname]);

  // Zero-friction start: if nothing exists yet, seed the offline demo once so no page is empty.
  useEffect(() => {
    if (loaded && !autoSeededRef.current && engagements.length === 0) {
      autoSeededRef.current = true;
      void (async () => {
        try {
          const created = await api.demoEngagement();
          upsertEngagement(created.engagement);
          await refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, engagements.length]);

  const current = useMemo(
    () => engagements.find((item) => item.id === currentId) ?? engagements[0] ?? null,
    [engagements, currentId],
  );
  const currentGuide = guideState.engagementId === currentId ? guideState : null;
  const guide = currentGuide?.status === "ready" ? currentGuide.data : null;
  const notice = error ?? (currentGuide?.status === "unavailable" ? currentGuide.message : null);

  function upsertEngagement(engagement: Engagement) {
    setEngagements((items) => [engagement, ...items.filter((item) => item.id !== engagement.id)]);
    selectEngagement(engagement.id);
  }

  async function createEngagement(body: { name: string; domain: string; dc: string; notes: string }) {
    const created = await api.createEngagement(body);
    upsertEngagement(created.engagement);
    notify(`Engagement “${created.engagement.name}” ready`);
    await refresh();
  }

  async function updateEngagement(
    id: string,
    body: { name: string; domain: string; dc: string; notes: string },
  ) {
    const updated = await api.updateEngagement(id, body);
    upsertEngagement(updated.engagement);
    notify(`Engagement “${updated.engagement.name}” updated`);
    await refresh();
  }

  async function archiveEngagement(id: string, archived: boolean) {
    const updated = await api.archiveEngagement(id, archived);
    upsertEngagement(updated.engagement);
    notify(archived ? "Engagement archived. Evidence remains available." : "Engagement restored.");
    await refresh();
  }

  async function seedDemo() {
    try {
      const created = await api.demoEngagement();
      upsertEngagement(created.engagement);
      notify("Offline demo ready. No directory was contacted.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const mark = useCallback(async (stepId: string) => {
    if (currentId) await api.markGuided(currentId, stepId);
    await refresh();
  }, [currentId, refresh]);

  const markGreenCatalog = useCallback(() => {
    void mark("green-catalog");
  }, [mark]);

  const markGlossary = useCallback(() => {
    void mark("glossary");
  }, [mark]);

  async function handleConnected(engagement: Engagement) {
    upsertEngagement(engagement);
    await refresh();
  }

  async function handleRan(engagement: Engagement) {
    upsertEngagement(engagement);
    await refresh();
  }

  if (!loaded && notice) {
    return <Fatal message={notice} onRetry={() => void refresh()} />;
  }
  if (!loaded) {
    return <Splash />;
  }

  return (
    <Routes>
      <Route
        element={(
          <Shell
            health={health}
            engagements={engagements}
            current={current}
            onSelectEngagement={selectEngagement}
            catalog={catalog?.capabilities ?? []}
            notice={notice}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
          />
        )}
      >
        <Route path="/start" element={<StartHere />} />
        <Route path="/" element={firstRun ? <Navigate to="/start" replace /> : <Overview health={health} doctor={doctor} guide={guide} engagement={current} onSeedDemo={seedDemo} />} />
        <Route path="/guided" element={<Guided guide={guide} loading={!currentGuide || currentGuide.status === "loading"} engagement={current} onDemo={() => void seedDemo()} onRetry={() => void loadGuide(currentId)} />} />
        <Route path="/catalog" element={<Catalog catalog={catalog} onViewGreen={markGreenCatalog} />} />
        <Route path="/glossary" element={<Glossary onSeen={markGlossary} />} />
        <Route path="/engagements" element={<Engagements items={engagements} currentId={current?.id ?? null} onCreate={createEngagement} onUpdate={updateEngagement} onArchive={archiveEngagement} onDemo={() => void seedDemo()} onSelect={selectEngagement} />} />
        <Route path="/connect" element={<Connect engagement={current} onConnected={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/run" element={<Run engagement={current} catalog={catalog?.capabilities ?? []} onRan={(item) => void handleRan(item)} onSeedDemo={() => void seedDemo()} />} />
        <Route path="/findings" element={<Findings engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} onSeen={() => void mark("findings")} />} />
        <Route path="/vault" element={<Vault engagement={current} onUpdated={(item) => void handleConnected(item)} onSeedDemo={() => void seedDemo()} onSeen={() => void mark("vault-review")} />} />
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
      <div className="splash-bar" aria-hidden="true"><i /></div>
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
