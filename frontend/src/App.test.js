import { render, screen } from '@testing-library/react';
import App from './App';

// Was CRA boilerplate asserting text ("learn react") that nothing in this
// app ever renders - it always failed (docs/10-known-issues.md P4-5). This
// is a minimal smoke test instead: mounting <App/> exercises the router,
// AuthProvider and the landing page in one pass, so a crash anywhere in
// that chain fails it. The logo's alt text is stable, rendered branding
// (components/Navbar.js) rather than an assumption about page copy.
test('renders the app shell without crashing', () => {
  render(<App />);
  // getAllBy*, not getBy*: the landing route renders the branding logo in more
  // than one place. One or more matches is enough to prove the router,
  // AuthProvider and landing page mounted without throwing.
  expect(screen.getAllByAltText(/sledge/i).length).toBeGreaterThan(0);
});
