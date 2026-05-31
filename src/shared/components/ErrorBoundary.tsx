import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { navigateToPage } from '../../navigation';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicit declarations required because React 19 does not ship separate
  // type declarations and `useDefineForClassFields: false` prevents inference.
  declare state: ErrorBoundaryState;
  declare props: ErrorBoundaryProps;
  setState: Component<ErrorBoundaryProps, ErrorBoundaryState>['setState'];

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error);
    if (errorInfo.componentStack) {
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleReload(): void {
    window.location.reload();
  }

  handleGoHome(): void {
    this.setState({ hasError: false });
    navigateToPage('search');
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] p-6">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Illustration */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-amber-500" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            页面出了点问题
          </h1>

          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            抱歉，页面遇到了一个意外错误。您可以尝试重新加载页面，或返回首页继续操作。
          </p>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => this.handleReload()}
              className="
                px-5 py-2.5 rounded-xl text-sm font-medium text-white
                bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors
                shadow-sm shadow-[#1a4bc4]/20
              "
            >
              重新加载
            </button>
            <button
              onClick={() => this.handleGoHome()}
              className="
                px-5 py-2.5 rounded-xl text-sm font-medium text-[#1a4bc4]
                bg-white hover:bg-gray-50 transition-colors
                border border-gray-200 shadow-sm
                dark:bg-gray-800 dark:border-gray-700 dark:text-blue-300
              "
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }
}
