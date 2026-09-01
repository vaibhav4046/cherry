import { Link } from 'react-router-dom';

export default function NotFound() {
  return <main className="not-found card stack" role="main"><span className="label">404 · Cherry Studio</span><h1 className="display-sm">This page is missing.</h1><p className="subhead">The route may have moved, but your saved work is safe.</p><Link className="btn btn-primary" to="/">Return home</Link></main>;
}
