const send_chat_messages_reducer=(states=[],action)=>{
    switch (action.type) {
        case "SEND_CHAT_MESSAGES":           
            return action.payload
        default:
            return states
    }
}
export default send_chat_messages_reducer