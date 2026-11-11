// Phase 5 match-preview — Studio Settings (preview images 14–15,
// polished to preview image 22): gradient banner with Change/Remove,
// round avatar with Upload/Remove, 2-column field grid (Channel name,
// Handle with live availability, Description, Channel URL, Contact
// email, Links as chips, Country/Language as a display + chooser),
// Visibility & defaults as RED toggle switches (not checkboxes),
// Upload default as a summary + Edit, Save changes / Discard, and
// the green "Unsaved changes preview — not yet live" indicator that
// shows exactly while the form is dirty.
//
// Image uploads are REAL now (POST /studio/banner, /studio/avatar,
// multipart field "image", jpg/png ≤ 5 MB; POST …/remove to clear) —
// a picked file uploads at once, the preview updates live from the
// response + refetch, and the hooks invalidate studioSettings,
// studioOverview (Studio identity header) and channels (channel
// header) so the new image shows everywhere. No image-URL inputs:
// banner/avatar change only via the file picker or Remove.
// Handle availability is live (GET /studio/handle/available,
// debounced ~450ms); Save is never blocked on it — the server still
// enforces uniqueness on save (HANDLE_TAKEN).
import React, { useEffect, useMemo, useRef, useState } from "react";
import StudioShell from "./Studio";
import {
  StudioEmptyState,
  StudioErrorState,
  StudioSkeleton,
} from "./components";
import {
  useHandleAvailable,
  useRemoveStudioAvatar,
  useRemoveStudioBanner,
  useStudioSettings,
  useUpdateStudioSettings,
  useUploadStudioAvatar,
  useUploadStudioBanner,
  type StudioImageKind,
} from "../../query/hooks";
import { extractApiErrorMessage } from "../../utils/apiError";
import { resolveApiMediaUrl } from "../../Api";
import type { StudioChannelLink, VideoVisibility } from "../../types";

const COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Australia", "Other"];
const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Other"];

/** Live handle check debounce — one request per pause in typing, not
 * one per keystroke. */
