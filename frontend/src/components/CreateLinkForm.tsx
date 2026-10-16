import { FormEvent, useState } from "react";
import { createLink } from "../api";
import { useAuth } from "../AuthContext";
import { ShortUrl } from "./ShortUrl";

export function CreateLinkForm({ onCreated }: { onCreated: () => void }) {
  const { token } = useAuth();
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdShortCode, setCreatedShortCode] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    setError("");
    setIsSubmitting(true);

    try {
      const link = await createLink(token, {
        url,
        alias: alias || undefined,
        // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" with no
        // timezone; new Date(...) on the backend side parses that as local
        // time, which is fine for this take-home.
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });

      setCreatedShortCode(link.shortCode);
      setUrl("");
      setAlias("");
      setExpiresAt("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="create-link-form" onSubmit={handleSubmit}>
      <label htmlFor="url">Destination URL</label>
      <input
        id="url"
        type="text"
        required
        placeholder="https://example.com/some-page"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      <label htmlFor="alias">Custom alias (optional)</label>
      <input
        id="alias"
        type="text"
        placeholder="my-link"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
      />

      <label htmlFor="expiresAt">Expires at (optional)</label>
      <input
        id="expiresAt"
        type="datetime-local"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
      />

      {error && <p className="auth-error">{error}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create link"}
      </button>

      {createdShortCode && (
        <div className="created-link-result">
          <p>Link created:</p>
          <ShortUrl shortCode={createdShortCode} />
        </div>
      )}
    </form>
  );
}
