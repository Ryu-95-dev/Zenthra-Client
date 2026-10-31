import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../state/AppState';

export function TaskTray() {
  const { tasks, toasts, dismissToast } = useApp();
  if (!tasks.length && !toasts.length) return null;

  return (
    <div className="tray" aria-live="polite">
      {tasks.map((t) => (
        <div key={t.taskId} className={`tray-item${t.error ? ' error' : ''}`}>
          <div className="tray-row">
            <span className="tray-label">{t.label}</span>
            {t.progress >= 0 && !t.done && <span className="tray-pct">{Math.round(t.progress * 100)} %</span>}
            {t.cancellable && !t.done && (
              <button className="link-btn tray-cancel" onClick={() => void api.tasks.cancel(t.taskId)}>
                Annuler
              </button>
            )}
          </div>
          {(t.error || t.detail) && <div className="tray-detail">{t.error ?? t.detail}</div>}
          {!t.done && (
            <div className={`progress${t.progress < 0 ? ' indeterminate' : ''}`}>
              <div style={{ width: `${Math.max(0, t.progress) * 100}%` }} />
            </div>
          )}
        </div>
      ))}
      {toasts.map((t) => (
        <div key={t.id} className={`tray-item toast ${t.kind}`}>
          {t.kind === 'error' ? <CircleAlert size={16} /> : t.kind === 'success' ? <CircleCheck size={16} /> : <Info size={16} />}
          <span className="toast-text">{t.text}</span>
          <button className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Fermer">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
