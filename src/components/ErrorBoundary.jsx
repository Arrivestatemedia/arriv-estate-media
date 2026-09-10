import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReload);
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#FFFBF5" }}>
          <div className="max-w-md w-full text-center">
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#1A1A1A" }}>Something went wrong</h2>
            <p className="text-sm mb-6" style={{ color: "rgba(26,26,26,0.6)" }}>
              The page encountered an unexpected error. Try reloading.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
              style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}