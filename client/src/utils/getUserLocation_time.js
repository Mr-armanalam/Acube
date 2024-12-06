async function getUserLocation() {
  const response = await fetch('https://ipapi.co/json/');
  const data = await response.json();
  return data;
}

function getCurrentTime() {
  const now = new Date();
  const hours = now.getHours();
  return hours;
}

export { getCurrentTime, getUserLocation}