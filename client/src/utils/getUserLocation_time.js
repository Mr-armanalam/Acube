import { encryptData2 } from "./toEncrypt";

async function getUserLocation() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();  
    return data;
  } catch (error) {
    console.log(error.message);
  }
}

function getCurrentTime() {
  const now = new Date();
  const hours = now.getHours();
  return hours;
}

const CheckRegion = async () => {
  const location = await getUserLocation();       
  console.log(location);
  const southIndiaStates = [ "Tamil Nadu", "Kerala", "Karnataka", "Andhra Pradesh", "Telangana" ];
  let isSouthIndia = southIndiaStates.includes(location?.region);
  if (isSouthIndia) {
    sessionStorage.setItem('isSouthIndia', encryptData2(location?.region))
  }
  return isSouthIndia;
}

export { getCurrentTime, getUserLocation, CheckRegion}