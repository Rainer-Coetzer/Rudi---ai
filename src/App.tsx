import { useState, useEffect } from 'react';
import { AppLayout } from './components/AppLayout';
import { GhostOverlay } from './components/GhostOverlay';

function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route === '#/ghost') {
    return <GhostOverlay />;
  }

  return <AppLayout />;
}

export default App;
