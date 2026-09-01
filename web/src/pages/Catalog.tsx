import { useMemo, useState } from "react";
import { RiskBadge } from "../components/RiskBadge";
import type { CatalogResponse, Lane } from "../types";

export function Catalog({ catalog }: { catalog: CatalogResponse | null }) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<Lane | "all">("all");
  const [category, setCategory] = useState("all");

  const items = catalog?.capabilities ?? [];
  const categories = useMemo(
    () => ["all", ...Array.from(new Set(items.map((item) => item.category))).sort()],
    [items],
  );

  const filtered = items.filter((item) => {
    const blob = `${item.id} ${item.summary} ${item.category}`.toLowerCase();
    const q = query.trim().toLowerCase();
    if (q && !blob.includes(q)) return false;
    if (lane !== "all" && item.lane !== lane) return false;
    if (category !== "all" && item.category !== category) return false;
    return true;
  });

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Advanced catalog</div>
        <h1>{catalog?.count ?? 0} capabilities from the pinned engine.</h1>
        <p className="lede">
          Source: {catalog?.source ?? "…"}. Green is offline evidence work.
          Yellow reads a target. Red can change state or cause a side effect.
        </p>
      </section>
      <div className="panel">
        <div className="filters">
          <input
            type="search"
            placeholder="Search id, summary, category"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={lane} onChange={(event) => setLane(event.target.value as Lane | "all")}>
            <option value="all">All lanes</option>
            <option value="green">Green</option>
            <option value="yellow">Yellow</option>
            <option value="red">Red</option>
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Lane</th>
                <th>Category</th>
                <th>Env</th>
                <th>Approval</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="mono">{item.id}</td>
                  <td>
                    <RiskBadge lane={item.lane} risk={item.risk} />
                  </td>
                  <td>{item.category}</td>
                  <td className="muted">{item.environment}</td>
                  <td className="mono">{item.approval}</td>
                  <td>{item.plain ?? item.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
