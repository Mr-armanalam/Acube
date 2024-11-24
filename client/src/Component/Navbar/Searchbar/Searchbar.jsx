import React, { useState } from 'react'
import "./Searchbar.css"
import { BsMicFill } from "react-icons/bs"
import { FaSearch } from "react-icons/fa"
import Searchlist from './Searchlist'

import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
const Searchbar = () => {
    const [Searchquery, setSearchquery] = useState("")
    const [searchlist, setsearchlist] = useState(false)
    // const Titlearray=useSelector(s=>s?.videoreducer)?.data?.filter(q=>q?.videotitle.toUpperCase().includes(Searchquery?.toUpperCase())).map((m)=>({title: m?.videotitle, srcUrl: m?.filepath}))
    const Titlearray = useSelector(s=>s?.videoreducer)?.data?.filter(q=>q?.videotitle.toUpperCase().includes(Searchquery?.toUpperCase()))
    return (
        <>
            <div className="SearchBar_Container">
                <div className="SearchBar_Container2">
                    <div className="search_div">
                        <input type="text" className='iBox_SearchBar' placeholder='Search' onChange={e => setSearchquery(e.target.value)} value={Searchquery} onClick={e=>setsearchlist(true)}/>
                        <Link to={`/search/${Searchquery}`}>
                        <FaSearch className="searchIcon_SearchBar"/>
                        </Link>
                        <BsMicFill className='Mic_SearchBar'/>
                        {Searchquery && searchlist && 
                        <Searchlist setsearchquery={setSearchquery} Titlearray={Titlearray}/>}
                    </div>
                </div>
            </div>
        </>
    )
}

export default Searchbar