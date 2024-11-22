export default function formatDate(isoDate) {
    // Parse the ISO date string
    const date = new Date(isoDate);
  
    // Extract the day, month, and year
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = date.getFullYear();
  
    // Format the date as DD-MM-YYYY
    return `${day}-${month}-${year}`;
  }
  
  // // Example usage
  // const formattedDate = formatDate("2024-11-22T18:22:51.802Z");
  // console.log(formattedDate); // Output: 22-11-2024
  