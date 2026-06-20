import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {AlertCircle, Download, Loader2} from 'lucide-react';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfJsModule = typeof import('pdfjs-dist');

export const PublicPdfPreviewPage = () => {
  const [searchParams] = useSearchParams();
  const fileUrl = searchParams.get('file') ?? '';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    setLoading(true);
    setError('');

    if (!fileUrl) {
      setError('缺少 PDF 文件地址');
      setLoading(false);
      return;
    }

    const renderPdf = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist') as PdfJsModule;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

        const response = await fetch(fileUrl, {cache: 'no-store'});
        if (!response.ok) throw new Error(`PDF 加载失败 (${response.status})`);
        const buffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: new Uint8Array(buffer)}).promise;
        const width = Math.min(container.clientWidth || window.innerWidth - 24, 920);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({scale: 1});
          const scale = Math.min(2, width / viewport.width);
          const scaledViewport = page.getViewport({scale});
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('当前浏览器无法创建 PDF 画布');
          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 14px';
          canvas.style.background = '#fff';
          canvas.style.borderRadius = '8px';
          canvas.style.boxShadow = '0 1px 8px rgba(15, 23, 42, 0.08)';
          container.appendChild(canvas);
          await page.render({canvas, canvasContext: context, viewport: scaledViewport}).promise;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'PDF 预览失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [fileUrl]);

  return (
    <div className="min-h-screen bg-gray-100 px-3 py-3">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在生成 PDF 预览...
        </div>
      )}
      {error && (
        <div className="max-w-xl mx-auto bg-white border border-red-100 rounded-xl p-5 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-700">{error}</p>
          {fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm"
            >
              <Download className="w-4 h-4" /> 打开原文件
            </a>
          )}
        </div>
      )}
      <div ref={containerRef} className="max-w-5xl mx-auto" />
    </div>
  );
};

export default PublicPdfPreviewPage;
