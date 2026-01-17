interface FileChunk {
  chunk: Blob;
  chunkIndex: number;
  totalChunks: number;
  isFirstChunk: boolean;
  isLastChunk: boolean;
  hasHeader: boolean;
  estimatedRows: number;
  originalMimeType: string;
}

interface ChunkingOptions {
  maxChunkSize: number; // in bytes
  preserveHeaders: boolean;
  minRowsPerChunk: number;
}

export class FileChunker {
  private static readonly DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB
  private static readonly MIN_ROWS_PER_CHUNK = 50;
  
  /**
   * Determines file type from file extension and MIME type
   */
  private static getFileType(file: File): 'csv' | 'excel' {
    const fileName = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();
    
    // Check by extension first (more reliable)
    if (fileName.endsWith('.csv')) {
      return 'csv';
    }
    
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      return 'excel';
    }
    
    // Check by MIME type as fallback
    if (mimeType === 'text/csv' || mimeType === 'application/csv') {
      return 'csv';
    }
    
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return 'excel';
    }
    
    // Default to CSV for unknown types (safer assumption)
    return 'csv';
  }
  
  /**
   * Analyzes file to determine optimal chunking strategy
   */
  static async analyzeFile(file: File): Promise<{
    needsChunking: boolean;
    estimatedRows: number;
    recommendedChunkSize: number;
    fileType: 'csv' | 'excel';
  }> {
    const fileType = this.getFileType(file);
    
    // For Excel files, we'll need different handling
    if (fileType === 'excel') {
      return {
        needsChunking: file.size > 10 * 1024 * 1024, // 10MB threshold for Excel
        estimatedRows: 0, // Can't estimate without parsing
        recommendedChunkSize: this.DEFAULT_CHUNK_SIZE,
        fileType
      };
    }
    
    // For CSV files, we can estimate rows by sampling
    const sampleSize = Math.min(file.size, 50 * 1024); // Sample first 50KB
    const sampleBlob = file.slice(0, sampleSize);
    const sampleText = await sampleBlob.text();
    
    const lines = sampleText.split('\n');
    const avgBytesPerLine = sampleSize / lines.length;
    const estimatedRows = Math.floor(file.size / avgBytesPerLine);
    
    // Determine if chunking is needed (files > 1MB or > 5000 rows)
    // Lowered threshold to avoid 413 errors on servers with 1MB body limits
    const needsChunking = file.size > 1 * 1024 * 1024 || estimatedRows > 5000;
    
    // Calculate optimal chunk size based on estimated rows
    let recommendedChunkSize = this.DEFAULT_CHUNK_SIZE;
    if (estimatedRows > 10000) {
      recommendedChunkSize = 2 * 1024 * 1024; // 2MB for very large files
    }
    
    return {
      needsChunking,
      estimatedRows,
      recommendedChunkSize,
      fileType
    };
  }
  
  /**
   * Chunks a CSV file while preserving structure
   */
  static async chunkCSVFile(
    file: File, 
    options: Partial<ChunkingOptions> = {}
  ): Promise<FileChunk[]> {
    const opts: ChunkingOptions = {
      maxChunkSize: options.maxChunkSize || this.DEFAULT_CHUNK_SIZE,
      preserveHeaders: options.preserveHeaders ?? true,
      minRowsPerChunk: options.minRowsPerChunk || this.MIN_ROWS_PER_CHUNK
    };
    
    const chunks: FileChunk[] = [];
    let currentPosition = 0;
    let chunkIndex = 0;
    let headerLine = '';
    let insideQuotesState = false; // track quote state across chunks to avoid splitting inside quoted fields
    
    // Read the header line first
    if (opts.preserveHeaders) {
      const headerBlob = file.slice(0, Math.min(file.size, 1024)); // Read first 1KB to find header
      const headerText = await headerBlob.text();
      const firstNewlineIndex = headerText.indexOf('\n');
      if (firstNewlineIndex !== -1) {
        headerLine = headerText.substring(0, firstNewlineIndex + 1);
        currentPosition = headerLine.length;
      }
    }
    
    while (currentPosition < file.size) {
      const remainingSize = file.size - currentPosition;
      const chunkSize = Math.min(opts.maxChunkSize, remainingSize);
      
      // Read a buffer slightly larger than desired chunk to find a safe newline outside quotes
      let chunkEnd = currentPosition + chunkSize;
      if (chunkEnd < file.size) {
        const lookaheadSize = 4096; // extra bytes to improve chance of finding safe newline
        const bufferBlob = file.slice(currentPosition, Math.min(file.size, chunkEnd + lookaheadSize));
        const bufferText = await bufferBlob.text();

        // Scan buffer to find the last newline that occurs while not inside quotes,
        // starting with the carried quote state from previous chunk
        let localInsideQuotes = insideQuotesState;
        let lastSafeNewline = -1;
        for (let i = 0; i < bufferText.length && i <= chunkSize; i++) {
          const ch = bufferText[i];
          if (ch === '"') {
            // if doubled quotes inside quoted field, skip the escape and do not toggle
            if (localInsideQuotes && bufferText[i + 1] === '"') {
              i++;
            } else {
              localInsideQuotes = !localInsideQuotes;
            }
          } else if (ch === '\n' && !localInsideQuotes) {
            lastSafeNewline = i;
          }
        }

        if (lastSafeNewline !== -1) {
          chunkEnd = currentPosition + lastSafeNewline + 1;
          // Update insideQuotesState by scanning the accepted slice fully
          let state = insideQuotesState;
          const accepted = bufferText.slice(0, lastSafeNewline + 1);
          for (let i = 0; i < accepted.length; i++) {
            const ch = accepted[i];
            if (ch === '"') {
              if (state && accepted[i + 1] === '"') { i++; }
              else { state = !state; }
            }
          }
          insideQuotesState = state;
        } else {
          // Fallback: use last newline regardless of quotes within the original chunk window
          const naiveLastNewline = bufferText.lastIndexOf('\n', chunkSize);
          if (naiveLastNewline !== -1) {
            chunkEnd = currentPosition + naiveLastNewline + 1;
          }
          // We keep insideQuotesState unchanged in this conservative fallback
        }
      }
      
      // Create the chunk with proper MIME type
      let chunkBlob = file.slice(currentPosition, chunkEnd);
      
      // Add header to non-first chunks if preserveHeaders is true
      if (opts.preserveHeaders && chunkIndex > 0 && headerLine) {
        const chunkText = await chunkBlob.text();
        // Preserve original MIME type
        const chunkWithHeader = new Blob([headerLine, chunkText], { type: file.type || 'text/csv' });
        chunkBlob = chunkWithHeader;
      } else if (chunkIndex === 0) {
        // For first chunk, ensure it has the right MIME type
        const chunkText = await chunkBlob.text();
        chunkBlob = new Blob([chunkText], { type: file.type || 'text/csv' });
      }
      
      // Estimate rows in this chunk
      const chunkText = await chunkBlob.text();
      const estimatedRows = chunkText.split('\n').length - 1; // Subtract 1 for header
      
      chunks.push({
        chunk: chunkBlob,
        chunkIndex,
        totalChunks: 0, // Will be set after all chunks are created
        isFirstChunk: chunkIndex === 0,
        isLastChunk: chunkEnd >= file.size,
        hasHeader: chunkIndex === 0 || opts.preserveHeaders,
        estimatedRows,
        originalMimeType: file.type
      });
      
      currentPosition = chunkEnd;
      chunkIndex++;
    }
    
    // Update totalChunks for all chunks
    chunks.forEach(chunk => {
      chunk.totalChunks = chunks.length;
    });
    
    return chunks;
  }
  
  /**
   * For Excel files, we'll chunk differently (by rows after parsing)
   */
  static async chunkExcelFile(file: File): Promise<FileChunk[]> {
    // For Excel files, we can't easily chunk the binary data
    // Instead, we'll return the whole file as a single chunk
    // and handle chunking after parsing on the server side
    return [{
      chunk: file,
      chunkIndex: 0,
      totalChunks: 1,
      isFirstChunk: true,
      isLastChunk: true,
      hasHeader: true,
      estimatedRows: 0,
      originalMimeType: file.type
    }];
  }
  
  /**
   * Main chunking method that handles both CSV and Excel
   */
  static async chunkFile(file: File, options?: Partial<ChunkingOptions>): Promise<FileChunk[]> {
    const analysis = await this.analyzeFile(file);
    
    if (!analysis.needsChunking) {
      // Return as single chunk
      return [{
        chunk: file,
        chunkIndex: 0,
        totalChunks: 1,
        isFirstChunk: true,
        isLastChunk: true,
        hasHeader: true,
        estimatedRows: analysis.estimatedRows,
        originalMimeType: file.type
      }];
    }
    
    if (analysis.fileType === 'csv') {
      return this.chunkCSVFile(file, options);
    } else {
      return this.chunkExcelFile(file);
    }
  }
}

