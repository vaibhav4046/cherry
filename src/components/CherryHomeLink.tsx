import { Link } from 'react-router-dom';

/** The canonical Cherry mark used by every public and Studio masthead. */
export function CherryHomeLink() {
  return (
    <Link to="/" className="logo-mark" aria-label="Cherry home" data-testid="cherry-home-link">
      <img src="/cherry.svg" alt="" width="32" height="32" />
    </Link>
  );
}
