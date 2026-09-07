// Helper to normalise whitespace and remove duplicates like 'ageThe'
export const normaliseText = (txt: string): string => {
  return txt
    // collapse newlines before and after citation markers so they stay inline
    .replace(/\n+\s*\[(\d+)\]/g, ' [$1]')    // newline(s) before marker
    .replace(/\[(\d+)\]\s*\n+/g, '[$1] ')    // newline(s) after marker
    .replace(/\s+\n/g,'\n')           // trim spaces before newline
    .replace(/\n{3,}/g,'\n\n')        // collapse >2 blank lines
    .replace(/([a-z])([A-Z])/g,'$1 $2')  // add space if missing
    .replace(/\b(\w+)\s+\1\b/gi,'$1'); // remove duplicated words
};

// Normalize markdown structure for consistent rendering across AI models
export const normalizeMarkdown = (text: string): string => {
  let normalized = text;
  
  // Ensure proper spacing around headings
  normalized = normalized.replace(/\n(#{1,6}\s[^\n]+)\n/g, '\n\n$1\n\n');
  normalized = normalized.replace(/^(#{1,6}\s[^\n]+)\n/g, '$1\n\n');
  
  // Ensure proper spacing around lists
  normalized = normalized.replace(/\n(\s*[-*+]\s[^\n]+)/g, '\n\n$1');
  normalized = normalized.replace(/(\s*[-*+]\s[^\n]+)\n([^\s-*+\n])/g, '$1\n\n$2');
  
  // Ensure proper spacing around numbered lists
  normalized = normalized.replace(/\n(\s*\d+\.\s[^\n]+)/g, '\n\n$1');
  normalized = normalized.replace(/(\s*\d+\.\s[^\n]+)\n([^\s\d\n])/g, '$1\n\n$2');
  
  // Clean up excessive whitespace but preserve intentional spacing
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  
  // Move citations to more natural positions (after punctuation)
  normalized = normalized.replace(/(\[\d+\])([.,:;!?])/g, '$2$1');
  normalized = normalized.replace(/([.,:;!?])(\s*)(\[\d+\])/g, '$1$3$2');
  
  return normalized.trim();
}; 