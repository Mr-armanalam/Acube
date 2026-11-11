// Phase 5 match-preview — Studio Settings (preview images 14–15):
// gradient banner with Change/Remove, round avatar with Upload/
// Remove, 2-column field grid (Channel name, Handle, Description,
// Channel URL, Contact email, Links, Country/Language), Visibility &
// defaults as RED toggle switches (not checkboxes), Save changes /
// Discard, and the "Unsaved changes preview — not yet live" indicator.
// Honesty notes: there is no image-upload endpoint yet, so banner/
// avatar files are only previewed locally and the PATCH sends URLs;
// the seeded banner/avatar URLs are example.com placeholders that do
// not resolve, so they render layered over the gradient (banner) or
// fall back to initials (avatar) — never a broken-img icon. There is
// NO handle-availability endpoint, so no "✓ available" state is ever
// rendered; handle uniqueness is enforced by the server on save
// (HANDLE_TAKEN). No subscribe/follower UI: no follow system exists.
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

const BANNER_GRADIENT =
  "linear-gradient(100deg, #2b3a55 0%, #7a3b3b 35%, #e8482f 65%, #f59e0b 100%)";

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
  const [avatarBroken, setAvatarBroken] = useState(false);

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
      setAvatarBroken(false);
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

  const bannerSrc = bannerPreview ?? form?.bannerUrl ?? "";
  const avatarSrc = avatarPreview ?? form?.avatarUrl ?? "";
  const initials =
    (form?.name ?? "")
      .split(" ")
      .map((w) => w.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

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
        <form onSubmit={handleSubmit}>
          {/* Banner: gradient underneath, seeded/entered URL layered on
              top — a URL that does not resolve still shows the gradient,
              never a broken image icon. */}
          <div
            className="studio-banner"
            style={
              bannerSrc
                ? { backgroundImage: `url("${bannerSrc}"), ${BANNER_GRADIENT}` }
                : undefined
            }
            role="img"
            aria-label="Channel banner preview"
          >
            <span className="studio-banner-chip">
              🖼 Banner · 2560 × 1440 ·
              <label style={{ cursor: "pointer", textDecoration: "underline" }}>
                Change
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Choose banner image"
                  style={{ display: "none" }}
                  onChange={(e) => pickFile(e.target.files?.[0], "banner")}
                />
              </label>
              /
              <button
                type="button"
                onClick={() => {
                  set("bannerUrl", "");
                  setBannerPreview(null);
                  setBannerFile(null);
                }}
              >
                Remove
              </button>
            </span>
          </div>
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "var(--text-2)",
              marginBottom: 16,
            }}
          >
            Banner image URL
            <input
              className="acube-input"
              value={form.bannerUrl}
              onChange={(e) => set("bannerUrl", e.target.value)}
              placeholder="https://…"
              style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
            />
          </label>

          {/* Avatar: round, Upload/Remove; a URL that does not resolve
              falls back to initials, never a broken image icon. */}
          <div className="studio-avatar-row">
            {avatarSrc && !avatarBroken ? (
              <img
                className="studio-avatar-lg"
                src={avatarSrc}
                alt="Profile picture preview"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              <span className="studio-avatar-lg" aria-hidden="true">
                {initials}
              </span>
            )}
            <div className="studio-avatar-row-text">
              <strong>Profile picture</strong>
              <span>
                PNG / JPG · at least 98 × 98 · shown everywhere your channel
                appears
              </span>
            </div>
            <label className="acube-btn-secondary" style={{ cursor: "pointer" }}>
              Upload
              <input
                type="file"
                accept="image/*"
                aria-label="Choose profile picture"
                style={{ display: "none" }}
                onChange={(e) => pickFile(e.target.files?.[0], "avatar")}
              />
            </label>
            <button
              type="button"
              className="acube-btn-secondary"
              onClick={() => {
                set("avatarUrl", "");
                setAvatarPreview(null);
                setAvatarFile(null);
              }}
            >
              Remove
            </button>
          </div>
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "var(--text-2)",
              marginBottom: 16,
            }}
          >
            Profile picture URL
            <input
              className="acube-input"
              value={form.avatarUrl}
              onChange={(e) => set("avatarUrl", e.target.value)}
              placeholder="https://…"
              style={{ width: "100%", boxSizing: "border-box", marginTop: 4 }}
            />
          </label>

          <div className="studio-settings-grid">
            <div className="studio-field">
              <label>
                Channel name
                <input
                  className="acube-input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="studio-field">
              <label>
                Handle · unique
                <span style={{ display: "flex", alignItems: "center" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      color: "var(--text-2)",
                      marginRight: 2,
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 15,
                    }}
                  >
                    @
                  </span>
                  <input
                    className="acube-input"
                    aria-label="Handle · unique"
                    value={form.handle}
                    onChange={(e) =>
                      set("handle", e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))
                    }
                    placeholder="codestreamer"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </span>
              </label>
            </div>
            <div className="studio-field studio-field-full">
              <label>
                Description · About
                <textarea
                  className="acube-input"
                  rows={4}
                  aria-label="Description"
                  value={form.desc}
                  onChange={(e) => set("desc", e.target.value)}
                />
              </label>
            </div>
            <div className="studio-field">
              <label>
                Channel URL
                <input
                  className="acube-input"
                  value={channelUrl}
                  readOnly
                  aria-label="Channel URL"
                />
              </label>
            </div>
            <div className="studio-field">
              <label>
                Contact email · for viewers
                <input
                  className="acube-input"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                />
              </label>
            </div>
            <div className="studio-field">
              <label>
                Links · shown on channel header
                <span style={{ textTransform: "none", letterSpacing: 0 }}>
                  {form.links.map((link, i) => (
                    <span key={i} className="studio-links-row">
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
                    </span>
                  ))}
                  <button
                    type="button"
                    className="acube-btn-secondary"
                    onClick={() => set("links", [...form.links, { label: "", url: "" }])}
                  >
                    + Add link
                  </button>
                </span>
              </label>
            </div>
            <div className="studio-field">
              <label>
                Country / Language
                <span
                  style={{
                    display: "flex",
                    gap: 8,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  <select
                    className="acube-select"
                    aria-label="Country"
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    className="acube-select"
                    aria-label="Language"
                    value={form.language}
                    onChange={(e) => set("language", e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
          </div>

          <div
            className="acube-card"
            style={{ padding: "8px 16px", marginTop: 16 }}
          >
            <h2 style={{ fontSize: 18, margin: "12px 0 4px" }}>
              Visibility &amp; defaults
            </h2>
            <div className="studio-toggle-row">
              <div>
                <strong>Channel is public</strong>
                <span>Anyone can find and subscribe to this channel</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                className="acube-toggle"
                aria-label="Channel is public — anyone can find this channel"
                checked={form.channelPublic}
                onChange={(e) => set("channelPublic", e.target.checked)}
              />
            </div>
            <div className="studio-toggle-row">
              <div>
                <strong>Keep subscriptions private</strong>
                <span>Hide channels you subscribe to</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                className="acube-toggle"
                aria-label="Keep subscriptions private"
                checked={form.keepSubscriptionsPrivate}
                onChange={(e) =>
                  set("keepSubscriptionsPrivate", e.target.checked)
                }
              />
            </div>
            <div className="studio-toggle-row">
              <div>
                <strong>Upload default</strong>
                <span>
                  New uploads start as {form.uploadDefaultVisibility} ·
                  comments {form.uploadDefaultComments ? "ON" : "OFF"}
                </span>
              </div>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="acube-select"
                  aria-label="Upload default visibility"
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
                <input
                  type="checkbox"
                  role="switch"
                  className="acube-toggle"
                  aria-label="Comments ON for new uploads"
                  checked={form.uploadDefaultComments}
                  onChange={(e) => set("uploadDefaultComments", e.target.checked)}
                />
              </span>
            </div>
            <div className="studio-toggle-row">
              <div>
                <strong>Watermark on videos</strong>
                <span>Small channel logo, bottom-right</span>
              </div>
              <input
                type="checkbox"
                role="switch"
                className="acube-toggle"
                aria-label="Watermark on videos"
                checked={form.watermarkEnabled}
                onChange={(e) => set("watermarkEnabled", e.target.checked)}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <button type="submit" className="acube-btn">
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
            {dirty ? (
              <p className="studio-unsaved">
                ● Unsaved changes preview — not yet live
              </p>
            ) : null}
          </div>
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
