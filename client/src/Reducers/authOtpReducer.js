const authOTPreducer = (state = {data: null, status: ''}, actions) =>{  
  switch (actions.type) {
    case "SENDOTP":
      return {...state, data: actions.result.data, status: actions.result.status}
  
    default:
      return state
  }
}

export default authOTPreducer;


const authOtpverifierReducer = (state = {data: null, status: ''}, actions) =>{  
  switch (actions.type) {
    case "VERIFYOTP":
      return {...state, data: actions.result.data, status: actions.result.status}
  
    default:
      return state
  }
}

export {authOtpverifierReducer};