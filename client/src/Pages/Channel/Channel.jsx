import React from 'react'
import Describechannel from './Describechannel'
import Leftsidebar from '../../Component/Leftsidebar/Leftsidebar'
import Showvideogrid from '../../Component/Showvideogrid/Showvideogrid'
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
const Channel = ({seteditcreatechanelbtn,setvideouploadpage}) => {
  const {cid}=useParams()
  const vids=useSelector(state=>state.videoreducer)?.data?.filter(q=>q?.videochanel===cid).reverse();
 
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
        <Showvideogrid vid={vids} />
      </div>
    </div>
  );
}

export default Channel;




//     const vids = [
  //   {
  //     _id: 1,
  //     video_src: vid,
  //     Chanel: "62bafe6752cea35a6c30685f",
  //     title: "video 1",
  //     Uploder: "abc",
  //     description: "description of  video 1",
  //   },
  // ];