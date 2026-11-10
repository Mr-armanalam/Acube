// Phase 5 fix — Studio Settings (preview screen G): full channel
// settings form per the contract — banner/avatar (URL + file preview),
// name, handle (unique — backend error shown), derived read-only
// Channel URL, contact email, links add/remove, country/language,
// toggles (channel public, keep subscriptions private, upload
// defaults, watermark), Save/Discard. No subscribe/follower UI: no
// follow system exists, so the preview's "Anyone can find and
// subscribe" copy is NOT rendered as a subscribe feature — the
// channel-public toggle is about discoverability only.
// NOTE: there is no image-upload endpoint yet, so banner/avatar files
// can only be previewed locally; the PATCH sends URLs. Picking a file
// without a URL shows an honest note instead of sending a fake URL.
import React, { useEffect, useMemo, useState } from "react";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import { useStudioSettings, useUpdateStudioSettings } from "../../query/hooks";
import type { StudioChannelLink, VideoVisibility } from "../../types";

const COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Australia", "Other"];
const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Other"];

interface FormState {
  name: string;
  handle: string;
  desc: string;
  contactEmail: string;
  country: string;
  language: string;
  bannerUrl: string;
  avatarUrl: string;
  links: StudioChannelLink[];
  channelPublic: boolean;
  keepSubscriptionsPrivate: boolean;
  uploadDefaultVisibility: VideoVisibility;
  uploadDefaultComments: boolean;
  watermarkEnabled: boolean;
}

function toForm(channel: NonNullable<ReturnType<typeof useStudioSettings>["data"]>["channel"]): FormState {
  return {
    name: channel.name ?? "",
    handle: channel.handle ?? channel.username ?? "",
    desc: channel.desc ?? "",
    contactEmail: channel.contactEmail ?? channel.email ?? "",
    country: channel.country ?? "India",
    language: channel.language ?? "English",
    bannerUrl: channel.bannerUrl ?? "",
    avatarUrl: channel.avatarUrl ?? channel.picture ?? "",
    links: channel.links ?? [],
    channelPublic: channel.channelPublic ?? true,
    keepSubscriptionsPrivate: channel.keepSubscriptionsPrivate ?? false,
    uploadDefaultVisibility:
      (channel.uploadDefaultVisibility as VideoVisibility) ?? "public",
    uploadDefaultComments: channel.uploadDefaultComments ?? true,
    watermarkEnabled: channel.watermarkEnabled ?? false,
  };
}

