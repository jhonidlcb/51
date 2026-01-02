
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from './ui/badge';
import { DollarSign, TrendingUp, RefreshCw, AlertCircle, Wifi } from 'lucide-react';

interface ExchangeRate {
  usdToGuarani: string;
  isDefault: boolean;
  updatedAt: string;
  updatedBy?: number;
}

export default function ExchangeRateConfig() {
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null);
  const [newRate, setNewRate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isFetchingAPI, setIsFetchingAPI] = useState(false);
  const { toast } = useToast();

  const fetchCurrentRate = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/exchange-rate', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentRate(data);
        setNewRate(data.usdToGuarani);
      } else {
        throw new Error('Error al obtener tipo de cambio');
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      toast({
        title: 'Error',
        description: 'No se pudo obtener el tipo de cambio actual',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFromAPI = async () => {
    try {
      setIsFetchingAPI(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/exchange-rate/fetch-from-api', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNewRate(data.rate);
        toast({
          title: '🌐 Tipo de cambio obtenido',
          description: `Tasa actual: 1 USD = ₱ ${parseFloat(data.rate).toLocaleString('es-PY')}`,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al obtener tipo de cambio desde API');
      }
    } catch (error) {
      console.error('Error fetching from API:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo obtener el tipo de cambio desde la API',
        variant: 'destructive'
      });
    } finally {
      setIsFetchingAPI(false);
    }
  };

  const updateExchangeRate = async () => {
    if (!newRate || isNaN(parseFloat(newRate))) {
      toast({
        title: 'Error',
        description: 'Por favor ingresa un tipo de cambio válido',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsUpdating(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/exchange-rate', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          usdToGuarani: newRate
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentRate(data);
        toast({
          title: 'Tipo de cambio actualizado',
          description: `Nuevo tipo de cambio: 1 USD = ₱ ${parseFloat(newRate).toLocaleString('es-PY')}`,
        });
        await fetchCurrentRate(); // Refrescar datos
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al actualizar tipo de cambio');
      }
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el tipo de cambio',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchCurrentRate();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Rate Display */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <DollarSign className="h-6 w-6" />
            Tipo de Cambio Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentRate && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-700">
                    ₱ {parseFloat(currentRate.usdToGuarani).toLocaleString('es-PY')}
                  </div>
                  <div className="text-sm text-green-600">por cada 1 USD</div>
                </div>
                <div className="flex items-center gap-2">
                  {currentRate.isDefault && (
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Valor por defecto
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-green-700 border-green-300">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Activo
                  </Badge>
                </div>
              </div>
              
              {!currentRate.isDefault && (
                <div className="text-sm text-green-600 bg-white p-3 rounded-lg border border-green-200">
                  <p><strong>Última actualización:</strong> {new Date(currentRate.updatedAt).toLocaleString('es-PY')}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update Rate Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Actualizar Tipo de Cambio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">💡 Información importante:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Actualización automática:</strong> Usa el botón "Obtener Tasa Actual (API)" para obtener el tipo de cambio en tiempo real</li>
                <li>• Este tipo de cambio se aplicará a todos los pagos nuevos</li>
                <li>• Los clientes verán el monto en guaraníes al momento de pagar</li>
                <li>• El cambio afecta inmediatamente a todo el sistema</li>
                <li>• Fuente de datos: ExchangeRate-API.com (actualizado diariamente)</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exchangeRate">Nuevo Tipo de Cambio (PYG por USD)</Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  placeholder="7300.00"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  step="0.01"
                  min="1"
                />
                <p className="text-xs text-gray-500">
                  Ingresa cuántos guaraníes equivalen a 1 dólar americano
                </p>
              </div>

              <div className="space-y-2">
                <Label>Vista previa del cálculo</Label>
                <div className="bg-gray-50 p-3 rounded-lg border">
                  <div className="text-sm text-gray-600">Ejemplo: $100 USD =</div>
                  <div className="text-lg font-bold text-gray-800">
                    ₱ {newRate ? (100 * parseFloat(newRate)).toLocaleString('es-PY') : '0'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={fetchFromAPI}
                disabled={isFetchingAPI}
                variant="secondary"
                className="flex items-center gap-2"
              >
                {isFetchingAPI ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Obteniendo...
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4" />
                    Obtener Tasa Actual (API)
                  </>
                )}
              </Button>

              <Button
                onClick={updateExchangeRate}
                disabled={isUpdating || !newRate || isNaN(parseFloat(newRate))}
                className="flex items-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Actualizar Tipo de Cambio
                  </>
                )}
              </Button>
              
              <Button
                onClick={fetchCurrentRate}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refrescar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-amber-800 mb-1">
                💡 Recomendaciones para el tipo de cambio
              </h4>
              <div className="text-sm text-amber-700 space-y-1">
                <p>• Consulta el tipo de cambio oficial del Banco Central del Paraguay</p>
                <p>• Considera agregar un pequeño margen por fluctuaciones</p>
                <p>• Actualiza regularmente para mantener precios justos</p>
                <p>• Verifica que el tipo de cambio esté dentro del rango normal (6.000 - 8.000 PYG/USD)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
