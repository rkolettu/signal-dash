import React from 'react'
export default function Footer({ csv }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>
          Signal <i>/</i> Dash — research tool, not investment advice
        </span>
        <span className="footer-links">
          <a href={csv.href} download={csv.download}>
            CSV export
          </a>
          <a href="https://github.com/rkolettu/signal-dash" target="_blank" rel="noopener noreferrer">
            Code ↗
          </a>
          <a href="https://rishabkolettu.vercel.app" target="_blank" rel="noopener noreferrer">
            More projects ↗
          </a>
        </span>
      </div>
    </footer>
  )
}
