
import ExchangeRateConfig from '../../components/ExchangeRateConfig';
import DashboardLayout from '../../components/DashboardLayout';

export default function ExchangeRateAdmin() {
  return (
    <DashboardLayout title="Configuración del Tipo de Cambio">
      <ExchangeRateConfig />
    </DashboardLayout>
  );
}
