import React from "react";
import WHL from "../../Component/WHL/WHL";
import { useLikedVideos } from "../../query/hooks";

const Likedvideo = () => {
  const { data, isLoading, isError } = useLikedVideos();
  return (
    <WHL
      page={"Liked Video"}
      videolist={data}
      isLoading={isLoading}
      isError={isError}
    />
  );
};

export default Likedvideo;