const HANDLE_DEBOUNCE_MS = 450;
/** Banner/avatar upload limit (server contract): 5 MB, jpg/png only. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

// Local format rules for the handle. The rule lives in @acube/shared
// (handleFormatRegex) and the server validates exactly that rule —
// this literal MUST match it: 3–30 chars, letters, digits, dot,
// underscore or hyphen. An invalid handle is never sent to the
// availability endpoint. Empty = no check, no error (the server
// treats a missing handle as "keep the current one").
const HANDLE_FORMAT_REGEX = /^[a-zA-Z0-9._-]{3,30}$/;
const HANDLE_FORMAT_MESSAGE =
  "handle must be 3–30 characters: letters, digits, dot, underscore or hyphen";

function validateHandleFormat(handle: string): string | null {
  if (handle.length === 0) return null;
  if (!HANDLE_FORMAT_REGEX.test(handle)) return HANDLE_FORMAT_MESSAGE;
  return null;
}

// Client-side file gate (same limits as the server): jpg/png, ≤ 5 MB.
// Rejects before any upload is attempted, with an inline error.
function validateImageFile(file: File): string | null {
  if (file.type) {
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      return "Choose a JPG or PNG image.";
    }
  } else if (!/\.(jpe?g|png)$/i.test(file.name)) {
    return "Choose a JPG or PNG image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

function capitalizeVisibility(v: VideoVisibility): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export default function Settings() {
  const settings = useStudioSettings();
  const updateMutation = useUpdateStudioSettings();
  const bannerUpload = useUploadStudioBanner();
  const avatarUpload = useUploadStudioAvatar();
  const bannerRemove = useRemoveStudioBanner();
  const avatarRemove = useRemoveStudioAvatar();
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  // Which link is being edited (its index), or null for chips-only.
  const [editingLink, setEditingLink] = useState<number | null>(null);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [uploadDefaultOpen, setUploadDefaultOpen] = useState(false);
  // Baseline for the dirty check. Normally the server state; after a
  // banner/avatar upload or remove succeeds, the new image is ALREADY
  // live server-side, so the baseline moves with it — otherwise the
  // "unsaved changes" indicator would flash for a change that is
  // already saved. A refetch clears the override (server state wins).
  const [baselineOverride, setBaselineOverride] = useState<FormState | null>(null);
  // Object-URL previews are revoked when replaced, so picking files
  // repeatedly does not leak blob URLs.
  const bannerPreviewRef = useRef<string | null>(null);
  const avatarPreviewRef = useRef<string | null>(null);
  const setBannerPreviewUrl = (url: string | null) => {
    if (bannerPreviewRef.current) URL.revokeObjectURL(bannerPreviewRef.current);
    bannerPreviewRef.current = url;
    setBannerPreview(url);
  };
  const setAvatarPreviewUrl = (url: string | null) => {
    if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
    avatarPreviewRef.current = url;
    setAvatarPreview(url);
  };

  const serverInitial = useMemo(
    () => (settings.data ? toForm(settings.data.channel) : null),
    [settings.data],
  );
  const initial = baselineOverride ?? serverInitial;

  useEffect(() => {
    if (settings.data) {
      setForm(toForm(settings.data.channel));
      setBaselineOverride(null);
      setBannerPreviewUrl(null);
      setAvatarPreviewUrl(null);
    }
  }, [settings.data]);

  const dirty = form !== null && initial !== null && JSON.stringify(form) !== JSON.stringify(initial);
  const channelUrl = form ? `${window.location.origin}/@${form.handle || "channel"}` : "";

  // --- Live handle availability (debounced as-you-type) ---
  const handleValue = form?.handle ?? "";
  const [debouncedHandle, setDebouncedHandle] = useState("");
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedHandle(handleValue),
      HANDLE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [handleValue]);
  const liveFormatError = validateHandleFormat(handleValue);
  const debouncedFormatError = validateHandleFormat(debouncedHandle);
  const handleCheck = useHandleAvailable(
    debouncedHandle,
    debouncedHandle.length > 0 && debouncedFormatError === null,
  );
  const handleTyping = debouncedHandle !== handleValue;
  const handleStatus: "idle" | "checking" | "available" | "taken" | "invalid" =
    handleValue.length === 0
      ? "idle"
      : liveFormatError !== null
        ? "invalid"
        : handleTyping || handleCheck.isFetching
          ? "checking"
          : handleCheck.data?.available === true
            ? "available"
            : handleCheck.data?.available === false
              ? "taken"
              : "idle";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
    setError(null);
  };

  // Apply an image URL that is already live server-side (upload or
  // remove success): the form and the dirty baseline move together.
  const applyImageUrl = (kind: StudioImageKind, url: string) => {
    if (!form) return;
    const next =
      kind === "banner" ? { ...form, bannerUrl: url } : { ...form, avatarUrl: url };
    setForm(next);
    setBaselineOverride(next);
  };

  const uploadImage = (file: File | undefined, kind: StudioImageKind) => {
    if (!file) return;
    const problem = validateImageFile(file);
    const setImageError =
      kind === "banner" ? setBannerError : setAvatarError;
    if (problem) {
      setImageError(problem);
      return;
    }
    setImageError(null);
    // Local preview at once; the server URL replaces it on success.
    // (jsdom has no createObjectURL — it returns undefined there — so
    // only use the result when it is a real URL string.)
    const localUrl = URL.createObjectURL(file);
    if (typeof localUrl === "string" && localUrl) {
      if (kind === "banner") setBannerPreviewUrl(localUrl);
      else setAvatarPreviewUrl(localUrl);
    }
    if (kind === "banner") {
      bannerUpload.mutate(file, {
        onSuccess: (url) => {
          setBannerPreviewUrl(null);
          if (url) applyImageUrl("banner", url);
        },
        onError: (err) => {
          setBannerPreviewUrl(null);
          setBannerError(extractApiErrorMessage(err));
        },
      });
    } else {
      setAvatarBroken(false);
      avatarUpload.mutate(file, {
        onSuccess: (url) => {
          setAvatarPreviewUrl(null);
          if (url) applyImageUrl("avatar", url);
        },
        onError: (err) => {
          setAvatarPreviewUrl(null);
          setAvatarError(extractApiErrorMessage(err));
        },
      });
    }
  };

  const removeImage = (kind: StudioImageKind) => {
    if (!form) return;
    if (kind === "banner" && !form.bannerUrl && !bannerPreview) return;
    if (kind === "avatar" && !form.avatarUrl && !avatarPreview) return;
    const setImageError =
      kind === "banner" ? setBannerError : setAvatarError;
    setImageError(null);
    if (kind === "banner") {
      setBannerPreviewUrl(null);
      bannerRemove.mutate(undefined, {
        onSuccess: () => applyImageUrl("banner", ""),
        onError: (err) => setBannerError(extractApiErrorMessage(err)),
      });
    } else {
      setAvatarPreviewUrl(null);
      avatarRemove.mutate(undefined, {
        onSuccess: () => applyImageUrl("avatar", ""),
        onError: (err) => setAvatarError(extractApiErrorMessage(err)),
      });
    }
  };

  const discardAll = () => {
    if (initial) setForm(initial);
    setSaved(false);
    setError(null);
    setBannerError(null);
    setAvatarError(null);
    setBannerPreviewUrl(null);
    setAvatarPreviewUrl(null);
    setEditingLink(null);
    setLocaleOpen(false);
    setUploadDefaultOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const submitted = form;
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
          // The save succeeded, so what is on screen IS the saved
          // state — move the dirty baseline to it at once, instead of
          // waiting on the refetch (whose response may be
          // structurally identical, in which case no refetch effect
          // fires at all). A later refetch still re-syncs from the
          // server via the settings.data effect.
          setBaselineOverride(submitted);
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

  const bannerSrc = resolveApiMediaUrl(bannerPreview ?? form?.bannerUrl ?? "");
  const avatarSrc = resolveApiMediaUrl(avatarPreview ?? form?.avatarUrl ?? "");
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
          {/* Banner: gradient underneath, uploaded image layered on
              top. Change uploads at once (no URL input any more);
              Remove clears back to the gradient, live. */}
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
                  accept="image/jpeg,image/png"
                  aria-label="Choose banner image"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    uploadImage(e.target.files?.[0], "banner");
                    e.target.value = "";
                  }}
                />
              </label>
              /
              <button
                type="button"
                disabled={bannerRemove.isPending || bannerUpload.isPending}
                onClick={() => removeImage("banner")}
              >
                Remove
              </button>
            </span>
          </div>
          {bannerUpload.isPending ? (
            <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 16px" }}>
              Uploading banner…
            </p>
          ) : bannerError ? (
            <p role="alert" className="studio-field-error" style={{ margin: "0 0 16px" }}>
              {bannerError}
            </p>
          ) : null}

          {/* Avatar: round, Upload/Remove; a URL that does not resolve
              falls back to initials, never a broken image icon.
              Upload is immediate (no URL input any more); Remove
              clears back to initials, live. */}
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
                accept="image/jpeg,image/png"
                aria-label="Choose profile picture"
                style={{ display: "none" }}
                onChange={(e) => {
                  uploadImage(e.target.files?.[0], "avatar");
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className="acube-btn-secondary"
              disabled={avatarRemove.isPending || avatarUpload.isPending}
              onClick={() => removeImage("avatar")}
            >
              Remove
            </button>
          </div>
          {avatarUpload.isPending ? (
            <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 16px" }}>
              Uploading profile picture…
            </p>
          ) : avatarError ? (
            <p role="alert" className="studio-field-error" style={{ margin: "0 0 16px" }}>
              {avatarError}
            </p>
          ) : null}

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
                <span className="studio-handle-box">
                  <span
                    aria-hidden="true"
                    style={{ color: "var(--text-2)", fontSize: 15 }}
                  >
                    @
                  </span>
                  <input
                    className="studio-handle-input"
                    aria-label="Handle · unique"
                    value={form.handle}
                    onChange={(e) =>
                      set("handle", e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))
                    }
                    placeholder="codestreamer"
                  />
                  {handleStatus === "checking" ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="studio-handle-status-checking"
                    >
                      Checking…
                    </span>
                  ) : handleStatus === "available" ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="studio-handle-status-available"
                    >
                      ✓ available
                    </span>
                  ) : handleStatus === "taken" ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className="studio-handle-status-taken"
                      title={handleCheck.data?.reason ?? "Handle is already taken"}
                    >
                      ✗ taken
                    </span>
                  ) : null}
                </span>
              </label>
              {liveFormatError ? (
                <p role="alert" className="studio-field-error">
                  {liveFormatError}
                </p>
              ) : null}
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
              <span className="studio-field-label" id="settings-links-label">
                Links · shown on channel header
              </span>
              <span
                className="studio-link-chips"
                aria-labelledby="settings-links-label"
                style={{ textTransform: "none", letterSpacing: 0 }}
              >
                {form.links.map((link, i) => {
                  const chipText = link.label.trim() || link.url.trim() || "New link";
                  return (
                    <span key={i} className="studio-link-chip">
                      <button
                        type="button"
                        className="studio-link-chip-label"
                        onClick={() =>
                          setEditingLink(editingLink === i ? null : i)
                        }
                      >
                        {chipText}
                      </button>
                      <button
                        type="button"
                        className="studio-link-chip-remove"
                        aria-label={`Remove link ${i + 1}`}
                        onClick={() => {
                          set(
                            "links",
                            form.links.filter((_, j) => j !== i),
                          );
                          setEditingLink(null);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  className="acube-btn-secondary"
                  onClick={() => {
                    const next = [...form.links, { label: "", url: "" }];
                    set("links", next);
                    setEditingLink(next.length - 1);
                  }}
                >
                  + Add link
                </button>
              </span>
              {editingLink !== null && form.links[editingLink] ? (
                <span className="studio-editor">
                  <input
                    className="acube-input"
                    aria-label={`Link ${editingLink + 1} label`}
                    placeholder="Label"
                    value={form.links[editingLink].label}
                    onChange={(e) =>
                      set(
                        "links",
                        form.links.map((l, j) =>
                          j === editingLink
                            ? { ...l, label: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                  <input
                    className="acube-input"
                    aria-label={`Link ${editingLink + 1} URL`}
                    placeholder="https://…"
                    value={form.links[editingLink].url}
                    onChange={(e) =>
                      set(
                        "links",
                        form.links.map((l, j) =>
                          j === editingLink
                            ? { ...l, url: e.target.value }
                            : l,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="acube-btn-secondary"
                    onClick={() => setEditingLink(null)}
                  >
                    Done
                  </button>
                </span>
              ) : null}
            </div>
            <div className="studio-field">
              <span className="studio-field-label" id="settings-locale-label">
                Country / Language
              </span>
              <button
                type="button"
                className="studio-display-box"
                aria-label="Edit country and language"
                aria-expanded={localeOpen}
                onClick={() => setLocaleOpen((v) => !v)}
              >
                <span>
                  {form.country} · {form.language}
                </span>
                <span aria-hidden="true">Edit ▾</span>
              </button>
              {localeOpen ? (
                <span className="studio-editor">
                  <select
                    className="acube-select"
                    aria-label="Country"
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
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
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="acube-btn-secondary"
                    onClick={() => setLocaleOpen(false)}
                  >
                    Done
                  </button>
                </span>
              ) : null}
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
                  New uploads start as{" "}
                  {capitalizeVisibility(form.uploadDefaultVisibility)} ·
                  comments {form.uploadDefaultComments ? "ON" : "OFF"}
                </span>
              </div>
              <button
                type="button"
                className="acube-btn-secondary"
                aria-label="Edit upload default"
                aria-expanded={uploadDefaultOpen}
                onClick={() => setUploadDefaultOpen((v) => !v)}
              >
                Edit ▾
              </button>
            </div>
            {uploadDefaultOpen ? (
              <div className="studio-editor">
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
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 14,
                  }}
                >
                  <input
                    type="checkbox"
                    role="switch"
                    className="acube-toggle"
                    aria-label="Comments ON for new uploads"
                    checked={form.uploadDefaultComments}
                    onChange={(e) => set("uploadDefaultComments", e.target.checked)}
                  />
                  Comments ON for new uploads
                </label>
                <button
                  type="button"
                  className="acube-btn-secondary"
                  onClick={() => setUploadDefaultOpen(false)}
                >
                  Done
                </button>
              </div>
            ) : null}
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
              onClick={discardAll}
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
