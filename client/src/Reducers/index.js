import {combineReducers} from "redux";
import authreducer from "./auth";
import currentuserreducer from "./currentuser";
import chanelreducer from "./chanel";
import videoreducer from "./video";
import commentreducer from "./comment";
import historyreducer from "./history";
import likedvideoreducer from "./likedvideo";
import watchlaterreducer from "./watchlater";
import get_all_chat_user_reducer from "./get_all_chat_user";
import send_chat_messages_reducer from "./send_chat_messages_reducer";
import get_messages_reducer from "./get_messages_reducer";
export default combineReducers({
    authreducer,
    currentuserreducer,
    videoreducer,
    chanelreducer,
    commentreducer,
    historyreducer,
    likedvideoreducer,
    watchlaterreducer,
    get_all_chat_user_reducer,
    send_chat_messages_reducer,
    get_messages_reducer
});