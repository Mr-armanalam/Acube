import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { FaSearch } from "react-icons/fa";
import Describechannel from "./Describechannel";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import LoadingCard from "../../Component/LoadingCard";
import { useChannelPlaylists, useVideos } from "../../query/hooks";

// Channel page, rebuilt to the approved preview (image-26): header
// (banner / avatar / name / @handle · N videos / description) with
// tabs Home / Videos / Playlists / Posts + a search icon that filters
// the channel's videos by title.
//
// Home and Videos both show the channel's videos — no featured /
// curation system exists, so Home does not invent one. Posts has no
// backend system at all, so the tab renders an honest empty state,
// never fake posts. Subscriber counts are never shown: no subscribe
// system exists (see Describechannel).
const CHANNEL_TABS = [
  { id: "home", label: "Home" },
  { id: "videos", label: "Videos" },
  { id: "playlists", label: "Playlists" },
  { id: "posts", label: "Posts" },
] as const;
type ChannelTab = (typeof CHANNEL_TABS)[number]["id"];

// Playlists tab: real playlists from GET /channel/:id/playlists
// (proposed endpoint — useChannelPlaylists falls back to the
// owner-only list for the owner until the backend route lands);
// honest empty state when the channel has none.
const ChannelPlaylists = ({ cid }: { cid: string }) => {
  const { data, isLoading, isError } = useChannelPlaylists(cid);
  if (isLoading) {
    return <LoadingCard />;
  }
  if (isError) {
    return (
      <p className="channel_empty">
        Playlists couldn&apos;t be loaded. Please try again later.
      </p>
    );
  }
  if (!data || data.length === 0) {
    return <p className="channel_empty">No playlists yet.</p>;
  }
  return (
    <div className="channel_playlist_grid">
      {data.map((playlist) => {
        const count = playlist.videoCount ?? playlist.videoIds.length;
        return (
          <Link
            key={playlist._id}
            to={`/playlist/${playlist._id}`}
            className="channel_playlist_card"
          >
            <span className="channel_playlist_title">{playlist.title}</span>
            <span className="channel_playlist_meta">
              {count} {count === 1 ? "video" : "videos"}
            </span>
            {playlist.description ? (
              <span className="channel_playlist_desc">
                {playlist.description}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
};

const Channel = () => {
  const { cid } = useParams();
  const { data, isLoading, isError } = useVideos();
  // Old code reversed here AND again in Showvideogrid (net: API order).
  const vids = useMemo(
    () => data?.filter((q) => q?.videochanel === cid),
    [data, cid],
  );
  const [activeTab, setActiveTab] = useState<ChannelTab>("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.trim().toLowerCase();
  const filteredVids = useMemo(
    () =>
      query
        ? vids?.filter((video) =>
            video.videotitle.toLowerCase().includes(query),
          )
        : vids,
    [vids, query],
  );

  const renderVideos = () => {
    if (isLoading) {
      return <LoadingCard />;
    }
    if (isError) {
      return (
        <p className="channel_empty">
          Could not load videos. Please check your connection and try
          again.
        </p>
      );
    }
    if (!filteredVids || filteredVids.length === 0) {
      return query ? (
        <p className="channel_empty">
          No videos matching &ldquo;{searchQuery.trim()}&rdquo; on this
          channel.
        </p>
      ) : (
        <p className="channel_empty">No videos yet.</p>
      );
    }
    return <Showvideogrid vid={filteredVids} />;
  };

  return (
    <div className="container_Pages_App">
      <div className="container2_Pages_App">
        <Describechannel cid={cid} videoCount={vids?.length} />
        <div
          className="channel_tabs"
          role="tablist"
          aria-label="Channel sections"
        >
          {CHANNEL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={
                activeTab === tab.id
                  ? "channel_tab channel_tab--active"
                  : "channel_tab"
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className="channel_search_btn"
            aria-label="Search this channel's videos"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <FaSearch />
          </button>
        </div>
        {searchOpen ? (
          <input
            type="search"
            className="channel_search_input"
            placeholder="Search videos"
            aria-label="Search videos on this channel"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        ) : null}
        {activeTab === "home" || activeTab === "videos" ? (
          renderVideos()
        ) : activeTab === "playlists" ? (
          cid ? (
            <ChannelPlaylists cid={cid} />
          ) : (
            <p className="channel_empty">No playlists yet.</p>
          )
        ) : (
          <p className="channel_empty">
            No posts to show.
            <span className="channel_empty_sub">
              Acube doesn&apos;t have community posts yet.
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

export default Channel;
