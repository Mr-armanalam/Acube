import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.REACT_APP_ENCRYPTED_KEY;

const base64UrlEncode = (str) => {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const base64UrlDecode = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return str;
};


export const encryptData2 = (data) => {
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
  return base64UrlEncode(encrypted);
};

export const decryptData2 = (encryptedData) => {
  const base64 = base64UrlDecode(encryptedData);
  const bytes = CryptoJS.AES.decrypt(base64, ENCRYPTION_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};
