/* eslint-disable no-restricted-globals */
import React from "react";
import Leftsidebar from "../../Component/Leftsidebar/Leftsidebar";
import "./Home.css";
import Showvideogrid from "../../Component/Showvideogrid/Showvideogrid";
import { useSelector } from "react-redux";
import LoadingCard from "../../Component/LoadingCard";
const Home = () => {
  const vids = useSelector((state) => state.videoreducer)
    ?.data?.filter((q) => q)
    .reverse();
  // console.log(vids);


  if (vids?.length === 0) {
  setTimeout(() =>
    {  
      location.reload();
    }, 5000)
    clearTimeout()
  };
    

  const navlist = [
    "All",
    "Python",
    "Java",
    "C++",
    "Movies",
    "Science",
    "Animation",
    "Gaming",
    "Comedy",
  ];
  return (
    <div className="container_Pages_App">
      <div className="at_small_sizel">
        <Leftsidebar />
      </div>
      <div className="container2_Pages_App">
        <div className="navigation_Home">
          {navlist.map((m) => {
            return (
              <p key={m} className="btn_nav_home">
                {m}
              </p>
            );
          })}
        </div>
        {vids == null ? <LoadingCard /> : <Showvideogrid vid={vids} />}
      </div>
    </div>
  );
};

export default Home;
