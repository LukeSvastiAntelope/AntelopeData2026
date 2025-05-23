"use client";

/**
 * This function applies Solana wallet adapter styles manually via a link tag.
 * This avoids PostCSS processing which causes syntax errors.
 */
export function applySolanaWalletStyles() {
  // Only run in browser environment
  if (typeof document !== 'undefined') {
    // Check if styles are already applied
    if (!document.getElementById('solana-wallet-adapter-styles')) {
      try {
        // Instead of loading CSS directly, we'll load it via CDN
        // This completely bypasses the build system
        const linkElement = document.createElement('link');
        linkElement.id = 'solana-wallet-adapter-styles';
        linkElement.rel = 'stylesheet';
        linkElement.href = 'https://unpkg.com/@solana/wallet-adapter-react-ui@0.9.35/styles.css';
        
        // Append to document head
        document.head.appendChild(linkElement);
        
        console.log('Solana wallet adapter styles applied successfully');
      } catch (error) {
        console.error('Failed to load Solana wallet adapter styles:', error);
      }
    }
  }
} 