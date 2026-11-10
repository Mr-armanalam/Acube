import React from "react";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import { FaHistory } from "react-icons/fa";
import { MdOutlineWatchLater } from "react-icons/md";
import { AiOutlineLike } from "react-icons/ai";
import WHLvideolist from "../../Component/WHL/WHLvideolist";
import { useAppSelector } from "../../store";
import {
  useHistory,
  useLikedVideos,
  useWatchLater,
} from "../../query/hooks";
import "./Library.css";

const Library = () => {
  const currentuser = useAppSelector((s) => s.auth.session);
  const {
    data: likedvideolist,
    isLoading: likedLoading,
    isError: likedError,
  } = useLikedVideos();
  const {
    data: watchlatervideolist,
    isLoading: watchLaterLoading,
    isError: watchLaterError,
  } = useWatchLater();
  const {
    data: watchhistoryvideolist,
    isLoading: historyLoading,
    isError: historyError,
  } = useHistory();
  const userId = currentuser?.result?._id;
  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <div className="container_libraryPage">
          <h1 className="title_container_LibraryPage">
            <b>
              <FaHistory />
            </b>
            <b>History</b>
          </h1>
          <div className="container_videoList_LibraryPage">
            {historyLoading ? (
              <p style={{ color: "var(--forground_text)" }}>Loading...</p>
            ) : historyError ? (
              <p style={{ color: "var(--forground_text)" }}>
                Could not load history.
              </p>
            ) : (
              <WHLvideolist
                page={"History"}
                currentuser={userId}
                videolist={watchhistoryvideolist}
              />
            )}
          </div>
        </div>
        <div className="container_libraryPage">
          <h1 className="title_container_LibraryPage">
            <b>
              <MdOutlineWatchLater />
            </b>
            <b>Watch later</b>
          </h1>
          <div className="container_videoList_LibraryPage">
            {watchLaterLoading ? (
              <p style={{ color: "var(--forground_text)" }}>Loading...</p>
            ) : watchLaterError ? (
              <p style={{ color: "var(--forground_text)" }}>
                Could not load watch later.
              </p>
            ) : (
              <WHLvideolist
                page={"Watch Later"}
                currentuser={userId}
                videolist={watchlatervideolist}
              />
            )}
          </div>
        </div>
        <div className="container_libraryPage">
          <h1 className="title_container_LibraryPage">
            <b>
              <AiOutlineLike />
            </b>
            <b>Liked Videos</b>
          </h1>
          <div className="container_videoList_LibraryPage">
            {likedLoading ? (
              <p style={{ color: "var(--forground_text)" }}>Loading...</p>
            ) : likedError ? (
              <p style={{ color: "var(--forground_text)" }}>
                Could not load liked videos.
              </p>
            ) : (
              <WHLvideolist
                page={"Liked Videos"}
                currentuser={userId}
                videolist={likedvideolist}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Library;
