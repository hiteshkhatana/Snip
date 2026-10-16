import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLinks, Link as LinkData } from "../api";
import { useAuth } from "../AuthContext";
import { CreateLinkForm } from "../components/CreateLinkForm";
import { LinksTable } from "../components/LinksTable";

const PAGE_SIZE = 10;

export function Dashboard() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [links, setLinks] = useState<LinkData[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function loadLinks() {
    if (!token) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await getLinks(token, page, PAGE_SIZE);
      setLinks(response.data);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load links.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLinks();
  }, [token, page]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function handleLinkCreated() {
    setShowCreateForm(false);
    if (page === 1) {
      // Already on page 1, so changing page state wouldn't trigger the
      // effect below — refetch directly instead.
      loadLinks();
    } else {
      // Changes page state, which the effect below reacts to by
      // refetching. Calling loadLinks() here too would race against that
      // with a stale page value, since setPage doesn't apply immediately.
      setPage(1);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Snip</h1>
        <button onClick={handleLogout}>Log out</button>
      </header>

      <div className="dashboard-actions">
        <button onClick={() => setShowCreateForm((shown) => !shown)}>
          {showCreateForm ? "Cancel" : "Create link"}
        </button>
      </div>

      {showCreateForm && <CreateLinkForm onCreated={handleLinkCreated} />}

      {error && <p className="auth-error">{error}</p>}

      {isLoading ? (
        <p>Loading links...</p>
      ) : links.length === 0 ? (
        <p>You don't have any links yet. Create one to get started.</p>
      ) : (
        <>
          <LinksTable links={links} onChanged={loadLinks} />

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
