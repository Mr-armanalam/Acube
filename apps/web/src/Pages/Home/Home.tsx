import React, { useMemo } from "react";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import "./Home.css";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import LoadingCard from "../../Component/LoadingCard";
import { useVideos } from "../../query/hooks";

const Home = () => {
  const { data, isLoading, isError } = useVideos();
  // Old code reversed here AND again in Showvideogrid (net: API order).
  // The grid no longer reverses, so API order is passed through as-is.
  const vids = useMemo(
    () => (data ? [...data].filter(Boolean) : undefined),
    [data],
  );

  // Phase 2c: an empty video list is a normal empty state, not a reason
  // to reload the page. (The old code scheduled location.reload() after
  // 5s whenever the list came back empty.)
  const isEmpty = !isLoading && !isError && vids?.length === 0;

  const navlist = [
    "All",
    "Python",
    "Java",
    "C++",
    "Movies",
    "Science",
    "Animation",
    "Gaming",
    "Comedy",
  ];
  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <div className="navigation_Home">
          {navlist.map((m) => {
            return (
              <p key={m} className="btn_nav_home">
                {m}
              </p>
            );
          })}
        </div>
        {isLoading ? (
          <LoadingCard />
        ) : isError ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            Could not load videos. Please check your connection and try again.
          </p>
        ) : isEmpty ? (
          <p style={{ color: "var(--forground_text)", padding: "1rem" }}>
            No videos yet. Be the first to upload one!
          </p>
        ) : (
          <Showvideogrid vid={vids} />
        )}
      </div>
    </div>
  );
};

export default Home;