export default function Settings() {
  const settings = useStudioSettings();
  const updateMutation = useUpdateStudioSettings();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(toForm(settings.data.channel));
  }, [settings.data]);

  const initial = useMemo(
    () => (settings.data ? toForm(settings.data.channel) : null),
    [settings.data],
  );
  const dirty = form !== null && initial !== null && JSON.stringify(form) !== JSON.stringify(initial);
  const channelUrl = form ? `${window.location.origin}/@${form.handle || "channel"}` : "";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
    setError(null);
  };

  const pickFile = (
    file: File | undefined,
    kind: "banner" | "avatar",
  ) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (kind === "banner") {
      setBannerFile(file);
      setBannerPreview(url);
    } else {
      setAvatarFile(file);
      setAvatarPreview(url);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if ((bannerFile || avatarFile) && !(form.bannerUrl || form.avatarUrl)) {
      setError(
        "Image upload to the server is not available yet — paste an image URL for the banner/avatar instead (the file you picked is only previewed locally).",
      );
      return;
    }
    updateMutation.mutate(
      {
        name: form.name,
        desc: form.desc,
        handle: form.handle || undefined,
        // The server rejects a link with an empty label or a bad URL,
        // so blank rows the user added but never filled are dropped.
        links: form.links.filter((l) => l.label.trim() || l.url.trim()),
        contactEmail: form.contactEmail || undefined,
        country: form.country,
        language: form.language,
        bannerUrl: form.bannerUrl || undefined,
        avatarUrl: form.avatarUrl || undefined,
        channelPublic: form.channelPublic,
        keepSubscriptionsPrivate: form.keepSubscriptionsPrivate,
        uploadDefaultVisibility: form.uploadDefaultVisibility,
        uploadDefaultComments: form.uploadDefaultComments,
        watermarkEnabled: form.watermarkEnabled,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setError(null);
        },
        onError: (err) => {
          const message =
            typeof err === "object" && err !== null && "response" in err
              ? (err as { response?: { data?: { error?: { message?: string } } } })
                  .response?.data?.error?.message
              : undefined;
          setError(message ?? "Could not save settings. Please try again.");
        },
      },
    );
  };

  return (
    <StudioShell>
      <h1>Channel settings</h1>
      <p style={{ color: "var(--text-2)" }}>
        Customisation · Basic info · Branding — changes preview live, save
        once.
      </p>
      {settings.isLoading || !form ? (
        <StudioSkeleton label="Loading channel settings" />
      ) : settings.isError || !settings.data ? (
        <StudioErrorState
          message="Could not load your channel settings."
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <form className="studio-form" onSubmit={handleSubmit}>
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <legend>Branding</legend>
            <label>
              Banner image URL · 2560 × 1440
              <input
                className="acube-input"
                value={form.bannerUrl}
                onChange={(e) => set("bannerUrl", e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label>
              Banner file (preview only — no image upload endpoint yet)
              <input
                type="file"
                accept="image/*"
                aria-label="Choose banner image"
                onChange={(e) => pickFile(e.target.files?.[0], "banner")}
              />
            </label>
            {(bannerPreview || form.bannerUrl) ? (
              <img
                src={bannerPreview ?? form.bannerUrl}
                alt="Banner preview"
                style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8 }}
              />
            ) : null}
            <label>
              Profile picture URL · at least 98 × 98
              <input
                className="acube-input"
                value={form.avatarUrl}
                onChange={(e) => set("avatarUrl", e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label>
              Profile picture file (preview only)
              <input
                type="file"
                accept="image/*"
                aria-label="Choose profile picture"
                onChange={(e) => pickFile(e.target.files?.[0], "avatar")}
              />
            </label>
            {(avatarPreview || form.avatarUrl) ? (
              <img
                src={avatarPreview ?? form.avatarUrl}
                alt="Profile picture preview"
                style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "50%" }}
              />
            ) : null}
          </fieldset>

          <label>
            Channel name
            <input
              className="acube-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </label>
          <label>
            Handle · unique
            <input
              className="acube-input"
              value={form.handle}
              onChange={(e) => set("handle", e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))}
              placeholder="codestreamer"
            />
          </label>
          <label>
            Channel URL
            <input className="acube-input" value={channelUrl} readOnly aria-label="Channel URL" />
          </label>
          <label>
            Description
            <textarea
              className="acube-input"
              rows={5}
              value={form.desc}
              onChange={(e) => set("desc", e.target.value)}
            />
          </label>
          <label>
            Contact email · for viewers
            <input
              className="acube-input"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </label>

          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <legend>Links · shown on channel header</legend>
            {form.links.map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className="acube-input"
                  aria-label={`Link ${i + 1} label`}
                  placeholder="Label"
                  value={link.label}
                  onChange={(e) =>
                    set(
                      "links",
                      form.links.map((l, j) =>
                        j === i ? { ...l, label: e.target.value } : l,
                      ),
                    )
                  }
                />
                <input
                  className="acube-input"
                  aria-label={`Link ${i + 1} URL`}
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) =>
                    set(
                      "links",
                      form.links.map((l, j) =>
                        j === i ? { ...l, url: e.target.value } : l,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="acube-btn-danger"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() =>
                    set("links", form.links.filter((_, j) => j !== i))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="acube-btn-secondary"
              onClick={() => set("links", [...form.links, { label: "", url: "" }])}
            >
              + Add link
            </button>
          </fieldset>

          <label>
            Country
            <select
              className="acube-select"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select
              className="acube-select"
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>

          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <legend>Visibility &amp; defaults</legend>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.channelPublic}
                onChange={(e) => set("channelPublic", e.target.checked)}
              />
              Channel is public — anyone can find this channel
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.keepSubscriptionsPrivate}
                onChange={(e) => set("keepSubscriptionsPrivate", e.target.checked)}
              />
              Keep subscriptions private
            </label>
            <label>
              Upload default visibility
              <select
                className="acube-select"
                value={form.uploadDefaultVisibility}
                onChange={(e) =>
                  set("uploadDefaultVisibility", e.target.value as VideoVisibility)
                }
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.uploadDefaultComments}
                onChange={(e) => set("uploadDefaultComments", e.target.checked)}
              />
              Comments ON for new uploads
            </label>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.watermarkEnabled}
                onChange={(e) => set("watermarkEnabled", e.target.checked)}
              />
              Watermark on videos — small channel logo, bottom-right
            </label>
          </fieldset>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="acube-btn" disabled={!dirty && !saved}>
              Save changes
            </button>
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={!dirty}
              onClick={() => {
                if (initial) setForm(initial);
                setSaved(false);
                setError(null);
              }}
            >
              Discard
            </button>
          </div>
          {dirty ? (
            <p style={{ color: "var(--text-2)" }}>
              ● Unsaved changes preview — not yet live
            </p>
          ) : null}
          {saved ? (
            <StudioEmptyState
              title="Settings saved"
              body="Your channel settings have been updated."
            />
          ) : null}
          {error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          {updateMutation.isError && !error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              Could not save settings. Please try again.
            </p>
          ) : null}
        </form>
      )}
    </StudioShell>
  );
}
