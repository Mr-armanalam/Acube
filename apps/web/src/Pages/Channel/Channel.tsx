import React, { useMemo } from "react";
import Describechannel from "./Describechannel";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import { useParams } from "react-router";
import { useVideos } from "../../query/hooks";
import LoadingCard from "../../Component/LoadingCard";

const Channel = ({
  seteditcreatechanelbtn,
  setvideouploadpage,
}: {
  seteditcreatechanelbtn: (v: boolean) => void;
  setvideouploadpage: (v: boolean) => void;
}) => {
  const { cid } = useParams();
  const { data, isLoading, isError } = useVideos();
  // Old code reversed here AND again in Showvideogrid (net: API order).
  const vids = useMemo(
    () => data?.filter((q) => q?.videochanel === cid),
    [data, cid],
  );

  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <Describechannel
          cid={cid}
          setvideouploadpage={setvideouploadpage}
          seteditcreatechanelbtn={seteditcreatechanelbtn}
        />
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

export default Channel;
