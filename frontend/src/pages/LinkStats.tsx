import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getLinkStats, LinkStats as LinkStatsData } from "../api";
import { useAuth } from "../AuthContext";
import { ClicksChart } from "../components/ClicksChart";
import { TopReferrers } from "../components/TopReferrers";

export function LinkStats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();

  const shortCode = (location.state as { shortCode?: string } | null)?.shortCode;

  const [stats, setStats] = useState<LinkStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !id) return;

    setIsLoading(true);
    setError("");

    getLinkStats(token, id)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load analytics."))
      .finally(() => setIsLoading(false));
  }, [token, id]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Analytics {shortCode ? `for ${shortCode}` : id ? `for link ${id}` : ""}</h1>
        <button onClick={() => navigate("/dashboard")}>Back to dashboard</button>
      </header>

      {isLoading && <p>Loading analytics...</p>}

      {!isLoading && error && <p className="auth-error">{error}</p>}

      {!isLoading && !error && stats && (
        <>
          <div className="stats-summary">
            <div className="stats-card">
              <span className="stats-card-label">Total clicks</span>
              <span className="stats-card-value">{stats.totalClicks}</span>
            </div>
          </div>

          <section>
            <h2>Clicks in the last 7 days</h2>
            <ClicksChart clicksByDay={stats.clicksByDay} />
          </section>

          <section>
            <h2>Top referrers</h2>
            <TopReferrers topReferrers={stats.topReferrers} />
          </section>
        </>
      )}
    </div>
  );
}
