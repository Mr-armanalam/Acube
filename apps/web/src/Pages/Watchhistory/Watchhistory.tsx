import React from "react";
import WHL from "../../Component/WHL/WHL";
import { useHistory } from "../../query/hooks";

const Watchhistory = () => {
  const { data, isLoading, isError } = useHistory();
  return (
    <WHL
      page={"History"}
      videolist={data}
      isLoading={isLoading}
      isError={isError}
    />
  );
};

export default Watchhistory;
