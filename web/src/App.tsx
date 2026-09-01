import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { Shell } from "./components/Shell";
import { Catalog } from "./pages/Catalog";
import { Engagements } from "./pages/Engagements";
import { Guided } from "./pages/Guided";
import { Overview } from "./pages/Overview";
import { Placeholder } from "./pages/Placeholder";
import type { CatalogResponse, Engagement, HealthResponse } from "./types";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextHealth, nextCatalog, nextEngagements] = await Promise.all([
      api.health(),
      api.catalog(),
      api.engagements(),
    ]);
    setHealth(nextHealth);
    setCatalog(nextCatalog);
    setEngagements(nextEngagements.engagements);
    setCurrentId((current) => current ?? nextEngagements.engagements[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = useMemo(
    () => engagements.find((item) => item.id === currentId) ?? engagements[0] ?? null,
    [engagements, currentId],
  );

  async function createEngagement(body: { name: string; domain: string; dc: string; notes: string }) {
    const created = await api.createEngagement(body);
    setEngagements((items) => [created.engagement, ...items]);
    setCurrentId(created.engagement.id);
  }

  async function seedDemo() {
    const created = await api.demoEngagement();
    setEngagements((items) => {
      const rest = items.filter((item) => item.id !== created.engagement.id);
      return [created.engagement, ...rest];
    });
    setCurrentId(created.engagement.id);
  }

  return (
    <Routes>
      <Route element={<Shell health={health} />}>
        <Route path="/" element={<Overview health={health} engagement={current} />} />
        <Route path="/guided" element={<Guided engagement={current} onDemo={() => void seedDemo()} />} />
        <Route path="/catalog" element={<Catalog catalog={catalog} />} />
        <Route
          path="/engagements"
          element={
            <Engagements
              items={engagements}
              currentId={current?.id ?? null}
              onCreate={createEngagement}
              onDemo={() => void seedDemo()}
              onSelect={setCurrentId}
            />
          }
        />
        <Route
          path="/findings"
          element={
            <Placeholder
              title="Findings"
              copy="Evidence cards and explain/remediate flows land after observe capabilities run."
              engagement={current}
            />
          }
        />
        <Route
          path="/vault"
          element={
            <Placeholder
              title="Vault"
              copy="Tickets, certificates, and secrets stay redacted until an operator unmasks a single item."
              engagement={current}
            />
          }
        />
        <Route
          path="/rollback"
          element={
            <Placeholder
              title="Rollback"
              copy="Pending directory mutations from the engine cleanup log will list here."
              engagement={current}
            />
          }
        />
        <Route
          path="/report"
          element={
            <Placeholder
              title="Report"
              copy="Markdown and HTML export wrap the engine report capability."
              engagement={current}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
