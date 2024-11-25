import * as api from "../Api";
export const updatePoint=(points)=>async(dispatch)=>{
    try {
        const {data}=await api.updatePoint(points);
        // console.log(data);
        
        // dispatch({type:"UPDATE_POINTS",payload:data})
    } catch (error) {
        alert(error)
    }
}