import React, { useMemo } from "react";
import { Link } from "react-router";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import { useParams } from "react-router";
import { useVideos } from "../../query/hooks";
import LoadingCard from "../../Component/LoadingCard";

const Search = () => {
  // Phase 2c: the route is /search/:Searchquery (capital S) — read the
  // param with the exact same name, otherwise it is always undefined.
  const { Searchquery } = useParams();
  const { data, isLoading, isError } = useVideos();
  const vids = useMemo(() => {
    if (!data) return undefined;
    // Old code passed the filtered list to Showvideogrid, which reversed it
    // in render; the grid no longer reverses, so reverse a COPY here to
    // keep the displayed order identical.
    const needle = Searchquery ? Searchquery.toUpperCase() : "";
    return [...data]
      .filter((q) => q?.videotitle.toUpperCase().includes(needle))
      .reverse();
  }, [data, Searchquery]);
  return (
    <div className="container_Pages_App">
      <div className="container2_Pages_App">
        {isLoading ? (
          <LoadingCard />
        ) : isError ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            Could not load videos. Please check your connection and try again.
          </p>
        ) : vids !== undefined && vids.length === 0 ? (
          // Preview screen C (§8.9.23): the empty state is a card with
          // the same "No results for ..." line (as shipped in PR #14)
          // plus a route back to the feed. .acube-empty is token-based,
          // so it reads correctly in both themes.
          <div className="acube-empty" role="status">
            <p style={{ fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
              {Searchquery ? `No results for "${Searchquery}"` : "No results"}
            </p>
            <p style={{ margin: "0 0 12px" }}>
              Try a different search, or go back to the feed.
            </p>
            <Link to="/" className="acube-btn-secondary">
              Back to feed
            </Link>
          </div>
        ) : (
          <Showvideogrid vid={vids} />
        )}
      </div>
    </div>
  );
};

export default Search;
