/**
 * TYRETRACE — Resilient Error Boundary
 * Prevents blank screen crashes by catching unhandled runtime exceptions
 * and displaying a motorsport recovery interface with auto-recovery and reset options.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TYRETRACE Error Boundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#07090e] text-slate-100 flex flex-col items-center justify-center p-6 font-mono select-none">
          <div className="max-w-xl w-full bg-[#0e1118] border border-rose-500/40 rounded-xl p-6 shadow-2xl shadow-rose-950/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-wider text-rose-300 uppercase">
                  Telemetry Stream Interrupted
                </h1>
                <p className="text-[11px] text-slate-400">
                  Command center recovered from an unexpected rendering exception.
                </p>
              </div>
            </div>

            {/* Error Detail */}
            <div className="bg-[#07090e] border border-[#1b2233] rounded-lg p-3 my-4 overflow-x-auto text-[11px] text-slate-300">
              <p className="text-rose-400 font-semibold mb-1">
                {this.state.error?.name || 'RuntimeError'}: {this.state.error?.message || 'Unknown exception'}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[9px] text-slate-500 leading-tight whitespace-pre-wrap mt-2 font-mono">
                  {this.state.errorInfo.componentStack.trim()}
                </pre>
              )}
            </div>

            {/* Recovery Action Buttons */}
            <div className="flex items-center space-x-3 mt-5">
              <button
                onClick={this.handleDismiss}
                className="flex-1 px-4 py-2 rounded bg-[#161c2b] hover:bg-[#1f283d] border border-[#2b3954] text-xs font-bold text-slate-200 flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>RESUME COMMAND CENTER</span>
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-600/40 text-xs font-bold text-rose-300 flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                <span>RELOAD</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
