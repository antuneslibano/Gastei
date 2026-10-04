import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; onReset?: () => void; resetKey?: unknown }
interface State { error: Error | null; info?: string }

/** Evita a tela vazia: se uma tela quebrar, mostra o erro e permite voltar. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ info: info.componentStack?.split('\n').filter(Boolean).slice(0, 4).join('\n') });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, info: undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen" style={{ paddingTop: 'calc(16px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))' }}>
        <div className="card col">
          <h2>😕 Algo deu errado nesta tela</h2>
          <div className="small muted">Seus dados estão salvos. Tire um print desta mensagem e envie para o suporte.</div>
          <pre className="tiny" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>
            {String(this.state.error?.message || this.state.error)}
            {this.state.info ? `\n${this.state.info}` : ''}
            {`\nv${__APP_VERSION__} · ${navigator.userAgent}`}
          </pre>
          <button className="btn" onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}>Voltar ao início</button>
        </div>
      </div>
    );
  }
}
