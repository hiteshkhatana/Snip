import { FormEvent, useState } from "react";
import { Link as LinkData, updateLink } from "../api";
import { useAuth } from "../AuthContext";

function toDatetimeLocalValue(isoString: string | null): string {
  if (!isoString) return "";
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" with no
  // timezone suffix, so trim the ISO string down to that.
  return isoString.slice(0, 16);
}

export function EditLinkForm({
  link,
  onSaved,
  onCancel,
}: {
  link: LinkData;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [url, setUrl] = useState(link.originalUrl);
  const [expiresAt, setExpiresAt] = useState(toDatetimeLocalValue(link.expiresAt));
  const [clearExpiry, setClearExpiry] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    setError("");
    setIsSubmitting(true);

    try {
      await updateLink(token, link.id, {
        url,
        // Omitting expiresAt leaves it unchanged on the backend; sending
        // null explicitly clears it; sending a string sets a new date.
        expiresAt: clearExpiry ? null : expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="edit-link-form" onSubmit={handleSubmit}>
      <label htmlFor={`edit-url-${link.id}`}>Destination URL</label>
      <input
        id={`edit-url-${link.id}`}
        type="text"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      <label htmlFor={`edit-expires-${link.id}`}>Expires at</label>
      <input
        id={`edit-expires-${link.id}`}
        type="datetime-local"
        value={expiresAt}
        disabled={clearExpiry}
        onChange={(e) => setExpiresAt(e.target.value)}
      />

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={clearExpiry}
          onChange={(e) => setClearExpiry(e.target.checked)}
        />
        Clear expiry (link never expires)
      </label>

      {error && <p className="auth-error">{error}</p>}

      <div className="edit-link-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
