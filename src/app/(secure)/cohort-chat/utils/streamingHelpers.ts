import { normalizeMarkdown } from './textProcessing';

// Smart buffering - determine when content is ready for rendering
export const isCompleteUnit = (content: string): boolean => {
  // Always update if content is short (first few words)
  if (content.length < 50) return true;
  
  // Update on complete sentences
  if (content.match(/[.!?]\s*$/)) return true;
  
  // Update on complete markdown blocks
  if (content.match(/\n\n$/)) return true;
  
  // Update on complete list items
  if (content.match(/\n\s*[-*+]\s+.+$/)) return true;
  
  // Update on complete headings
  if (content.match(/\n#+\s+.+\n/)) return true;
  
  // Update every 100 characters as fallback
  if (content.length % 100 === 0) return true;
  
  return false;
};

// Process partial response during streaming - extract citations as they come in
export const processPartialResponse = (content: string, existingMessage: any) => {
  // Look for partial citation blocks even if incomplete
  const parts = content.split('\n---\n');
  
  let cleanContent = content;
  let citations: Record<string, string> = existingMessage?.citations || {};
  
  if (parts.length > 1) {
    const answerTxt = parts[0];
    const stats = parts.slice(1).join('\n---\n');
    
    console.log('Found parts in partial response:', { answerLength: answerTxt.length, statsLength: stats.length });
    
    // Only try to extract citations if we have a complete citations section
    // Look for citations: followed by at least one [number] pattern
    if (stats.includes('citations:') && stats.match(/\[\d+\]/)) {
      // Extract citations mapping - be more permissive for partial content
      const citationMatch = stats.match(/citations:\s*([\s\S]*?)(?=\n---|\n🎯|$)/);
      const citationsBlock = citationMatch ? citationMatch[1].trim() : '';
      
      console.log('Citations block found:', citationsBlock);
      console.log('Citations block length:', citationsBlock.length);
      console.log('Citations block lines:', citationsBlock.split('\n'));
      
      if (citationsBlock && citationsBlock.length > 10) { // Only process if we have meaningful content
        const newCitations: Record<string, string> = {};
        
        // Process each line that looks like a citation
        citationsBlock.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          console.log('Processing citation line:', trimmed);
          // Handle format: [1] Q: "question" | A: "answer"
          const m = trimmed.match(/^\[(\d+)\]\s+(.+)/);
          if (m) {
            const citationText = m[2];
            console.log('Citation text:', citationText);
            // Extract the question and answer parts for better display
            const qaParts = citationText.match(/Q:\s*"([^"]+)"\s*\|\s*A:\s*"([^"]+)"/);
            if (qaParts) {
              // Format as "Question: answer" for cleaner tooltip display
              newCitations[m[1]] = `${qaParts[1]}: \"${qaParts[2]}\"`;
              console.log('Formatted citation:', newCitations[m[1]]);
            } else {
              // Fallback to the full text if format doesn't match
              newCitations[m[1]] = citationText;
              console.log('Using fallback citation:', newCitations[m[1]]);
            }
          }
        });
        
        // Only update if we found new citations
        if (Object.keys(newCitations).length > 0) {
          citations = { ...citations, ...newCitations };
          console.log('Updated citations during streaming:', citations);
        }
      }
    } else {
      console.log('Citations section not complete yet, keeping existing citations');
    }
    
    cleanContent = answerTxt;
  } else {
    console.log('No parts found in partial response, using full content');
  }
  
  return {
    content: normalizeMarkdown(cleanContent),
    citations
  };
};

// Process complete response for citations, charts, and data cards
export const processCompleteResponse = (content: string, existingMessage: any) => {
  const chartMatchFull = content.match(/```chart[\s\S]*?```/);
  const dataCardsMatchFull = content.match(/```data-cards[\s\S]*?```/);
  const parts = content.split('\n---\n');
  
  let cleanContent = content;
  let citations: Record<string, string> = existingMessage?.citations || {};
  let chartSpec = existingMessage?.chartSpec;
  let dataCards = existingMessage?.dataCards;
  
  if (parts.length > 1) {
    const answerTxt = parts[0];
    const stats = parts.slice(1).join('\n---\n');
    
    // Extract citations mapping
    const match = stats.match(/citations:\s*([\s\S]*?)(?=---|\n🎯|$)/);
    const citationsBlock = match ? match[1].trim() : '';
    
    if (citationsBlock) {
      console.log('Citations block found:', citationsBlock);
      console.log('Citations block length:', citationsBlock.length);
      console.log('Citations block lines:', citationsBlock.split('\n'));
      const newCitations: Record<string, string> = {};
      
      citationsBlock.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        console.log('Processing citation line:', trimmed);
        // Handle format: [1] Q: "question" | A: "answer"
        const m = trimmed.match(/^\[(\d+)\]\s+(.+)/);
        if (m) {
          const citationText = m[2];
          console.log('Citation text:', citationText);
          // Extract the question and answer parts for better display
          const qaParts = citationText.match(/Q:\s*"([^"]+)"\s*\|\s*A:\s*"([^"]+)"/);
          if (qaParts) {
            // Format as "Question: answer" for cleaner tooltip display
            newCitations[m[1]] = `${qaParts[1]}: \"${qaParts[2]}\"`;
            console.log('Formatted citation:', newCitations[m[1]]);
          } else {
            // Fallback to the full text if format doesn't match
            newCitations[m[1]] = citationText;
            console.log('Using fallback citation:', newCitations[m[1]]);
          }
        }
      });
      
      // Only update citations if we found new ones, otherwise preserve existing
      if (Object.keys(newCitations).length > 0) {
        citations = newCitations;
        console.log('Updated citations object:', citations);
      } else {
        console.log('No new citations found, preserving existing:', citations);
      }
    } else {
      console.log('No citations block found, preserving existing citations:', citations);
    }
    
    cleanContent = answerTxt;
  } else {
    console.log('No stats section found, preserving existing citations:', citations);
  }
  
  // Extract chart spec fenced block
  if (chartMatchFull) {
    try {
      const jsonPart = chartMatchFull[0].replace(/```chart|```/g, '').trim();
      chartSpec = JSON.parse(jsonPart);
      cleanContent = cleanContent.replace(chartMatchFull[0], '').trim();
    } catch (error) {
      console.warn('Failed to parse chart spec:', error);
    }
  }
  
  // Extract data-cards fenced block
  if (dataCardsMatchFull) {
    try {
      const jsonPart = dataCardsMatchFull[0].replace(/```data-cards|```/g, '').trim();
      dataCards = JSON.parse(jsonPart);
      cleanContent = cleanContent.replace(dataCardsMatchFull[0], '').trim();
      console.log('Extracted data cards:', dataCards);
    } catch (error) {
      console.warn('Failed to parse data cards:', error);
    }
  }
  
  return {
    content: normalizeMarkdown(cleanContent),
    citations,
    chartSpec,
    dataCards
  };
}; 