import * as api from "../Api";
export const get_messages=(selectedId)=>async(dispatch)=>{
    try {
        const {data}=await api.get_chat_Messages(selectedId);
        // console.log(data)
        dispatch({type:"GET_CHAT_MESSAGES",payload:data})
    } catch (error) {
        console.log(error);
    }
}