// Phase 5 fix — Home (preview screen A): Obsidian/Red tokens, Plus
// Jakarta Sans + Manrope, topic chips that ACTUALLY filter the feed,
// 16:9 thumbnails + duration badges + avatars (Showvideo), Upload pill
// routing into Studio. Chip topics come from the preview; filtering is
// client-side keyword matching over title/tags/uploader because there
// is no server-side topic endpoint.
import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import "./Home.css";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import LoadingCard from "../../Component/LoadingCard";
import { useVideos } from "../../query/hooks";

const TOPICS: Array<{ label: string; keywords: string[] }> = [
  { label: "All", keywords: [] },
  {
    label: "Motivation",
    keywords: ["motivat", "success", "routine", "plan", "patience", "gear"],
  },
  { label: "Nature", keywords: ["nature", "lake", "ocean", "forest"] },
  {
    label: "Learning",
    keywords: ["learn", "python", "java", "react", "tutorial", "code"],
  },
  { label: "Music", keywords: ["music", "sound"] },
  {
    label: "Coding",
    keywords: ["code", "coding", "python", "java", "react", "tutorial"],
  },
];

const Home = () => {
  const { data, isLoading, isError } = useVideos();
  const [topic, setTopic] = useState("All");
  const vids = useMemo(
    () => (data ? [...data].filter(Boolean) : undefined),
    [data],
  );
  const filtered = useMemo(() => {
    if (!vids) return undefined;
    if (topic === "All") return vids;
    const entry = TOPICS.find((t) => t.label === topic);
    if (!entry) return vids;
    return vids.filter((v) => {
      const haystack = [
        v.videotitle,
        v.description ?? "",
        ...(v.tags ?? []),
        v.uploader ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return entry.keywords.some((k) => haystack.includes(k));
    });
  }, [vids, topic]);

  const isEmpty = !isLoading && !isError && filtered?.length === 0;

  return (
    <div className="container_Pages_App">
      <div className="container2_Pages_App">
        <div className="navigation_Home" role="group" aria-label="Topics">
          {TOPICS.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`btn_nav_home${topic === t.label ? " active" : ""}`}
              aria-pressed={topic === t.label}
              onClick={() => setTopic(t.label)}
            >
              {t.label}
            </button>
          ))}
          <Link to="/studio/upload" className="home-upload-pill">
            + Upload
          </Link>
        </div>
        {isLoading ? (
          <LoadingCard />
        ) : isError ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            Could not load videos. Please check your connection and try again.
          </p>
        ) : isEmpty ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            {topic === "All"
              ? "No videos yet. Be the first to upload one!"
              : `No videos about ${topic} yet.`}
          </p>
        ) : (
          <Showvideogrid vid={filtered} />
        )}
      </div>
    </div>
  );
};

export default Home;
