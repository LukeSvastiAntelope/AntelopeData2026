import { useRouter } from 'next/navigation';
import CryptoJS from 'crypto-js';
import { toast } from 'react-hot-toast';

const SECRET_KEY = generateDailySecretKey(); // Change this key to something secure

function generateDailySecretKey() {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  // Create a unique key by encoding the date string with a base string
  const baseString = 'secretKey' + today; // Concatenate a base string for added uniqueness
  const buffer = Buffer.from(baseString, 'utf-8'); // Create a buffer from the base string
  const secretKey = buffer.toString('base64'); // Convert to base64 format

  return secretKey;
}

export const encrypt = (text: string) => {
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

export const decrypt = (ciphertext: string) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export const encryptObj = (data: object) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), SECRET_KEY).toString();
};

export const decryptObj = (ciphertext: string) => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
  const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
  return JSON.parse(decryptedData);
};

export function convertDaysToYMD(totalDays: number) {
  const years = Math.floor(totalDays / 365);
  const remainingDaysAfterYears = totalDays % 365;

  const months = Math.floor(remainingDaysAfterYears / 30);
  const days = Math.round(remainingDaysAfterYears % 30);

  return {
    years,
    months,
    days
  };
}

export const convertDateToPostDate = (time: string): string => {
  const date = new Date(time);

  // Check for invalid date
  if (isNaN(date.getTime())) {
    // throw new Error("Invalid date string provided.");
    return "";
  }

  // Format the date
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short', // e.g., 'Thu'
    year: 'numeric',   // e.g., '2024'
    month: 'short',    // e.g., 'Nov'
    day: 'numeric',    // e.g., '14'
    hour: '2-digit',   // e.g., '09'
    minute: '2-digit', // e.g., '38'
    second: '2-digit', // e.g., '12'
    timeZoneName: 'short' // e.g., 'GMT-0700'
  };

  // Get the formatted date string
  const formattedDate = date.toLocaleString('en-US', options);

  return formattedDate;
}

// Centralized authentication error handler
export const handleAuthError = (router?: any, showToast: boolean = false) => {
  if (showToast) {
    toast.error("Session expired. Please log in again.");
  }
  
  // Clear auth data
  if (typeof window !== 'undefined') {
    localStorage.removeItem("userId");
    localStorage.removeItem("token");
  }
  
  // Redirect to login if router is available
  if (router) {
    router.push('/login');
  } else if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
};

export function useFetch() {
  const router = useRouter();

  return {
    get: request('GET'),
    post: request('POST'),
    put: request('PUT'),
    delete: request('DELETE')
  };

  function request(method: string) {
    return (url: string, body?: unknown) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem("token") ?? "" : "";
      const headers: { [key: string]: string | undefined } = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': body ? 'application/json' : undefined
      };

      const requestOptions: RequestInit = {
        method,
        headers: Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<string, string>,
        ...(body ? { body: JSON.stringify(body) } : {})
      };

      return fetch(url, requestOptions).then(handleResponse);
    }
  }

  // helper functions

  async function handleResponse(response: Response) {
    const isJson = response.headers?.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    // check for error response
    if (!response.ok) {
      if (response.status === 401) {
        // Handle auth error silently
        handleAuthError(router, false);
        return;
      }

      // get error message from body or default to response status
      const error = (data && data.message) || response.statusText;
      return Promise.reject(error);
    }
    return data;
  }
}