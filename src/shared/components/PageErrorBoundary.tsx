import {AlertTriangle, RefreshCw} from 'lucide-react';
import {Component, type ErrorInfo, type ReactNode} from 'react';

type Props = {
  children: ReactNode;
  pageName?: string;
};

type State = {hasError: boolean};

export class PageErrorBoundary extends Component<Props, State> {
  declare state: State;
  declare props: Props;
  setState: Component<Props, State>['setState'];

  constructor(props: Props) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError(): State {
    return {hasError: true};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[PageErrorBoundary] ${this.props.pageName ?? 'page'} error:`, error, info.componentStack?.slice(0, 300));
  }

  handleRetry = () => {
    this.setState({hasError: false});
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="max-w-[1500px] mx-auto w-full p-6">
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" strokeWidth={1.5} />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {this.props.pageName ? `${this.props.pageName} 加载失败` : '页面加载失败'}
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            此页面遇到了一个错误，请尝试重新加载。如果问题持续出现，请联系系统管理员。
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      </div>
    );
  }
}
