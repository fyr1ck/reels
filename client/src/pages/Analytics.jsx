import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState.jsx';

export default function Analytics() {
  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Métricas de desempenho das suas publicações no Instagram.</p>
      </div>

      <div className="card">
        <EmptyState
          icon={BarChart3}
          title="Analytics do Instagram ainda não disponível"
          description="Esta área vai mostrar visualizações, curtidas, comentários, compartilhamentos, salvamentos e alcance assim que a integração com dados reais do Instagram estiver disponível. Nenhum número é inventado aqui."
        />
      </div>
    </div>
  );
}
