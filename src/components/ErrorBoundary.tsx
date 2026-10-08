import { Component, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

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
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[geoquest] ${this.props.name} crashed:`, error);
  }

  private close = () => {
    this.setState({ failed: false });
    this.props.onClose?.();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash-card" role="alert">
        <AlertTriangle size={18} />
        <div>
          <b>{this.props.name} hit a snag</b>
          <span>The rest of GeoQuest is fine — close this and try again.</span>
        </div>
        <button className="icon-btn" onClick={this.close} aria-label="Close"><X size={16} /></button>
      </div>
    );
  }
}
