import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLogin, useRegister } from "@/hooks/useAuth";
import { UserPlus, LogIn, Loader2, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/api";

// Declarar reCAPTCHA en window
declare global {
  interface Window {
    grecaptcha: any;
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  // Cargar script de reCAPTCHA
  useEffect(() => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lc1Iu0rAAAAAPhdyALmKS5vPpTl5IwLjBuSKF3O';
    const scriptSrc = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.onload = () => setRecaptchaLoaded(true);

    if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
      document.body.appendChild(script);
    } else {
      setRecaptchaLoaded(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("🔐 Login form submitted:", loginData.email);

    try {
      // Execute reCAPTCHA
      console.log("🤖 Executing reCAPTCHA...");
      const recaptchaToken = await window.grecaptcha?.execute(
        import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lc1Iu0rAAAAAPhdyALmKS5vPpTl5IwLjBuSKF3O',
        { action: 'login' }
      );
      console.log("✅ reCAPTCHA token obtained");

      console.log("📤 Sending login request...");
      const result = await loginMutation.mutateAsync({
        email: loginData.email,
        password: loginData.password,
        recaptchaToken: recaptchaToken || '',
      });

      console.log("✅ Login successful, user:", result.user);

      toast({
        title: "Inicio de sesión exitoso",
        description: `Bienvenido de vuelta, ${result.user.fullName}`,
      });

      onClose();
    } catch (error: any) {
      console.error("❌ Login error in form:", error);
      toast({
        title: "Error de inicio de sesión",
        description: error.message || "Credenciales inválidas. Por favor verifica tu email y contraseña.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await registerMutation.mutateAsync(registerData);
      toast({
        title: "Registro exitoso",
        description: "Tu cuenta ha sido creada",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Error de registro",
        description: "No se pudo crear la cuenta",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Verificar reCAPTCHA
      if (!recaptchaLoaded || !window.grecaptcha) {
        toast({
          title: "Error de seguridad",
          description: "Por favor, espera un momento e intenta de nuevo",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6Lc1Iu0rAAAAAPhdyALmKS5vPpTl5IwLjBuSKF3O';
      const recaptchaToken = await window.grecaptcha.execute(
        siteKey,
        { action: 'forgot_password' }
      );

      const response = await apiRequest('POST', '/api/auth/forgot-password', {
        email: forgotEmail,
        recaptchaToken
      });

      toast({
        title: "Email enviado",
        description: "Si el email existe, recibirás instrucciones para recuperar tu contraseña",
      });

      setForgotEmail('');
      setMode('login');
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo procesar la solicitud",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'login' ? 'Acceso para Clientes' : 'Recuperar Contraseña'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'login' 
              ? 'Inicia sesión con las credenciales proporcionadas por nuestro equipo'
              : 'Ingresa tu email para recibir instrucciones de recuperación'
            }
          </DialogDescription>
        </DialogHeader>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="tu@email.com"
                value={loginData.email}
                onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={loginData.password}
                onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                required
              />
            </div>

            <Button 
              type="button"
              variant="link" 
              className="w-full text-sm text-primary hover:underline p-0 h-auto"
              onClick={() => setMode('forgot')}
            >
              ¿Olvidaste tu contraseña?
            </Button>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Iniciar Sesión
                </>
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="tu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Enviar Instrucciones
                  </>
                )}
              </Button>

              <Button 
                type="button"
                variant="ghost" 
                className="w-full"
                onClick={() => setMode('login')}
              >
                Volver al inicio de sesión
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}