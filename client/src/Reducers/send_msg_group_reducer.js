export const send_group_msg =  (state = [], action) => {
    switch (action.type) {
        case "SEND_GROUP_MESSAGE":
            return action.payload;
        default:
            return state;
    }
};