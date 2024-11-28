import * as api from '../Api';
export const send_grp_msg = (messages) => async (dispatch) =>{
    try {
        const { data } = await api.send_group_messages(messages);  
        dispatch({ type: 'SEND_GROUP_MESSAGE', payload: data });
    } catch (error) {
        console.log(error);
    }
}

export const fetch_grp_msg = (groupId) => async (dispatch)=>{
    try {
        const { data } = await api.fetch_group_messages(groupId);
        // console.log(data);
        dispatch({ type: 'GET_GROUP_MSG', payload: data });
    } catch (error) {
        console.log(error);
    }
}