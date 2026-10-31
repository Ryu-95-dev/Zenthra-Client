import { Minus, Search, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../state/AppState';

export function TitleBar() {
  const { navigate } = useApp();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K focuses the search field from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="titlebar">
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate('modrinth', { query: q.trim() });
        }}
      >
        <Search size={16} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un mod, un resource pack, un modpack…  (Ctrl+K)"
          spellCheck={false}
        />
      </form>
      <div className="drag-space" />
      <div className="window-controls">
        <button onClick={() => api.window.minimize()} aria-label="Réduire">
          <Minus size={16} />
        </button>
        <button onClick={() => api.window.toggleMaximize()} aria-label="Agrandir">
          <Square size={13} />
        </button>
        <button className="close" onClick={() => api.window.close()} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
