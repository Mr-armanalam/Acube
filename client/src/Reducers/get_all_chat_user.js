const get_all_chat_user_reducer=(states="",action)=>{
    switch (action.type) {
        case "GET_ALL_CHAT_USER":
            // console.log(action.payload);
            states=action.payload
            
            return states
        default:
            return states
    }
}
export default get_all_chat_user_reducer