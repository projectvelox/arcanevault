import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return React.createElement('div', { style: { padding: 40, color: '#fff', background: '#1a0000', fontFamily: 'monospace', whiteSpace: 'pre-wrap' } },
      React.createElement('h1', { style: { color: '#ff4444' } }, 'App Crash'),
      React.createElement('p', null, String(this.state.error)),
      React.createElement('pre', { style: { fontSize: 11, color: '#aaa', overflow: 'auto' } }, this.state.error?.stack || '')
    );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null,
    React.createElement(React.StrictMode, null,
      React.createElement(App)
    )
  )
)

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
