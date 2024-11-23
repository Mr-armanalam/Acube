import * as api from "../Api";
export const get_all_chat_user=(searquery)=>async(dispatch)=>{
    try {
        // console.log(searquery)
        const {data}=await api.all_chat_user_sidebar(searquery);
        dispatch({type:"GET_ALL_CHAT_USER",payload:data})
    } catch (error) {
        console.log(error)
    }
}