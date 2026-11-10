import React from 'react'
import './loading.css'

const LoadingCard = () => {
  return (
    <section>
        <div className='cardblock1'>
            {
               [...Array(6)].map((item, index) =>(
                <div className='cardblock' key={index}>
                    <div key={index} className="cardImage " />
                    <div className='description'>
                        <span className='picture'/>
                        <div style={{marginLeft:"16px",marginTop:'1rem'}}>
                            <p className='cardSubdescription sub1'></p>
                            <p className='cardSubdescription sub2'></p>
                            <p className='cardSubdescription'></p>
                        </div>
                    </div>
                </div>
               ))
            }
        </div>
    </section>
  )
}

export default LoadingCard