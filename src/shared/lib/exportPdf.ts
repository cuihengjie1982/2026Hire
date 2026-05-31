import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Render a DOM element to a downloadable PDF.
 * Handles multi-page splitting automatically.
 *
 * @param element  The DOM element to render
 * @param filename Download filename (without .pdf extension)
 * @param options  Optional config
 */
export const exportElementToPdf = async (
  element: HTMLElement,
  filename: string,
  options?: {
    /** JPEG quality, 0-1. Default 0.92 */
    quality?: number;
    /** Scale factor for canvas rendering. Default 2 (retina). */
    scale?: number;
    /** Page margin in px. Default 20. */
    margin?: number;
  },
): Promise<void> => {
  const quality = options?.quality ?? 0.92;
  const scale = options?.scale ?? 2;
  const margin = options?.margin ?? 20;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
  });

  const imgData = canvas.toDataURL('image/jpeg', quality);
  const imgW = canvas.width;
  const imgH = canvas.height;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;

  const contentScale = usableW / imgW;
  const scaledPageH = usableH / contentScale;

  let srcY = 0;
  let pageNum = 0;

  while (srcY < imgH) {
    if (pageNum > 0) pdf.addPage();

    const sliceH = Math.min(scaledPageH, imgH - srcY);
    const destH = sliceH * contentScale;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = imgW;
    sliceCanvas.height = sliceH;
    sliceCanvas.getContext('2d')!.drawImage(
      canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH,
    );
    const sliceData = sliceCanvas.toDataURL('image/jpeg', quality);

    pdf.addImage(sliceData, 'JPEG', margin, margin, usableW, destH);
    srcY += sliceH;
    pageNum++;
  }

  pdf.save(`${filename}.pdf`);
};

/**
 * Render a DOM element to a downloadable PNG image.
 */
export const exportElementToPng = async (
  element: HTMLElement,
  filename: string,
  options?: { scale?: number },
): Promise<void> => {
  const scale = options?.scale ?? 2;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
  });

  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};
