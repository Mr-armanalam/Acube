import React from 'react'
import './Showvideo.css'
import { Link } from "react-router"
import { formatDistanceToNow } from "date-fns";
// Phase 5 fix (preview screen A): links go to the rebuilt /watch/:id
// page (the old /videopage route only redirects), and a duration badge
// is shown when the server reports a duration.
function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const Showvideo = ({vid}) => {
    // console.log(vid)
    let isloading = "loading"
    if (vid !== undefined) {
    isloading = null;
    }
    const duration = formatDuration(vid?.durationSec ?? vid?.duration);
  return (
    <>
      <Link to={`/watch/${vid._id}`} className="video_thumb_link">
        {/* <video src={`http://localhost:5000/${vid.filepath}`} className='video_ShowVideo'/> */}
        <video src={`${vid.filepath}`}  className={`${vid== null ? isloading :null} video_ShowVideo`}/>
        {duration ? (
          <span className="video_duration_badge">{duration}</span>
        ) : null}
      </Link>
      <div className="video_description">
        <div className="Chanel_logo_App">
          <div className="fstChar_logo_App">
            <>{vid?.uploader?.charAt(0).toUpperCase()}</>
          </div>
        </div>

        <div className="video_details">
          <p className="title_vid_ShowVideo">{vid?.videotitle}</p>
          <pre className="vid_views_UploadTime">{vid?.uploader}</pre>
          <pre className="vid_views_UploadTime">
            {vid?.views} views <div className="dot"></div>
            {formatDistanceToNow(new Date(vid?.createdat ?? Date.now()), {
              addSuffix: true,
            })}
          </pre>
        </div>
      </div>
    </>
  );
}

export default Showvideo