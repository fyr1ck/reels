const CONFIG = {
  ACTIVE: { dot: 'dot-success', badge: 'badge-success', label: 'Ativa' },
  PAUSED: { dot: 'dot-danger', badge: 'badge-danger', label: 'Pausada' },
  INTERVENTION_REQUIRED: { dot: 'dot-warning', badge: 'badge-warning', label: 'Aguardando intervenção' },
};

export default function AutomationBadge({ status }) {
  const cfg = CONFIG[status] || CONFIG.PAUSED;
  return (
    <span className={`badge ${cfg.badge}`}>
      <span className={`dot ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
