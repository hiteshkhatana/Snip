import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link as LinkData, deleteLink } from "../api";
import { useAuth } from "../AuthContext";
import { ShortUrl } from "./ShortUrl";
import { EditLinkForm } from "./EditLinkForm";

function getStatus(link: LinkData): string {
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return "Expired";
  }
  return "Active";
}

export function LinksTable({
  links,
  onChanged,
}: {
  links: LinkData[];
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function handleDelete(id: string) {
    if (!token) return;
    const confirmed = window.confirm(
      "Delete this link? It will stop working immediately. (The record is soft-deleted on the server, not permanently erased.)"
    );
    if (!confirmed) return;

    setDeletingId(id);
    setDeleteError("");

    try {
      await deleteLink(token, id);
      onChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete link.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="links-table-wrapper">
      {deleteError && <p className="auth-error">{deleteError}</p>}

      <table className="links-table">
        <thead>
          <tr>
            <th>Short URL</th>
            <th>Destination</th>
            <th>Created</th>
            <th>Clicks</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) =>
            editingId === link.id ? (
              <tr key={link.id}>
                <td colSpan={6}>
                  <EditLinkForm
                    link={link}
                    onSaved={() => {
                      setEditingId(null);
                      onChanged();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={link.id}>
                <td>
                  <ShortUrl shortCode={link.shortCode} />
                </td>
                <td className="destination-cell" title={link.originalUrl}>
                  {link.originalUrl}
                </td>
                <td>{new Date(link.createdAt).toLocaleDateString()}</td>
                <td>{link.clickCount}</td>
                <td>{getStatus(link)}</td>
                <td className="actions-cell">
                  <button
                    onClick={() =>
                      navigate(`/links/${link.id}/stats`, {
                        state: { shortCode: link.shortCode },
                      })
                    }
                    aria-label={`View analytics for ${link.shortCode}`}
                  >
                    Analytics
                  </button>
                  <button onClick={() => setEditingId(link.id)} aria-label={`Edit ${link.shortCode}`}>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    aria-label={`Delete ${link.shortCode}`}
                  >
                    {deletingId === link.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
