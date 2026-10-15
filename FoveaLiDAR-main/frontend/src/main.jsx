import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './Dashboard.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('FoveaLidar render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ backgroundColor: '#0B1016', color: '#E7EDF2', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', padding: '2rem' }}>
          <div style={{ color: '#FF5C6C', fontSize: '1.2rem', marginBottom: '1rem' }}>⚠ FoveaLidar — Render Error</div>
          <pre style={{ color: '#8593A1', fontSize: '0.75rem', background: '#111820', padding: '1rem', borderRadius: '6px', maxWidth: '700px', overflow: 'auto', border: '1px solid #26333F' }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '1.5rem', padding: '0.5rem 1.5rem', background: '#59C1B0', color: '#0B1016', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 'bold' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Dashboard />
  </ErrorBoundary>
);
