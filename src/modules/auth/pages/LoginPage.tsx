import {motion} from 'motion/react';
import {Eye, EyeOff, Megaphone, TrendingUp, UserPlus, X, CheckCircle2} from 'lucide-react';
import React, {useState} from 'react';
import {supabase} from '../../../shared/lib/supabase';
import {setUserName, AUTH_SESSION_STORAGE_KEY, USE_MOCK_API} from '../../../shared/lib/runtime';

export const LoginPage = ({onLogin}: {onLogin: () => void}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [logging, setLogging] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyForm, setApplyForm] = useState({ companyName: '', contactName: '', email: '', phone: '' });
  const [applySubmitted, setApplySubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email || !password) return;

    // In mock mode, just log in directly
    if (USE_MOCK_API) {
      setUserName('Trai');
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'true');
      onLogin();
      return;
    }

    setLogging(true);
    setLoginError('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (authData.user) {
        // Fetch profile to get user name
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', authData.user.id)
          .single();

        if (profile?.name) {
          setUserName(profile.name);
        }
      }
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'true');
      onLogin();
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#0c2b7a] font-sans">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .3) 25%, rgba(255, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .3) 75%, rgba(255, 255, 255, .3) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .3) 25%, rgba(255, 255, 255, .3) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .3) 75%, rgba(255, 255, 255, .3) 76%, transparent 77%, transparent)',
          backgroundSize: '50px 50px',
        }}
      ></div>

      <div className="hidden lg:flex flex-col w-[60%] relative overflow-hidden z-10 border-r border-white/5">
        <div className="px-12 pt-12 text-left mb-16 mt-4 flex items-center">
          <img src="https://api.dicebear.com/9.x/bottts/svg?seed=Felix&backgroundColor=transparent" alt="Bot Logo" className="w-12 h-12 mr-3 drop-shadow-md brightness-110" />
          <h1 className="text-[32px] font-bold text-white tracking-wide font-display">EM-BOX</h1>
        </div>

        <div className="px-12 flex flex-col justify-center z-10 pb-12 mt-12 w-full lg:max-w-4xl mx-auto">
          <h2 className="text-[48px] font-bold text-white mb-6 leading-tight tracking-tight">为具身智能寻找最适合的人</h2>
          <p className="text-white/80 text-[20px] font-light tracking-wide mb-16 flex items-center space-x-3">
            <span className="opacity-90">ITF · ITW · MWV</span>
            <span>三类数据采集岗位专属AI招聘平台</span>
          </p>

          <div className="grid grid-cols-3 gap-6 pr-8">
            <div className="bg-[#1a4bc4] border border-[#1e3a8a] rounded-[24px] p-8 text-white shadow-lg transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 mb-6 text-white flex items-center justify-start opacity-90">
                <UserPlus className="w-8 h-8" />
              </div>
              <div className="text-[24px] font-bold mb-2">智能匹配</div>
              <div className="text-white/70 text-[15px] font-medium">AI 驱动的候选人精准筛选</div>
            </div>

            <div className="bg-[#1a4bc4] border border-[#1e3a8a] rounded-[24px] p-8 text-white shadow-lg transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 mb-6 text-[#9CA3AF] flex items-center justify-start opacity-90">
                <TrendingUp className="w-8 h-8 text-[#5E8DF3]" />
              </div>
              <div className="text-[24px] font-bold mb-2">高效筛选</div>
              <div className="text-white/70 text-[15px] font-medium">自动评分与简历解析引擎</div>
            </div>

            <div className="bg-[#1a4bc4] border border-[#1e3a8a] rounded-[24px] p-8 text-white shadow-lg transition-transform hover:-translate-y-1">
              <div className="w-12 h-12 mb-6 text-white flex items-center justify-start opacity-90">
                <Megaphone className="w-8 h-8" />
              </div>
              <div className="text-[24px] font-bold mb-2">精准推荐</div>
              <div className="text-white/70 text-[15px] font-medium">全流程数字化招聘管理</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[40%] flex items-center justify-center relative z-10">
        <motion.div initial={{opacity: 0, scale: 0.95}} animate={{opacity: 1, scale: 1}} className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl p-10 m-6 border border-gray-100">
          <div className="flex items-center space-x-3 mb-8 lg:hidden justify-center">
            <img src="https://api.dicebear.com/9.x/bottts/svg?seed=Felix&backgroundColor=transparent" alt="Bot Logo" className="w-10 h-10" />
            <h1 className="text-2xl font-bold text-[#0c2b7a] tracking-wider font-display">EM-BOX</h1>
          </div>

          <h2 className="text-[32px] font-bold text-gray-900 mb-8 lg:mt-0 text-center lg:text-left font-display">欢迎回来</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[15px] font-medium text-gray-800">电子邮件地址</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入您的企业邮箱" className="w-full px-4 py-3.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] transition-all text-gray-900 placeholder-gray-400 text-[15px]" />
            </div>

            <div className="space-y-2">
              <label className="block text-[15px] font-medium text-gray-800">密码</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入您的密码" className="w-full px-4 py-3.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] transition-all text-gray-900 placeholder-gray-400 pr-24 text-[15px]" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 flex items-center space-x-1.5 focus:outline-none">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  <span className="text-[15px] font-medium">{showPassword ? '隐藏' : '显示'}</span>
                </button>
              </div>
            </div>

            {loginError && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {loginError}
              </div>
            )}

            <div className="pt-2">
              <button type="submit" disabled={logging} className="w-full py-3.5 bg-gradient-to-r from-[#22d3ee] to-[#1a4bc4] hover:from-[#0891b2] hover:to-[#0c2b7a] text-white rounded-full font-bold text-[16px] tracking-wide transition-colors shadow-lg shadow-[#1a4bc4]/20 disabled:opacity-60 disabled:cursor-not-allowed">
                {logging ? '登录中...' : '登录'}
              </button>
            </div>
          </form>

          <div className="mt-8 mb-8 relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-gray-200 border-dashed"></div>
            </div>
            <div className="relative px-4 bg-white text-gray-400 text-[15px]">或</div>
          </div>

          <div className="text-center space-y-4">
            <button type="button" onClick={() => setShowApplyDialog(true)} className="text-[#3F2E9E] hover:text-[#2D1F7A] font-medium transition-colors text-[16px]">申请企业账号</button>
            <p className="text-[13px] text-gray-400">忘记密码？请联系管理员重置</p>
          </div>
        </motion.div>

        {showApplyDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              {applySubmitted ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <h3 className="text-[18px] font-bold text-gray-900 mb-2">申请已提交</h3>
                  <p className="text-[13px] text-gray-500">我们将在 1-3 个工作日内审核您的申请，并通过邮件通知结果。</p>
                  <button onClick={() => { setShowApplyDialog(false); setApplySubmitted(false); setApplyForm({ companyName: '', contactName: '', email: '', phone: '' }); }} className="mt-5 px-6 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors">关闭</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[18px] font-bold text-gray-900">申请企业账号</h3>
                    <button onClick={() => setShowApplyDialog(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[13px] font-medium text-gray-700 mb-1.5">企业名称</label>
                      <input value={applyForm.companyName} onChange={(e) => setApplyForm(prev => ({ ...prev, companyName: e.target.value }))} placeholder="请输入企业全称" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-gray-700 mb-1.5">联系人姓名</label>
                      <input value={applyForm.contactName} onChange={(e) => setApplyForm(prev => ({ ...prev, contactName: e.target.value }))} placeholder="请输入联系人姓名" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-gray-700 mb-1.5">联系邮箱</label>
                      <input type="email" value={applyForm.email} onChange={(e) => setApplyForm(prev => ({ ...prev, email: e.target.value }))} placeholder="请输入联系邮箱" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-gray-700 mb-1.5">联系电话</label>
                      <input value={applyForm.phone} onChange={(e) => setApplyForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="请输入联系电话" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/30 focus:border-[#22d3ee] placeholder:text-gray-400" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setShowApplyDialog(false)} className="flex-1 px-4 py-2.5 border border-gray-200 hover:bg-gray-50 rounded-lg text-[13px] font-medium text-gray-700 transition-colors">取消</button>
                    <button onClick={() => {
                      if (!applyForm.companyName.trim() || !applyForm.contactName.trim() || !applyForm.email.trim()) return;
                      setApplySubmitted(true);
                    }} disabled={!applyForm.companyName.trim() || !applyForm.contactName.trim() || !applyForm.email.trim()} className="flex-1 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50">提交申请</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
