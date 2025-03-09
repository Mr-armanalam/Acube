import axios from "axios"
  // const API=axios.create({baseURL:`http://localhost:5000/`})
 const API = axios.create({ baseURL: process.env.REACT_APP_BACKEND_URL });
 

API.interceptors.request.use((req)=>{
    if(localStorage.getItem("Profile")){
        req.headers.Authorization=`Bearer ${JSON.parse(localStorage.getItem("Profile")).token}`
    }
    return req;
})


export const login=(authdata)=>API.post("/user/login",authdata);
export const updatechaneldata=(id,updatedata)=>API.patch(`/user/update/${id}`,updatedata)
export const fetchallchannel=()=>API.get("/user/getallchannel");

export const uploadvideo=(filedata,fileoption)=>API.post("/video/uploadvideo",filedata,fileoption)
export const getvideos=()=>API.get("/video/getvideos");
export const likevideo=(id,Like)=>API.patch(`/video/like/${id}`,{Like});
export const viewsvideo=(id)=>API.patch(`/video/view/${id}`);

export const postcomment=(commentdata)=>API.post('/comment/post',commentdata)
export const deletecomment=(id)=>API.delete(`/comment/delete/${id}`)
export const editcomment=(id,commentbody)=>API.patch(`/comment/edit/${id}`,{commentbody})
export const getallcomment=()=>API.get('/comment/get')

export const addtohistory=(historydata)=>API.post("/video/history",historydata)
export const getallhistory=()=>API.get('/video/getallhistory')
export const deletehistory=(userid)=>API.delete(`/video/deletehistory/${userid}`)

export const addtolikevideo=(likedvideodata)=>API.post('/video/likevideo',likedvideodata)
export const getalllikedvideo=()=>API.get('/video/getalllikevide')
export const deletelikedvideo=(videoid,viewer)=>API.delete(`/video/deletelikevideo/${videoid}/${viewer}`)
export const updatePoint=(points)=>API.post('/user/update-points',points)  

export const addtowatchlater=(watchlaterdata)=>API.post('/video/watchlater',watchlaterdata)
export const getallwatchlater=()=>API.get('/video/getallwatchlater')
export const deletewatchlater=(videoid,viewer)=>API.delete(`/video/deletewatchlater/${videoid}/${viewer}`)

export const all_chat_user_sidebar = (searquery)=>API.post(`/chat/chat_user`, searquery);
export const deleteChat = (chat)=>API.put(`/chat/chat_message`, chat);
export const send_chat_Messages = (sendMessages)=>API.post(`/chat/send`, sendMessages);
export const get_chat_Messages = (selectedId)=>API.get(`/chat/message/${selectedId}`);

export const send_GroupUsers = (GroupUsers)=>API.post('/chat/group_user',GroupUsers);
export const get_all_Group = ()=>API.get('/chat/group');
export const send_group_messages = (group_messages)=>API.post('/chat/group/messages', group_messages);
export const fetch_group_messages = (groupId)=>API.get(`/chat/group/${groupId}/messages`);

export const downloadVideo = (videoId)=>API.post('/download/download-video', videoId );
export const checkPremiumStatus = ()=>API.get(`/download/user/premium-status`);
export const handlePaymentStatus = (paymentId)=>API.post('/download/handle-payment-status', paymentId );
export const createPaymentRequest = (paymentData)=>API.post('/download/create-payment-request', paymentData);;
export const getDownloads = ()=>API.get(`/download/user/downloads`);

export const sendOtp = (authdata)=>API.post('/auth/send-otp', authdata);
export const verifyOtp = (authOtp)=>API.post('/auth/verify-otp', authOtp);
