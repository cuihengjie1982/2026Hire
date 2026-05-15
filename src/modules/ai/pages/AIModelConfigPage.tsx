import {motion, AnimatePresence} from 'motion/react';
import {Cpu, Plus, X, Edit2, Trash2, Check, Loader2, ExternalLink, ChevronDown, Zap, Wifi, WifiOff, Search, RefreshCw} from 'lucide-react';
import {useEffect, useState, useRef} from 'react';
import {listAIModelConfigs, createAIModelConfig, updateAIModelConfig, deleteAIModelConfig, switchActiveModel, getActiveModelConfig, healthCheckConfig} from '../api';
import {type AIModelConfig, type AIProvider, type ConfigHealthStatus} from '../types';
import {ConfirmDialog} from '../../../shared/components/ConfirmDialog';
import {PROVIDER_PRESETS, PROVIDER_BRAND, getProviderBrand, type ProviderPreset} from '../providerPresets';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  deepseek: 'DeepSeek',
  zhipu: '智谱 GLM',
  minimax: 'MiniMax',
  moonshot: 'Kimi (月之暗面)',
  qwen: '通义千问',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
};

const PROVIDER_COLORS: Record<AIProvider, string> = {
  deepseek: 'bg-cyan-100 text-cyan-700',
  zhipu: 'bg-violet-100 text-violet-700',
  minimax: 'bg-pink-100 text-pink-700',
  moonshot: 'bg-indigo-100 text-indigo-700',
  qwen: 'bg-orange-100 text-orange-700',
  openai: 'bg-emerald-100 text-emerald-700',
  anthropic: 'bg-purple-100 text-purple-700',
  gemini: 'bg-blue-100 text-blue-700',
};

const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  deepseek: 'deepseek-chat',
  zhipu: 'glm-4-flash',
  minimax: 'MiniMax-M1',
  moonshot: 'moonshot-v1-128k',
  qwen: 'qwen-max',
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
};

