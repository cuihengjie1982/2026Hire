import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {AlertCircle, Download, ExternalLink, FileText, Loader2} from 'lucide-react';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfJsModule = typeof import('pdfjs-dist');
type PreviewKind = 'pdf' | 'office' | 'image' | 'text' | 'download';

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv']);

const getExtension = (url: string, explicitType: string) => {
  if (explicitType) return explicitType.toLowerCase().replace(/^\./, '');
  try {
    const parsed = new URL(url, window.location.origin);
    return decodeURIComponent(parsed.pathname).split('.').pop()?.toLowerCase() ?? '';
  } catch {
    return url.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
  }
};

const getPreviewKind = (extension: string): PreviewKind => {
  if (extension === 'pdf') return 'pdf';
  if (OFFICE_EXTENSIONS.has(extension)) return 'office';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  return 'download';
};

export const PublicPdfPreviewPage = () => {
  const [searchParams] = useSearchParams();
  const fileUrl = searchParams.get('file') ?? '';
  const title = searchParams.get('title') ?? '培训文档';
  const extension = getExtension(fileUrl, searchParams.get('type') ?? '');
  const previewKind = getPreviewKind(extension);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    setLoading(true);
    setError('');
    setTextContent('');

    if (!fileUrl) {
      setError('缺少文件地址');
      setLoading(false);
      return;
    }

    if (previewKind === 'office' || previewKind === 'image' || previewKind === 'download') {
      setLoading(false);
      return () => {
        cancelled = true;
        container.innerHTML = '';
      };
    }

    if (previewKind === 'text') {
      fetch(fileUrl, {cache: 'no-store'})
        .then(response => {
          if (!response.ok) throw new Error(`文档加载失败 (${response.status})`);
          return response.text();
        })
        .then(text => {
          if (!cancelled) setTextContent(text);
        })
        .catch(e => {
          if (!cancelled) setError(e instanceof Error ? e.message : '文档预览失败');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
        container.innerHTML = '';
      };
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
  }, [fileUrl, previewKind]);

  const officePreviewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

  return (
    <div className="min-h-screen bg-gray-100 px-3 py-3">
      {fileUrl && (
        <div className="max-w-5xl mx-auto mb-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                {previewKind === 'pdf'
                  ? '下方预览用于兼容微信浏览器。需要最清晰文字时，请打开原始文件。'
                  : previewKind === 'office'
                    ? '下方使用 Office 在线预览，若加载较慢可直接打开或下载原文件。'
                    : '可直接查看、打开或下载该培训文档。'}
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
          正在生成文档预览...
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
      {!loading && !error && previewKind === 'office' && (
        <div className="max-w-5xl mx-auto rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm">
          <iframe
            src={officePreviewUrl}
            title={title}
            className="w-full h-[calc(100vh-128px)] min-h-[620px] bg-white"
          />
        </div>
      )}
      {!loading && !error && previewKind === 'image' && (
        <div className="max-w-5xl mx-auto rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
          <img src={fileUrl} alt={title} className="mx-auto max-h-[calc(100vh-150px)] max-w-full rounded-lg object-contain" />
        </div>
      )}
      {!loading && !error && previewKind === 'text' && (
        <div className="max-w-5xl mx-auto rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{textContent}</pre>
        </div>
      )}
      {!loading && !error && previewKind === 'download' && (
        <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-6 text-center shadow-sm">
          <FileText className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
          <p className="text-base font-semibold text-gray-900">当前文件类型暂不支持内嵌预览</p>
          <p className="mt-2 text-sm text-gray-500">请打开原始文件或下载后查看。</p>
        </div>
      )}
      <div ref={containerRef} className="max-w-5xl mx-auto" />
    </div>
  );
};

export default PublicPdfPreviewPage;
