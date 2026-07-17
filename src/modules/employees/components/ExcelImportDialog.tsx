import React, {useState, useRef, useCallback} from 'react';
import {Upload, FileSpreadsheet, CheckCircle, AlertCircle, X, Download, Loader2} from 'lucide-react';
import {createCustomField} from '../api';

interface ExcelImportDialogProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{row: number; message: string}>;
  newFields: Array<{fieldKey: string; fieldLabel: string}>;
}

type Step = 'upload' | 'preview' | 'result';

export default function ExcelImportDialog({open, onClose, onComplete}: ExcelImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setResult(null);
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    try {
      const XLSX = await import('xlsx');
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, {type: 'array'});
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {defval: ''});

      if (rows.length > 0) {
        setPreviewHeaders(Object.keys(rows[0]));
        setPreviewRows(rows.slice(0, 5));
        setStep('preview');
      }
    } catch (e) {
      console.error('Failed to parse Excel file', e);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
      handleFileSelect(f);
    }
  }, [handleFileSelect]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('em-box.auth-token') ?? '';
      const resp = await fetch('/api/employees/import/excel', {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`},
        body: formData,
      });

      const data = await resp.json();
      setResult(data as ImportResult);
      setStep('result');
      onComplete();
    } catch (e) {
      console.error('Import failed', e);
      setResult({total: 0, created: 0, updated: 0, skipped: 0, errors: [{row: 0, message: '导入失败，请检查文件格式'}], newFields: []});
      setStep('result');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-fg">导入 Excel</h3>
          <button onClick={handleClose} className="p-1 hover:bg-surface-muted rounded-lg">
            <X className="w-5 h-5 text-fg-faint" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 pt-4 flex items-center gap-2">
          {(['upload', 'preview', 'result'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                step === s ? 'bg-[#1a4bc4] text-white' :
                (['upload', 'preview', 'result'].indexOf(step) > i) ? 'bg-green-100 text-green-600' :
                'bg-surface-muted text-fg-faint'
              }`}>
                {(['upload', 'preview', 'result'].indexOf(step) > i) ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 ${(['upload', 'preview', 'result'].indexOf(step) > i) ? 'bg-green-300' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>
        <div className="px-6 pb-2 flex items-center gap-2 text-xs text-fg-faint">
          <span className="w-7 text-center">上传</span>
          <span className="flex-1" />
          <span className="w-7 text-center">预览</span>
          <span className="flex-1" />
          <span className="w-7 text-center">结果</span>
        </div>

        <div className="px-6 pb-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="mt-4 border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-[#1a4bc4]/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-fg-faint mx-auto mb-3" />
              <p className="text-sm text-fg-secondary">拖拽 Excel 文件到此处，或点击选择</p>
              <p className="text-xs text-fg-faint mt-1">支持 .xlsx / .xls 格式</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="w-4 h-4 text-green-500" />
                <span className="text-fg-secondary font-medium">{file?.name}</span>
                <span className="text-fg-faint">({previewRows.length > 0 ? `${previewRows.length}+ 行` : '空文件'})</span>
              </div>

              <div className="border border-border rounded-lg overflow-auto max-h-60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-muted">
                      {previewHeaders.map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-fg-muted whitespace-nowrap border-r border-border-subtle last:border-r-0">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        {previewHeaders.map(h => (
                          <td key={h} className="px-3 py-1.5 text-fg-secondary whitespace-nowrap border-r border-gray-50 last:border-r-0 max-w-[150px] truncate">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-fg-faint">
                系统将自动匹配已知列（如"姓名"、"邮箱"），未匹配的列将创建为自定义字段。
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="px-5 py-2.5 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {importing ? '导入中...' : '开始导入'}
                </button>
                <button onClick={() => setStep('upload')} className="px-4 py-2.5 border border-border rounded-lg text-sm text-fg-secondary hover:bg-surface-muted">
                  返回
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && result && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                  <div className="text-xs text-green-500 mt-1">更新成功</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                  <div className="text-xs text-amber-500 mt-1">跳过</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{result.total}</div>
                  <div className="text-xs text-blue-500 mt-1">总行数</div>
                </div>
              </div>

              {result.newFields.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-700 mb-1">新增自定义字段</p>
                  <div className="flex flex-wrap gap-1">
                    {result.newFields.map(f => (
                      <span key={f.fieldKey} className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded text-xs">{f.fieldLabel}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> 错误详情
                  </p>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600">第 {e.row} 行: {e.message}</p>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleClose} className="px-5 py-2.5 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a]">
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
