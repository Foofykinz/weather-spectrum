import React from 'react';

// Shown instead of a blank page when part of a page can't load (usually a
// dropped connection; see utils/lazyPage). Resets when the page changes.
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="relative z-[60] mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-white">This page didn&apos;t load</h1>
        <p className="mt-2 text-slate-400">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl ws-spectrum px-6 py-2.5 font-semibold text-slate-950"
        >
          Reload
        </button>
      </div>
    );
  }
}
