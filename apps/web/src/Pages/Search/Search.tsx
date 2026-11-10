import React, { useMemo } from "react";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
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
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        {isLoading ? (
          <LoadingCard />
        ) : isError ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            Could not load videos. Please check your connection and try again.
          </p>
        ) : (
          <Showvideogrid vid={vids} />
        )}
      </div>
    </div>
  );
};

export default Search;
