import { useState } from "react";

const SHORT_URL_BASE = import.meta.env.VITE_SHORT_URL_BASE;

export function ShortUrl({ shortCode }: { shortCode: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${SHORT_URL_BASE}/${shortCode}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (e.g. insecure context or denied
      // permission); the URL is still shown as selectable text either way.
    }
  }

  return (
    <span className="short-url">
      <a href={fullUrl} target="_blank" rel="noreferrer">
        {fullUrl}
      </a>
      <button type="button" onClick={handleCopy} aria-label={`Copy short link ${fullUrl}`}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </span>
  );
}