/**
 * Progress tracking for chunked uploads
 */
export class ChunkedUploadProgress {
  private chunks: FileChunk[] = [];
  private completedChunks = 0;
  private totalRows = 0;
  private processedRows = 0;
  private errors: string[] = [];
  private warnings: string[] = [];
  
  constructor(chunks: FileChunk[]) {
    this.chunks = chunks;
    this.totalRows = chunks.reduce((sum, chunk) => sum + chunk.estimatedRows, 0);
  }
  
  markChunkComplete(chunkIndex: number, actualRows: number, errors: string[] = [], warnings: string[] = []) {
    this.completedChunks++;
    this.processedRows += actualRows;
    this.errors.push(...errors);
    this.warnings.push(...warnings);
  }
  
  getProgress(): {
    chunksComplete: number;
    totalChunks: number;
    rowsProcessed: number;
    totalRows: number;
    percentComplete: number;
    errors: string[];
    warnings: string[];
    isComplete: boolean;
  } {
    const percentComplete = this.totalRows > 0 ? (this.processedRows / this.totalRows) * 100 : 0;
    
    return {
      chunksComplete: this.completedChunks,
      totalChunks: this.chunks.length,
      rowsProcessed: this.processedRows,
      totalRows: this.totalRows,
      percentComplete: Math.min(percentComplete, 100),
      errors: [...this.errors],
      warnings: [...this.warnings],
      isComplete: this.completedChunks === this.chunks.length
    };
  }
}

export type { FileChunk, ChunkingOptions }; 