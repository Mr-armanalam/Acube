import React, { createContext, useState, useEffect, useContext } from 'react';

export const InternetStatusContext = createContext();

export const useInternetStatus = () => useContext(InternetStatusContext);

export const InternetStatusProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Clean up event listeners on component unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <InternetStatusContext.Provider value={isOnline}>
      {children}
    </InternetStatusContext.Provider>
  );
};
