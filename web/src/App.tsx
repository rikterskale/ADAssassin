import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Placeholder } from "./pages/Placeholder";
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

  const refresh = useCallback(async () => {
    const [nextHealth, nextDoctor, nextGuide, nextCatalog, nextEngagements] = await Promise.all([
      api.health(), api.doctor(), api.guide(), api.catalog(), api.engagements(),
    ]);
    setHealth(nextHealth); setDoctor(nextDoctor); setGuide(nextGuide); setCatalog(nextCatalog);
    setEngagements(nextEngagements.engagements);
    setCurrentId((current) => current ?? nextEngagements.engagements[0]?.id ?? null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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
    const created = await api.demoEngagement();
    upsertEngagement(created.engagement);
    await refresh();
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

  return (
    <Routes>
      <Route element={<Shell health={health} />}>
        <Route path="/" element={<Overview health={health} doctor={doctor} guide={guide} engagement={current} />} />
        <Route path="/guided" element={<Guided guide={guide} engagement={current} onDemo={() => void seedDemo()} onMark={(id) => void mark(id)} />} />
        <Route path="/catalog" element={<Catalog catalog={catalog} onViewGreen={() => void mark("green-catalog")} />} />
        <Route path="/glossary" element={<Glossary onSeen={() => void mark("glossary")} />} />
        <Route path="/engagements" element={<Engagements items={engagements} currentId={current?.id ?? null} onCreate={createEngagement} onDemo={() => void seedDemo()} onSelect={setCurrentId} />} />
        <Route path="/connect" element={<Connect engagement={current} onConnected={(item) => void handleConnected(item)} />} />
        <Route path="/run" element={<Run engagement={current} catalog={catalog?.capabilities ?? []} onRan={(item) => void handleRan(item)} />} />
        <Route path="/findings" element={<Findings engagement={current} onUpdated={(item) => void handleConnected(item)} />} />
        <Route path="/vault" element={<Vault engagement={current} onUpdated={(item) => void handleConnected(item)} />} />
        <Route path="/rollback" element={<Rollback engagement={current} onUpdated={(item) => void handleConnected(item)} />} />
        <Route path="/report" element={<Placeholder title="Report" copy="Markdown and HTML export wrap the engine report capability." engagement={current} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
