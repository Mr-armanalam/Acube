import * as api from '../Api'

export const fetchGroup = () => async (dispatch) => {
    const {data} = await api.get_all_Group();
    // console.log(data);
    dispatch({type: 'GET_GROUPS', payload: data});
}