import React from 'react'

// Keeps a failure in one view from blanking the whole page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Signal Dash view error:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={`view-error ${this.props.className || ''}`} role="alert">
        <p className="kicker">Something went wrong</p>
        <p>This view hit an error. The rest of the page still works.</p>
        {this.props.onReset && (
          <button
            type="button"
            className="btn-light"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset()
            }}
          >
            Back to all companies
          </button>
        )}
      </div>
    )
  }
}
