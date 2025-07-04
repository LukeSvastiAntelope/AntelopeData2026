"use client"

// Fallback toast implementation until sonner is properly installed
export const toast = {
  success: (message: string) => {
    console.log('✅ Success:', message);
    // For now, just log to console - will be replaced when sonner is installed
  },
  error: (message: string) => {
    console.error('❌ Error:', message);
    // For now, just log to console - will be replaced when sonner is installed
  },
  loading: (message: string) => {
    console.log('⏳ Loading:', message);
    // For now, just log to console - will be replaced when sonner is installed
  },
  promise: (promise: Promise<any>, messages: { loading: string; success: string; error: string }) => {
    console.log('🔄 Promise:', messages.loading);
    return promise;
  }
};

// Placeholder Toaster component
export const Toaster = () => {
  return null; // Will be replaced when sonner is properly installed
}; 