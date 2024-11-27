import * as api from '../Api';

export const send_GroupUsers = (groupUsers) => (
    async (dispatch) => {
        try {
            const { data } = await api.send_GroupUsers(groupUsers);

            console.log(data);
            
            // dispatch({ type: 'SEND_GROUP_USERS', payload: data });
        } catch (error) {
            console.log(error);
        }
    }
)