import {motion} from 'motion/react';
import {AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, Upload, X} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {listProjects} from '../../projects/api';
import {listPositions} from '../../positions/api';
import {importResumes} from '../../talent/api';
import {type Project} from '../../projects/types';
import {type PositionSummary} from '../../positions/types';

export const ResumeImportModal = ({
  isOpen,
  onClose,
  onComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) => {
  const [step, setStep] = useState(1);
  const [jobType, setJobType] = useState('MWV');
  const [isAutoFit, setIsAutoFit] = useState(true);
  const parsingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic project and position data
  const [projects, setProjects] = useState<Project[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [importResult, setImportResult] = useState<{imported: number; failed: number; duplicates: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get selected project and position names
  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || '';
  const selectedPositionName = positions.find(p => p.id === selectedPositionId)?.name || '';

  const resetModalState = () => {
    setStep(1);
    setJobType('MWV');
    setIsAutoFit(true);
    setSelectedProjectId('');
    setSelectedPositionId('');
    setSelectedFiles([]);
    setImportResult(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(files);
    }
  };

  const handleClickSelectFiles = () => {
    fileInputRef.current?.click();
  };

  // Load projects and positions when modal opens
  useEffect(() => {
    if (isOpen) {
      loadProjectAndPositionData();
    }
  }, [isOpen]);

  const loadProjectAndPositionData = async () => {
    setLoadingProjects(true);
    try {
      const [projectsRes, positionsRes] = await Promise.all([
        listProjects(),
        listPositions(),
      ]);
      setProjects(projectsRes);
      setPositions(positionsRes);
      // Auto-select first project if available
      if (projectsRes.length > 0) {
        setSelectedProjectId(projectsRes[0].id);
      }
    } catch (e) {
      console.error('Failed to load projects/positions:', e);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Filter positions by selected project
  const filteredPositions = selectedProjectId
    ? positions.filter(p => p.projectId === selectedProjectId)
    : positions;

  useEffect(() => {
    if (!isOpen) {
      if (parsingTimeoutRef.current) {
        clearTimeout(parsingTimeoutRef.current);
        parsingTimeoutRef.current = null;
      }
      resetModalState();
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (parsingTimeoutRef.current) {
        clearTimeout(parsingTimeoutRef.current);
      }
    },
    [],
  );

  if (!isOpen) return null;

  const handleStartParsing = async () => {
    if (selectedFiles.length === 0) {
      return;
    }
    setStep(2);
    if (parsingTimeoutRef.current) {
      clearTimeout(parsingTimeoutRef.current);
    }
    try {
      const result = await importResumes(selectedFiles, selectedProjectId, selectedPositionId);
      setImportResult(result);
    } catch (e) {
      console.error('Failed to import resumes:', e);
      setImportResult({imported: 0, failed: selectedFiles.length, duplicates: 0});
    }
    parsingTimeoutRef.current = setTimeout(() => {
      setStep(3);
      parsingTimeoutRef.current = null;
    }, 1500);
  };

  const handleClose = () => {
    if (parsingTimeoutRef.current) {
      clearTimeout(parsingTimeoutRef.current);
      parsingTimeoutRef.current = null;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/20 backdrop-blur-sm p-4 md:p-10">
      <motion.div
        initial={{opacity: 0, scale: 0.95, y: 10}}
        animate={{opacity: 1, scale: 1, y: 0}}
        className="bg-white w-full max-w-4xl rounded-2xl shadow-xl flex flex-col max-h-full overflow-hidden"
      >
        <div className="p-6 md:p-8 flex-1 overflow-y-auto">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">批量导入简历</h2>
              <p className="text-gray-500 text-sm">AI 自动解析·最多100份</p>
            </div>
            <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center space-x-4 mb-8">
            <div className="flex items-center text-[#1a4bc4] font-medium">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2 ${step >= 1 ? 'bg-[#1a4bc4] text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
              上传文件
            </div>
            <div className="h-px w-16 bg-[#1a4bc4]"></div>
            <div className={`flex items-center font-medium ${step >= 2 ? 'text-[#1a4bc4]' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2 ${step >= 2 ? 'bg-[#1a4bc4] text-white' : 'border border-gray-300 text-gray-400'}`}>2</div>
              AI 解析中
            </div>
            <div className={`h-px w-16 ${step >= 2 ? 'bg-[#1a4bc4]' : 'bg-gray-200'}`}></div>
            <div className={`flex items-center font-medium ${step >= 3 ? 'text-[#1a4bc4]' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm mr-2 ${step >= 3 ? 'bg-[#1a4bc4] text-white' : 'border border-gray-300 text-gray-400'}`}>3</div>
              查看结果
            </div>
          </div>

          {step === 1 ? (
            <div className="space-y-6">
              <div className="border border-dashed border-[#1a4bc4] rounded-xl bg-white p-10 flex flex-col items-center justify-center text-center">
                <Upload className="w-12 h-12 text-[#1a4bc4] mb-4" strokeWidth={1.5} />
                <div className="text-lg font-bold text-gray-900 mb-1">拖拽 PDF / Word 简历到这里</div>
                <div className="text-gray-500 mb-6 font-normal">
                  或 <button onClick={handleClickSelectFiles} className="text-[#1a4bc4] hover:underline">点击选择文件</button> (最多100份，总大小≤500MB)
                </div>
                <div className="flex space-x-2">
                  <span className="bg-[#E2E8F0] text-gray-600 px-3 py-1 rounded text-sm font-medium">PDF · DOC · DOCX · PNG · JPG</span>
                </div>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#F8FAFC] text-gray-500 text-base border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 font-normal">filename</th>
                      <th className="px-6 py-4 font-normal">size</th>
                      <th className="px-6 py-4 font-normal">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {selectedFiles.length > 0 ? (
                      selectedFiles.map((file) => {
                        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                        
                        return (
                          <tr key={file.name}>
                            <td className="px-6 py-4 text-gray-900 font-medium">{file.name}</td>
                            <td className="px-6 py-4 text-gray-900">{sizeMB}MB</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center text-emerald-600 font-medium">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" /> 已就绪
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                          请选择要导入的简历文件
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {selectedFiles.length > 0 && (
                  <div className="bg-[#F8FAFC] border-t border-gray-200 px-6 py-3 text-sm text-gray-700">
                    已添加 {selectedFiles.length} 份 · <span className="text-emerald-600 font-medium">全部就绪</span>
                  </div>
                )}
              </div>

              <div className="space-y-5 pt-2">
                <div className="flex items-center">
                  <label className="w-32 text-gray-700 font-medium">解析后归入项目 :</label>
                  <div className="relative flex-1 max-w-sm">
                    {loadingProjects ? (
                      <div className="w-full border border-gray-300 rounded-lg py-2 pl-4 text-gray-500 text-sm">
                        加载中...
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedProjectId}
                          onChange={(e) => {
                            setSelectedProjectId(e.target.value);
                            setSelectedPositionId(''); // Reset position when project changes
                          }}
                          className="appearance-none w-full border border-gray-300 rounded-lg py-2 pl-4 pr-10 outline-none text-gray-800 bg-white"
                        >
                          <option value="">选择项目...</option>
                          {projects.map(project => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center">
                  <label className="w-32 text-gray-700 font-medium">主要岗位类型 :</label>
                  <div className="relative flex-1 max-w-sm">
                    {loadingProjects ? (
                      <div className="w-full border border-gray-300 rounded-lg py-2 pl-4 text-gray-500 text-sm">
                        加载中...
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedPositionId}
                          onChange={(e) => setSelectedPositionId(e.target.value)}
                          disabled={!selectedProjectId}
                          className="appearance-none w-full border border-gray-300 rounded-lg py-2 pl-4 pr-10 outline-none text-gray-800 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">选择岗位...</option>
                          {filteredPositions.map(pos => (
                            <option key={pos.id} value={pos.id}>
                              {pos.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center">
                  <label className="w-32 text-gray-700 font-medium">自动触发 Fit Score 评分 :</label>
                  <button onClick={() => setIsAutoFit(!isAutoFit)} className={`w-11 h-6 rounded-full relative transition-colors ${isAutoFit ? 'bg-[#1a4bc4]' : 'bg-gray-200'}`}>
                    <motion.div layout className="absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm" animate={{x: isAutoFit ? 20 : 0}} transition={{type: 'spring', stiffness: 500, damping: 30}} />
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-4 pt-4">
                <button onClick={handleStartParsing} className="bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-10 py-3 rounded-lg font-medium transition-colors flex-1">
                  开始 AI 解析
                </button>
                <button onClick={handleClose} className="px-6 py-3 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                  取消
                </button>
              </div>

              <div className="flex items-center space-x-2 text-gray-500 text-sm pb-2">
                <Info className="w-4 h-4" />
                <span>解析完成后将通知您 · 预计处理时间: 约4分钟</span>
              </div>
            </div>
          ) : step === 2 ? (
            <div className="py-24 flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-[#1a4bc4] animate-spin mb-6" />
              <div className="text-xl font-bold text-gray-900 mb-2">正在通过 AI 提取并分析简历信息...</div>
              <div className="text-gray-500">正在处理 {selectedFiles.length} 份简历...</div>
              <div className="w-full max-w-md bg-gray-100 h-2.5 rounded-full mt-8">
                <motion.div className="bg-[#1a4bc4] h-2.5 rounded-full" initial={{width: '0%'}} animate={{width: '37%'}} transition={{duration: 1}} />
              </div>
            </div>
          ) : (
            <div className="py-16 flex flex-col items-center justify-center">
              {importResult && importResult.failed > 0 ? (
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                  <AlertTriangle className="w-8 h-8 text-amber-600" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              )}
              <div className="text-xl font-bold text-gray-900 mb-2">
                {importResult && importResult.failed > 0 ? '部分完成' : '解析完成'}
              </div>
              <div className="text-gray-500 mb-2 text-center">
                {importResult
                  ? `成功导入 ${importResult.imported} 份${importResult.duplicates > 0 ? `，覆盖 ${importResult.duplicates} 份重复` : ''}${importResult.failed > 0 ? `，${importResult.failed} 份失败` : ''}`
                  : `成功解析 ${selectedFiles.length} 份简历并已归入项目仓库`}
              </div>
              {importResult && importResult.failed > 0 && (
                <div className="text-sm text-amber-600 mb-6 bg-amber-50 px-4 py-2 rounded-lg">
                  失败可能是简历为扫描件/图片格式，可尝试转换为文本 PDF 后重新导入
                </div>
              )}
              <button
                onClick={() => {
                  handleClose();
                  onComplete?.();
                }}
                className="mt-4 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-8 py-3 rounded-lg font-medium transition-colors"
              >
                查看项目简历
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
