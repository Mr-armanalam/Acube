const get_messages_reducer=(states=[],action)=>{
    switch (action.type) {
        case "GET_CHAT_MESSAGES":           
            return action.payload
        default:
            return states
    }
}
export default get_messages_reducer