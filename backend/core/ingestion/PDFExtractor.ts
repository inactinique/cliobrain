/**
 * PDFExtractor - Extract text from PDF files using pdfjs-dist
 *
 * Uses the legacy build compatible with Node.js/Electron.
 * Canvas is stubbed to prevent native module crashes.
 */

import fs from 'fs';
import { createRequire } from 'module';

let pdfjsLib: any = null;

export interface PDFPage {
  pageNumber: number;
  text: string;
}

export interface PDFExtractionResult {
  pages: PDFPage[];
  fullText: string;
  pageCount: number;
  metadata: Record<string, string>;
}

// Stub canvas to prevent native module loading in Node.js
function stubCanvas(): void {
  try {
    const require = createRequire(import.meta.url);
    const mockCanvas = {
      createCanvas: () => ({
        getContext: () => ({
          fillRect: () => {},
          drawImage: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: () => {},
          createImageData: () => ({ data: new Uint8ClampedArray(0) }),
          setTransform: () => {},
          translate: () => {},
          scale: () => {},
          save: () => {},
          restore: () => {},
          beginPath: () => {},
          closePath: () => {},
          clip: () => {},
          fill: () => {},
          stroke: () => {},
          moveTo: () => {},
          lineTo: () => {},
          transform: () => {},
          rect: () => {},
        }),
        width: 0,
        height: 0,
      }),
      createImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
    };

    try {
      const canvasPath = require.resolve('canvas');
      require.cache[canvasPath] = {
        id: canvasPath,
        filename: canvasPath,
        loaded: true,
        exports: mockCanvas,
        parent: null,
        children: [],
        paths: [],
        path: canvasPath,
      } as any;
    } catch {
      // canvas not installed, no need to stub
    }
  } catch {
    // Ignore stub errors
  }
}

async function initPdfjs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;

  stubCanvas();
  const require = createRequire(import.meta.url);
  pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  return pdfjsLib;
}

export class PDFExtractor {
  /**
   * Extract text from a PDF file, page by page
   */
  async extract(filePath: string): Promise<PDFExtractionResult> {
    const pdfjs = await initPdfjs();

    const fileBuffer = fs.readFileSync(filePath);
    const data = new Uint8Array(fileBuffer);

    const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
    const pdfDocument = await loadingTask.promise;

    const pages: PDFPage[] = [];
    const metadata: Record<string, string> = {};

    // Extract metadata
    try {
      const meta = await pdfDocument.getMetadata();
      if (meta?.info) {
        const info = meta.info as any;
        if (info.Title) metadata.title = info.Title;
        if (info.Author) metadata.author = info.Author;
        if (info.Subject) metadata.subject = info.Subject;
        if (info.Creator) metadata.creator = info.Creator;
        if (info.CreationDate) metadata.creationDate = info.CreationDate;
      }
    } catch {
      // Metadata extraction can fail on some PDFs
    }

    // Extract text page by page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({ pageNumber: pageNum, text });
    }

    const fullText = pages.map(p => p.text).join('\n\n');

    return {
      pages,
      fullText,
      pageCount: pdfDocument.numPages,
      metadata,
    };
  }
}

export const pdfExtractor = new PDFExtractor();
