import React, { useMemo } from "react";
import Showvideolist from "../Showvideolist/Showvideolist";
import type { VideoListEntry } from "../../types";

// Phase 2b: entries now come from TanStack Query (one array per list).
// The filter is over the small WHL list; the per-row video lookup is O(1)
// via the videos-by-id map in Showvideolist.
const WHLvideolist = ({
  page,
  currentuser,
  videolist,
}: {
  page: string;
  currentuser: string | undefined;
  videolist: VideoListEntry[] | undefined;
}) => {
  const entries = useMemo(
    () =>
      videolist
        ?.filter((q) => q?.viewer === currentuser)
        .slice()
        .reverse(),
    [videolist, currentuser],
  );
  return (
    <>
      {currentuser ? (
        <>
          {entries?.map((m) => {
            return <Showvideolist videoid={m?.videoid} key={m?._id} />;
          })}
        </>
      ) : (
        <>
          <h2 style={{ color: "var(--forground_text)", margin: "0 1rem" }}>
            Plz login to Watch your {page}
          </h2>
        </>
      )}
    </>
  );
};

export default WHLvideolist;
