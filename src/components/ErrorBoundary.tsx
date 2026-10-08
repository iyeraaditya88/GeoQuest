import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, X } from 'lucide-react';
import { isChunkError } from '../lib/chunks';

interface Props {
  /** What this area is, for the message ("Street View", "Capitals"…) */
  name: string;
  /** Close the feature (e.g. exit the game); the boundary resets too. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * Keeps one feature's crash from taking the whole app down: the globe and everything else stay
 * up, and this area shows a small card instead.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean; stale: boolean }> {
  state = { failed: false, stale: false };

  static getDerivedStateFromError(error: unknown) {
    // A newer GeoQuest was deployed while this tab was open: only a reload fixes that.
    return { failed: true, stale: isChunkError(error) };
  }

  componentDidCatch(error: unknown) {
    console.error(`[geoquest] ${this.props.name} crashed:`, error);
  }

  private close = () => {
    this.setState({ failed: false, stale: false });
    this.props.onClose?.();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash-card" role="alert">
        <AlertTriangle size={18} />
        <div>
          <b>{this.state.stale ? 'GeoQuest was updated' : `${this.props.name} hit a snag`}</b>
          <span>{this.state.stale ? `Reload to get the new version, then open ${this.props.name} again.` : 'The rest of GeoQuest is fine — close this and try again.'}</span>
        </div>
        {this.state.stale && <button className="ap-btn gold" onClick={() => location.reload()}><RotateCw size={14} /> Reload</button>}
        <button className="icon-btn" onClick={this.close} aria-label="Close"><X size={16} /></button>
      </div>
    );
  }
}
