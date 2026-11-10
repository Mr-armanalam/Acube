import React from "react";
import Leftsidebar from "../Leftsidebar/Leftsidebar";
import "./WHL.css";
import WHLvideolist from "./WHLvideolist";
import { useAppSelector } from "../../store";
import { useClearHistory } from "../../query/hooks";
import type { VideoListEntry } from "../../types";

const WHL = ({
  page,
  videolist,
  isLoading,
  isError,
}: {
  page: string;
  videolist: VideoListEntry[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
}) => {
  const currentuser = useAppSelector((s) => s.auth.session);
  const clearHistoryMutation = useClearHistory();
  const handleclearhistory = () => {
    if (currentuser?.result._id) {
      clearHistoryMutation.mutate(currentuser.result._id);
    }
  };
  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <p className="conatiner_whl">
          <div className="box_WHL leftside_whl">
            <b>Your {page} Shown Here</b>
            {page === "History" && (
              <div
                className="clear_History_btn"
                onClick={() => handleclearhistory()}
              >
                Clear History
              </div>
            )}
          </div>
          <div className="rightSide_whl">
            <h1>{page}</h1>
            <div className="whl_list">
              {isLoading ? (
                <p style={{ color: "var(--forground_text)" }}>Loading...</p>
              ) : isError ? (
                <p style={{ color: "var(--forground_text)" }}>
                  Could not load your {page}. Please try again.
                </p>
              ) : (
                <WHLvideolist
                  page={page}
                  currentuser={currentuser?.result._id}
                  videolist={videolist}
                />
              )}
            </div>
          </div>
        </p>
      </div>
    </div>
  );
};

export default WHL;
