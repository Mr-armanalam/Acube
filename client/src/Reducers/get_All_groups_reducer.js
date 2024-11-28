export const fetch_All_groups = (state = [], action) =>{    
    switch (action.type) {
        case "GET_GROUPS":
            return action.payload   
        default:
            return state;
    }
}