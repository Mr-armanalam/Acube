import React from "react";
import WHL from "../../Component/WHL/WHL";
import { useWatchLater } from "../../query/hooks";

const Watchlater = () => {
  const { data, isLoading, isError } = useWatchLater();
  return (
    <WHL
      page={"Watch Later"}
      videolist={data}
      isLoading={isLoading}
      isError={isError}
    />
  );
};

export default Watchlater;
