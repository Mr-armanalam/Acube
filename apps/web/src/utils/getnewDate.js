export function formatNewDate(date) { 
    const day = String(date.getDate()).padStart(2, '0'); 
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    // Months are zero-based, so we add 1 
    const year = date.getFullYear(); 
    return `${day}-${month}-${year}`; 
}