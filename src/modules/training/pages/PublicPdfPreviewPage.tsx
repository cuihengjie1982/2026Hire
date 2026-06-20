import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {AlertCircle, Download, ExternalLink, Loader2} from 'lucide-react';
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
          const scale = width / viewport.width;
          const scaledViewport = page.getViewport({scale});
          const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('当前浏览器无法创建 PDF 画布');
          canvas.width = Math.floor(scaledViewport.width * outputScale);
          canvas.height = Math.floor(scaledViewport.height * outputScale);
          canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = `${Math.floor(scaledViewport.height)}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 14px';
          canvas.style.background = '#fff';
          canvas.style.borderRadius = '8px';
          canvas.style.boxShadow = '0 1px 8px rgba(15, 23, 42, 0.08)';
          container.appendChild(canvas);
          await page.render({
            canvas,
            canvasContext: context,
            viewport: scaledViewport,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
          }).promise;
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
      {fileUrl && (
        <div className="max-w-5xl mx-auto mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">PDF 兼容预览</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                下方预览用于兼容微信浏览器。需要最清晰文字时，请打开原始 PDF。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
              >
                <ExternalLink className="h-4 w-4" /> 高清打开原文
              </a>
              <a
                href={fileUrl}
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
              >
                <Download className="h-4 w-4" /> 下载原文
              </a>
            </div>
          </div>
        </div>
      )}
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
              <ExternalLink className="w-4 h-4" /> 高清打开原文
            </a>
          )}
        </div>
      )}
      <div ref={containerRef} className="max-w-5xl mx-auto" />
    </div>
  );
};

export default PublicPdfPreviewPage;
