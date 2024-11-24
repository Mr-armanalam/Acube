import React from 'react'
import { FaSearch } from "react-icons/fa"
import './Searchlist.css'
import { Link } from 'react-router-dom'
const Searchlist = ({Titlearray,setsearchquery}) => {
  
  // const handleSearchquery = () => {
  //   setsearchquery
  // }
  // console.log(Titlearray);
  
  
  return (
    <>
        <div className="Container_SearchList">
            {Titlearray?.map(m=>{
                return <div key={m} onClick={e=>setsearchquery('')} className='titleItem'>
                    <Link to={`/videopage/${m?._id}`} className='titleLink' >
                      <FaSearch/>
                      <p>{m?.videotitle}</p>
                    </Link>
                    
                </div>
            })
            }
        </div>
    </>
  )
}

export default Searchlist