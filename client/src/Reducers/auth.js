const authreducer=(state={data:null},actions)=>{
    switch (actions.type) {
        case "AUTH":
            localStorage.setItem("Profile",JSON.stringify({...actions?.data}));
            // console.log(actions?.data.token)
            // const stringifY_token = JSON.stringify(actions?.data.token)
            //  document.cookie=`jwt_01 = ${stringifY_token}`;
            return {...state,data:actions?.data}
    
        default:
            return state;
    }
}

export default authreducer;