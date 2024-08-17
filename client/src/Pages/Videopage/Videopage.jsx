import React, { useEffect } from 'react'
import "./Videopage.css"
import moment from 'moment'
import Likewatchlatersavebtns from './Likewatchlatersavebtns'
import { useParams, Link } from 'react-router-dom'
import Comment from '../../Component/Comment/Comment'
import { viewvideo } from '../../action/video'
import { addtohistory } from '../../action/history'
import { useSelector,useDispatch } from 'react-redux'
import Showvideogrid from '../../Component/Showvideogrid/Showvideogrid'
import VideoPlayer from '../../Component/videoPlayer/videoPlayer'
const Videopage = () => {
    const { vid } = useParams();
    const dispatch=useDispatch()
    const vids=useSelector((state)=>state.videoreducer)
    // const vids = [
    //     {
    //         _id: 1,
    //         video_src: vidd,
    //         chanel: "wvjwenfj3njfwef",
    //         title: "video 1",
    //         uploader: "abc",
    //         description: "description of video 1"
    //     },
    //     {
    //         _id: 1,
    //         video_src: vidd,
    //         chanel: "wvjwenfj3njfwef",
    //         title: "video 1",
    //         uploader: "abc",
    //         description: "description of video 1"
    //     },
    //     {
    //         _id: 2,
    //         video_src: vidd,
    //         chanel: "wvjwenfj3njfwef",
    //         title: "video 2",
    //         uploader: "abc",
    //         description: "description of video 2"
    //     },
    //     {
    //         _id: 3,
    //         video_src: vidd,
    //         chanel: "wvjwenfj3njfwef",
    //         title: "video 3",
    //         uploader: "abc",
    //         description: "description of video 3"
    //     },
    //     {
    //         _id: 4,
    //         video_src: vidd,
    //         chanel: "wvjwenfj3njfwef",
    //         title: "video 4",
    //         uploader: "abc",
    //         description: "description of video 4"
    //     },
    // ]
    // console.log( vids)
    const viDs=vids?.data?.filter(q=>q).reverse();
    const vv = vids?.data?.filter((q) => q._id === vid)[0]
   
    const currentuser = useSelector(state => state.currentuserreducer);
    const handleviews=()=>{
        dispatch(viewvideo({id:vid}))
    }
    const handlehistory=()=>{
        dispatch(addtohistory({
            videoid:vid,
            viewer:currentuser?.result._id,
        }))
    }
    useEffect(()=>{
        if(currentuser){
            handlehistory();
        }
        handleviews()
    },[])
    return (
      <>
        <div className="container_videoPage">
          <div className="container2_videoPage">
            <div className="video_display_screen_videoPage">
              {/* <video
                src={`${vv?.filepath}`}
                className="video_ShowVideo_videoPage"
                controls
              ></video> */}
              <VideoPlayer video={vv?.filepath} />
              <div className="video_details_videoPage">
                <div className="video_btns_title_VideoPage_cont">
                  <p className="video_title_VideoPage">{vv?.videotitle}</p>
                  <div className="views_date_btns_VideoPage">
                    <div className="views_videoPage">
                      {vv?.views} views <div className="dot"></div>{" "}
                      {moment(vv?.createdat).fromNow()}
                    </div>
                    <Likewatchlatersavebtns vv={vv} vid={vid} />
                  </div>
                </div>
                <Link to={"/"} className="chanel_details_videoPage">
                  <b className="chanel_logo_videoPage">
                    <p>{vv?.uploader.charAt(0).toUpperCase()}</p>
                  </b>
                  <p className="chanel_name_videoPage">{vv?.uploader}</p>
                </Link>
                <div className="comments_VideoPage">
                  <h2>
                    <u>Comments</u>
                  </h2>
                  <Comment videoid={vv?._id} />
                </div>
              </div>
            </div>
            <div className="moreVideoBar">
              <h1>More videos</h1>
              <Showvideogrid vid={viDs} />
            </div>
          </div>
        </div>
      </>
    );
}

export default Videopage

