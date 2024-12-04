import * as api from "../Api";
export const updatePoint=(points)=>async(dispatch)=>{
    try {
        await api.updatePoint(points);
        // console.log(data);        
    } catch (error) {
        alert(error)
    }
}