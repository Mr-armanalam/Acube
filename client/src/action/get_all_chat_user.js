import * as api from "../Api";
export const get_all_chat_user=()=>async(dispatch)=>{
    try {
        const {data}=await api.all_chat_user_sidebar();
        // console.log("data")
        dispatch({type:"GET_ALL_CHAT_USER",payload:data})
    } catch (error) {
        console.log(error)
    }
}