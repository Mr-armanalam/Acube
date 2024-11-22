import formatDate from "../utils/getDateformate";
import * as api from "../Api";
export const send_chat_messages=(sendMessages)=>async(dispatch)=>{
    try {
        const {data}=await api.send_chat_Messages(sendMessages);
        const date = formatDate(data.createdAt);
        document.cookie = `Date= ${date}`;
        data.createdAt = date;
        // console.log(data);
        dispatch({type:"SEND_CHAT_MESSAGES",payload:data})
    } catch (error) {
        console.log(error)
    }
}