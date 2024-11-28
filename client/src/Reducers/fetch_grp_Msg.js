export const fetch_grp_Msg_reducer = ( state = [], action) => {
    switch (action.type) {
        case "GET_GROUP_MSG":
            return action.payload;
        default:
            return state;
    }
};