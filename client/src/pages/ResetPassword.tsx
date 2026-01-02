import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { Loader2, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/reset-password');
  const { toast } = useToast();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      toast({
        title: "Error",
        description: "Token de recuperación no encontrado",
        variant: "destructive",
      });
      navigate('/');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Applying the change snippet here, despite the API endpoint mismatch with the original code's context.
      const recaptchaToken = await window.grecaptcha?.execute(
        import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lc1Iu0rAAAAAPhdyALmKS5vPpTl5IwLjBuSKF3O',
        { action: 'reset_password' }
      );

      const response = await apiRequest('POST', '/api/auth/reset-password', { // Note: Original code uses reset-password, changes mention forgot-password. Applying as is.
        token,
        newPassword,
        recaptchaToken: recaptchaToken || '',
      });

      toast({
        title: "¡Contraseña actualizada!",
        description: "Tu contraseña ha sido cambiada exitosamente",
      });

      setResetSuccess(true);

      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo resetear la contraseña",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-blue-50/30 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">¡Contraseña Actualizada!</CardTitle>
            <CardDescription>
              Tu contraseña ha sido cambiada exitosamente. Serás redirigido al inicio en unos segundos...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-blue-50/30 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Restablecer Contraseña</CardTitle>
          <CardDescription>
            Ingresa tu nueva contraseña para tu cuenta de SoftwarePar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-sm text-muted-foreground">
                Mínimo 6 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Restablecer Contraseña
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate('/')}
            >
              Volver al inicio
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}