export const AIModelConfigPage = () => {
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [switchLoading, setSwitchLoading] = useState<string | null>(null);
  const [healthStatuses, setHealthStatuses] = useState<Record<string, ConfigHealthStatus>>({});
  const [showPresets, setShowPresets] = useState(false);
  const [showSwitchDropdown, setShowSwitchDropdown] = useState(false);
  const switchRef = useRef<HTMLDivElement>(null);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider: 'openai' as AIProvider,
    model_name: '',
    api_key: '',
    base_url: '',
    temperature: 0.7,
    max_tokens: 4096,
    is_default: false,
  });

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Error/success toast
  const [toast, setToast] = useState<{type: 'success' | 'error'; text: string} | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({type, text});
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadConfigs();
    loadActiveConfig();
  }, []);

  // Close switch dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) {
        setShowSwitchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await listAIModelConfigs();
      setConfigs(data);
    } catch (e) {
      console.error('Failed to load AI model configs:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveConfig = async () => {
    try {
      const {active} = await getActiveModelConfig();
      setActiveConfigId(active?.id ?? null);
    } catch {
      // non-critical
    }
  };

  const handleSwitch = async (configId: string) => {
    setSwitchLoading(configId);
    setShowSwitchDropdown(false);
    try {
      const result = await switchActiveModel(configId);
      setActiveConfigId(configId);
      if (result.envWarning) {
        showToast('error', result.envWarning);
      } else {
        showToast('success', '已切换模型，配置已写入 .env');
      }
      await loadConfigs();
    } catch (e) {
      showToast('error', `切换失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setSwitchLoading(null);
    }
  };

  const handleHealthCheck = async (configId: string) => {
    setActionLoading(`health-${configId}`);
    try {
      const result = await healthCheckConfig(configId);
      setHealthStatuses(prev => ({
        ...prev,
        [configId]: {
          configId,
          healthy: result.healthy,
          latencyMs: result.latencyMs,
          error: result.error,
          checkedAt: new Date().toISOString(),
        },
      }));
    } catch (e) {
      setHealthStatuses(prev => ({
        ...prev,
        [configId]: {
          configId,
          healthy: false,
          latencyMs: 0,
          error: (e as Error).message,
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setActionLoading(null);
    }
  };

  const openCreate = (preset?: ProviderPreset) => {
    setEditingId(null);
    setForm({
      name: preset?.name ?? '',
      provider: preset?.provider ?? 'openai',
      model_name: preset?.model_name ?? PROVIDER_DEFAULT_MODELS.openai,
      api_key: '',
      base_url: preset?.base_url ?? '',
      temperature: preset?.temperature ?? 0.7,
      max_tokens: preset?.max_tokens ?? 4096,
      is_default: false,
    });
    setShowDialog(true);
  };

  const openEdit = (config: AIModelConfig) => {
    setEditingId(config.id);
    setForm({
      name: config.name,
      provider: config.provider,
      model_name: config.model_name,
      api_key: '',
      base_url: config.base_url ?? '',
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      is_default: config.is_default,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.model_name.trim()) return;
    if (!editingId && !form.api_key.trim()) {
      showToast('error', '请输入 API Key');
      return;
    }

    setActionLoading('_save');
    try {
      if (editingId) {
        const updateInput: Record<string, unknown> = {
          name: form.name,
          provider: form.provider,
          model_name: form.model_name,
          base_url: form.base_url || null,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          is_default: form.is_default,
        };
        if (form.api_key.trim()) {
          updateInput.api_key = form.api_key;
        }
        await updateAIModelConfig(editingId, updateInput);
        showToast('success', '配置已更新');
      } else {
        await createAIModelConfig({
          name: form.name,
          provider: form.provider,
          model_name: form.model_name,
          api_key: form.api_key,
          base_url: form.base_url || undefined,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          is_default: form.is_default,
        });
        showToast('success', 'AI 模型配置已创建');
      }
      setShowDialog(false);
      await loadConfigs();
    } catch (e) {
      showToast('error', `保存失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setActionLoading(deleteConfirmId);
    try {
      await deleteAIModelConfig(deleteConfirmId);
      showToast('success', '配置已删除');
      setDeleteConfirmId(null);
      await loadConfigs();
    } catch (e) {
      showToast('error', `删除失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (config: AIModelConfig) => {
    setActionLoading(config.id);
    try {
      await updateAIModelConfig(config.id, {is_active: !config.is_active});
      await loadConfigs();
    } catch (e) {
      showToast('error', `操作失败: ${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const activeConfig = configs.find(c => c.id === activeConfigId);
  const activeCount = configs.filter(c => c.is_active).length;

  // Group presets by category
  const presetCategories = Array.from(new Set(PROVIDER_PRESETS.map(p => p.category)));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header + Active Model Switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900">AI 模型配置</h2>
          <p className="text-[13px] text-gray-500 mt-0.5">
            管理和切换 AI 模型配置，支持一键切换并写入 .env。
            {activeCount > 0 && <span className="ml-2 text-emerald-600 font-medium">{activeCount} 个已激活</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Model Switcher */}
          <div ref={switchRef} className="relative">
            <button
              onClick={() => setShowSwitchDropdown(!showSwitchDropdown)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                activeConfig
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {activeConfig ? (
                <>
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span>{activeConfig.name}</span>
                  <span className="text-[11px] text-emerald-500 font-mono">{activeConfig.model_name}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-gray-400" />
                  <span>未选择模型</span>
                </>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSwitchDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showSwitchDropdown && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-gray-200 shadow-lg z-50 py-1 max-h-80 overflow-y-auto">
                <div className="px-3 py-2 text-[11px] text-gray-400 font-medium uppercase tracking-wider">选择模型</div>
                {configs.filter(c => c.is_active).length === 0 ? (
                  <div className="px-3 py-4 text-[13px] text-gray-400 text-center">暂无已激活的配置</div>
                ) : (
                  configs.filter(c => c.is_active).map(config => (
                    <button
                      key={config.id}
                      onClick={() => config.id !== activeConfigId && handleSwitch(config.id)}
                      disabled={switchLoading !== null}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors ${
                        config.id === activeConfigId
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        config.id === activeConfigId ? 'bg-emerald-500' : 'bg-gray-300'
                      }`} />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{config.name}</div>
                        <div className="text-[11px] text-gray-400 font-mono">{config.model_name}</div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PROVIDER_COLORS[config.provider]}`}>
                        {PROVIDER_LABELS[config.provider]}
                      </span>
                      {switchLoading === config.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />}
                      {config.id === activeConfigId && !switchLoading && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加配置
          </button>
        </div>
      </div>

      {/* Provider Presets Section */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 rounded-t-xl transition-colors"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-[14px] font-semibold text-gray-800">快速添加预设模型</span>
            <span className="text-[11px] text-gray-400">— {PROVIDER_PRESETS.length} 个预设可选</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showPresets && (
            <motion.div
              initial={{height: 0, opacity: 0}}
              animate={{height: 'auto', opacity: 1}}
              exit={{height: 0, opacity: 0}}
              transition={{duration: 0.2}}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4 space-y-4">
                {presetCategories.map(category => {
                  const presets = PROVIDER_PRESETS.filter(p => p.category === category);
                  const brand = PROVIDER_BRAND[presets[0]?.icon ?? category.toLowerCase()] ?? PROVIDER_BRAND[category.toLowerCase()];
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        {brand && (
                          <span className={`w-5 h-5 rounded text-[11px] font-bold flex items-center justify-center ${brand.bg} ${brand.color}`}>
                            {brand.letter}
                          </span>
                        )}
                        <span className="text-[12px] font-semibold text-gray-600">{category}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {presets.map(preset => {
                          const presetBrand = PROVIDER_BRAND[preset.icon];
                          return (
                            <button
                              key={preset.id}
                              onClick={() => openCreate(preset)}
                              className={`flex flex-col items-start p-3 rounded-lg border transition-all hover:shadow-sm text-left ${
                                presetBrand
                                  ? `${presetBrand.bg} hover:shadow`
                                  : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <span className={`text-[13px] font-semibold ${presetBrand?.color ?? 'text-gray-800'}`}>
                                {preset.name}
                              </span>
                              {preset.description && (
                                <span className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{preset.description}</span>
                              )}
                              <span className="text-[10px] font-mono text-gray-400 mt-1">{preset.model_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Config Cards */}
      {configs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-[15px] font-semibold text-gray-700 mb-2">尚未配置 AI 模型</h3>
          <p className="text-[13px] text-gray-500 mb-6 max-w-md mx-auto">
            点击上方预设快速添加，或手动配置 OpenAI、Anthropic、Gemini 等模型。
          </p>
          <button
            onClick={() => setShowPresets(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[13px] font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            从预设开始
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((config) => {
            const brand = PROVIDER_BRAND[getProviderBrand(config.provider)];
            const health = healthStatuses[config.id];
            const isSwitching = switchLoading === config.id;
            const isHealthChecking = actionLoading === `health-${config.id}`;
            const isActive = config.id === activeConfigId;

            return (
              <motion.div
                key={config.id}
                initial={{opacity: 0, y: 8}}
                animate={{opacity: 1, y: 0}}
                className={`bg-white rounded-xl border p-5 transition-all hover:shadow-sm ${
                  isActive ? 'border-emerald-300 ring-1 ring-emerald-200' :
                  config.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      brand ? brand.bg : (
                        config.provider === 'openai' ? 'bg-emerald-50' :
                        config.provider === 'anthropic' ? 'bg-purple-50' : 'bg-blue-50'
                      )
                    }`}>
                      <span className={`text-[14px] font-bold ${
                        brand ? brand.color : (
                          config.provider === 'openai' ? 'text-emerald-600' :
                          config.provider === 'anthropic' ? 'text-purple-600' : 'text-blue-600'
                        )
                      }`}>
                        {brand?.letter ?? (config.provider === 'openai' ? 'O' : config.provider === 'anthropic' ? 'A' : 'G')}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-[14px] font-semibold text-gray-900">{config.name}</h4>
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            当前
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${PROVIDER_COLORS[config.provider]}`}>
                          {brand?.label ?? PROVIDER_LABELS[config.provider]}
                        </span>
                        <span className="text-[12px] text-gray-400 font-mono">{config.model_name}</span>
                        {/* Health indicator */}
                        {health && (
                          <span className={`flex items-center gap-1 text-[10px] ${
                            health.healthy ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {health.healthy ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {health.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleHealthCheck(config.id)}
                      disabled={isHealthChecking}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      title="健康检查"
                    >
                      {isHealthChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => openEdit(config)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(config.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-[12px] text-gray-500 mb-3">
                  <div className="flex justify-between">
                    <span>API Key</span>
                    <span className="font-mono text-gray-400">{config.api_key_display}</span>
                  </div>
                  {config.base_url && (
                    <div className="flex justify-between">
                      <span>Base URL</span>
                      <span className="font-mono text-gray-400 truncate max-w-[200px]">{config.base_url}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Temperature / Max Tokens</span>
                    <span className="text-gray-600">{config.temperature} / {config.max_tokens}</span>
                  </div>
                  {health?.error && (
                    <div className="text-red-500 text-[11px] truncate">{health.error}</div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  {!isActive && config.is_active && (
                    <button
                      onClick={() => handleSwitch(config.id)}
                      disabled={isSwitching}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#1a4bc4] text-white hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
                    >
                      {isSwitching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      切换到此模型
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(config)}
                    disabled={actionLoading === config.id}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                      config.is_active
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {actionLoading === config.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : config.is_active ? (
                      <Check className="w-3 h-3" />
                    ) : null}
                    {config.is_active ? '已激活' : '已停用'}
                  </button>
                  {config.is_default && (
                    <span className="px-2 py-1 bg-[#1a4bc4]/5 text-[#1a4bc4] rounded text-[10px] font-medium">默认</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.96}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-gray-900">
                {editingId ? '编辑模型配置' : '添加模型配置'}
              </h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">配置名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(prev => ({...prev, name: e.target.value}))}
                  placeholder="如：生产环境 OpenAI"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">模型提供商</label>
                <select
                  value={form.provider}
                  onChange={(e) => {
                    const provider = e.target.value as AIProvider;
                    setForm(prev => ({
                      ...prev,
                      provider,
                      model_name: PROVIDER_DEFAULT_MODELS[provider],
                      base_url: '',
                    }));
                  }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4] bg-white"
                >
                  <optgroup label="国内主流">
                    <option value="deepseek">DeepSeek</option>
                    <option value="zhipu">智谱 GLM</option>
                    <option value="minimax">MiniMax</option>
                    <option value="moonshot">Kimi (月之暗面)</option>
                    <option value="qwen">通义千问</option>
                  </optgroup>
                  <optgroup label="国际">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                  </optgroup>
                </select>
              </div>

              {/* Model Name */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">模型名称</label>
                <input
                  value={form.model_name}
                  onChange={(e) => setForm(prev => ({...prev, model_name: e.target.value}))}
                  placeholder="如：gpt-4o, claude-sonnet-4-20250514"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  输入模型 ID，如 gpt-4o、claude-opus-4-20250514、gemini-2.5-flash
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  API Key {editingId && <span className="text-gray-400 font-normal">（留空则不修改）</span>}
                </label>
                <input
                  type="password"
                  value={form.api_key}
                  onChange={(e) => setForm(prev => ({...prev, api_key: e.target.value}))}
                  placeholder={editingId ? '留空不修改现有密钥' : 'sk-...'}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  API Key 将加密存储在服务器数据库中，前端不会暴露明文。
                </p>
              </div>

              {/* Base URL (optional) */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Base URL <span className="text-gray-400 font-normal">（可选，用于兼容 API 代理）</span>
                </label>
                <input
                  value={form.base_url}
                  onChange={(e) => setForm(prev => ({...prev, base_url: e.target.value}))}
                  placeholder="默认使用官方地址，自定义代理请填写"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                />
              </div>

              {/* Temperature + Max Tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">
                    Temperature <span className="text-gray-400 font-normal">({form.temperature})</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={form.temperature}
                    onChange={(e) => setForm(prev => ({...prev, temperature: parseFloat(e.target.value)}))}
                    className="w-full accent-[#1a4bc4]"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>精确</span><span>平衡</span><span>创意</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Max Tokens</label>
                  <input
                    type="number"
                    value={form.max_tokens}
                    onChange={(e) => setForm(prev => ({...prev, max_tokens: parseInt(e.target.value) || 4096}))}
                    min={256}
                    max={128000}
                    step={256}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] focus:border-[#1a4bc4]"
                  />
                </div>
              </div>

              {/* Default toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm(prev => ({...prev, is_default: e.target.checked}))}
                  className="w-4 h-4 accent-[#1a4bc4]"
                />
                <span className="text-[13px] text-gray-700">设为默认配置（切换时将写入 .env）</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-lg text-[13px] font-medium text-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.model_name.trim() || (!editingId && !form.api_key.trim()) || actionLoading === '_save'}
                className="flex-1 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === '_save' && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? '保存修改' : '创建配置'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="删除模型配置"
        message={`确定要删除此 AI 模型配置吗？使用该配置的岗位将回退到默认配置。`}
        confirmText="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};
