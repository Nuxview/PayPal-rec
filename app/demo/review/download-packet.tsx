"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "../../ui";

export function DownloadPacket({ path, accepted, selection }: { path: string; accepted: number; selection?: string }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();

  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !accepted) return;
    const form = event.currentTarget;
    setPending(true);
    setFeedback(undefined);
    try {
      const response = await fetch(form.action, { method: "POST", body: new URLSearchParams(selection === undefined ? {} : { review: selection }) });
      if (!response.ok || response.headers.get("content-type") !== "application/zip") {
        const path = new URL(response.url || form.action);
        const status = path.searchParams.get("review");
        if (status === "changed") throw new Error("The evidence changed. Reload and review the latest proposals.");
        if (status === "empty") throw new Error("Accept at least one proposal, then try again.");
        if (path.pathname === "/sandbox") throw new Error("Your workspace session expired. Unlock Sandbox and reopen this case.");
        throw new Error("The packet could not be generated. Try downloading again.");
      }
      const file = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = file;
      link.download = "paypal-rec-reviewed-evidence.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(file), 1000);
      setFeedback({ text: "Download started. Check your browser’s downloads for the ZIP." });
    } catch (error) {
      setFeedback({ text: error instanceof TypeError ? "The connection was interrupted. Try downloading again."
        : error instanceof Error ? error.message : "Download failed. Try again.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="packet-download" method="post" action={path} onSubmit={download} aria-label="Download reviewed packet"
      className="panel scroll-mt-6 space-y-4 p-5 sm:p-6">
      {selection !== undefined && <input type="hidden" name="review" value={selection} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="detail-copy max-w-lg">{accepted
          ? "The ZIP includes a PDF and JSON with accepted statements, citations, and open follow-ups. Nothing is sent to PayPal."
          : "Accept at least one proposal to download the reviewed packet."}</p>
        <button type="submit" disabled={!accepted || pending} className="button button-primary">
          <Icon name="download" /> {pending ? "Preparing ZIP…" : "Download reviewed packet"}
        </button>
      </div>
      {feedback && <p role={feedback.error ? "alert" : "status"} className={`feedback ${feedback.error ? "feedback-error" : ""}`}>{feedback.text}</p>}
    </form>
  );
}
