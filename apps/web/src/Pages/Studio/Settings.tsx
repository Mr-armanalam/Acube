// Phase 5 — Studio Settings (Customisation in the plan): channel name
// and description. Reuses the existing channel-edit fields (name/desc)
// via GET/PATCH /studio/settings. Contract fix: GET returns
// { channel: { name, desc, ... } } and PATCH accepts only { name?, desc? }
// — there are no handle/links fields on the server, so the form no
// longer offers them (they were silently dropped by Zod before).
import React, { useEffect, useState } from "react";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import { useStudioSettings, useUpdateStudioSettings } from "../../query/hooks";

export default function Settings() {
  const settings = useStudioSettings();
  const updateMutation = useUpdateStudioSettings();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setName(settings.data.channel.name ?? "");
      setDescription(settings.data.channel.desc ?? "");
    }
  }, [settings.data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(
      { name, desc: description },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <StudioShell>
      <h1>Channel settings</h1>
      {settings.isLoading ? (
        <StudioSkeleton label="Loading channel settings" />
      ) : settings.isError || !settings.data ? (
        <StudioErrorState
          message="Could not load your channel settings."
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <form className="studio-form" onSubmit={handleSubmit}>
          <label>
            Channel name
            <input
              className="acube-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Description
            <textarea
              className="acube-input"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div>
            <button type="submit" className="acube-btn">
              Save settings
            </button>
          </div>
          {saved ? (
            <StudioEmptyState
              title="Settings saved"
              body="Your channel settings have been updated."
            />
          ) : null}
          {updateMutation.isError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              Could not save settings. Please try again.
            </p>
          ) : null}
        </form>
      )}
    </StudioShell>
  );
}
