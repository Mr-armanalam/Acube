import * as api from '../Api';

export const send_GroupUsers = (groupUsers) => (
    async (dispatch) => {
        try {
            await api.send_GroupUsers(groupUsers);
            // console.log(data);
        } catch (error) {
            console.log(error);
        }
    }
)