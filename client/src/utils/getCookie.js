export default function getCookie(name) {
    // Create a regular expression to match the cookie name
    const nameEQ = name + "=";
    const cookiesArray = document.cookie.split(';');
  
    // Loop through all cookies
    for (let i = 0; i < cookiesArray.length; i++) {
      let cookie = cookiesArray[i];
  
      // Trim leading spaces
      while (cookie.charAt(0) === ' ') {
        cookie = cookie.substring(1, cookie.length);
      }
  
      // Check if the cookie name matches
      if (cookie.indexOf(nameEQ) === 0) {
        return cookie.substring(nameEQ.length, cookie.length);
      }
    }
  
    // Return null if the cookie is not found
    return null;
  }
  
//   // Example usage
//   const myCookie = getCookie('username');
//   console.log(myCookie); // Outputs the value of the 'username' cookie, if it exists
  