import { Code, Mail, Phone, MapPin, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Logo from "./Logo";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export default function Footer() {
  const { data: companyInfo } = useQuery({
    queryKey: ["/api/public/company-info"],
    queryFn: async () => {
      const response = await fetch("/api/public/company-info");
      if (!response.ok) return null;
      return await response.json();
    },
    enabled: true,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });
  const scrollToServices = () => {
    // Si no estamos en la página principal, redirigir primero
    if (window.location.pathname !== '/') {
      window.location.href = '/#servicios';
      return;
    }

    const element = document.getElementById('servicios');
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="bg-muted/30 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <Logo size="md" textClassName="text-foreground" />
              <p className="text-sm text-primary/80 italic mt-2 font-light">
                Innovación local, impacto global
              </p>
            </div>
            <p className="text-muted-foreground mb-6 max-w-md">
              Especialistas en desarrollo de software a medida en Paraguay. 
              Transformamos ideas en aplicaciones exitosas.
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Servicios</h4>
            <ul className="space-y-2">
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Aplicaciones Web
                </button>
              </li>
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Apps Móviles
                </button>
              </li>
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Cloud & DevOps
                </button>
              </li>
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Business Intelligence
                </button>
              </li>
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Ciberseguridad
                </button>
              </li>
              <li>
                <button 
                  onClick={scrollToServices} 
                  className="text-muted-foreground hover:text-primary transition-colors text-left"
                >
                  Soporte 24/7
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Contacto</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex items-center">
                <Mail className="h-4 w-4 mr-2 text-primary" />
                softwarepar.lat@gmail.com
              </li>
              <li className="flex items-center">
                <Phone className="h-4 w-4 mr-2 text-primary" />
                +595 985 990 046
              </li>
              <li className="flex items-center">
                <MapPin className="h-4 w-4 mr-2 text-primary" />
                Itapúa, Carlos Antonio López
              </li>
              <li className="flex items-center">
                <Clock className="h-4 w-4 mr-2 text-primary" />
                Lun - Vie: 9:00 - 18:00
              </li>
            </ul>
          </div>
        </div>

        {/* Payment Methods & Partners */}
        <div className="border-t border-border mt-12 pt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* DNIT Paraguay */}
            <div className="flex flex-col items-center lg:items-start w-full">
              <h5 className="text-foreground font-semibold mb-3 text-center lg:text-left w-full">Facturación Legal</h5>
              {/* Layout móvil: logo arriba, info abajo */}
              <div className="flex flex-col lg:flex-row items-center lg:items-start gap-4 w-full">
                {/* Logo DNIT */}
                <div className="bg-white p-2 rounded-lg shadow-sm flex-shrink-0" style={{ width: '120px' }}>
                  <img 
                    src="https://www.dnit.gov.py/documents/d/global/logo-dnit1-png" 
                    alt="DNIT - Dirección Nacional de Ingresos Tributarios" 
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '50px' }}
                    onError={(e) => {
                      // Fallback al logo local si falla
                      e.currentTarget.src = '/dnit-logo.png';
                    }}
                  />
                </div>
                {/* Información de facturación */}
                <div className="text-sm text-muted-foreground text-center lg:text-left flex-1">
                  <p className="font-semibold text-foreground">
                    {companyInfo?.companyName || "SoftwarePar"}
                  </p>
                  <p>RUC: {companyInfo?.ruc || "En proceso"}</p>
                  <p>Timbrado N°: {companyInfo?.timbradoNumber || "En proceso"}</p>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="flex flex-col items-center">
              <h5 className="text-foreground font-semibold mb-3">Medios de Pago</h5>
              <div className="flex items-center justify-center mb-2">
                <img 
                  src="/medios-pago.png?v=2" 
                  alt="Métodos de pago: Visa, MasterCard, Mango, Ueno, Solar" 
                  className="h-12 object-contain"
                />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Mango Wallet
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Transferencia Bancaria
                </Badge>
              </div>
            </div>

            {/* Technology Partners */}
            <div className="flex flex-col items-center lg:items-end">
              <h5 className="text-foreground font-semibold mb-3 text-center lg:text-right">Partners Tecnológicos</h5>
              <div className="flex flex-col items-center lg:items-end space-y-2">
                <div className="flex items-center space-x-3">
                  <img 
                    src="https://cdn.worldvectorlogo.com/logos/aws-2.svg" 
                    alt="AWS" 
                    className="h-8 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <img 
                    src="https://cdn.worldvectorlogo.com/logos/google-cloud-1.svg" 
                    alt="Google Cloud" 
                    className="h-8 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <img 
                    src="https://cdn.worldvectorlogo.com/logos/microsoft-azure-2.svg" 
                    alt="Microsoft Azure" 
                    className="h-8 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="flex flex-wrap justify-center lg:justify-end gap-2">
                  <Badge variant="outline" className="text-xs">
                    Replit Partner
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Vercel Partner
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center text-muted-foreground">
          <p>&copy; 2025 SoftwarePar. Todos los derechos reservados.</p>
          <p className="mt-2">
            <a href="/terminos" className="hover:text-primary transition-colors">Términos de Servicio</a>
            <span className="mx-2">•</span>
            <a href="/privacidad" className="hover:text-primary transition-colors">Política de Privacidad</a>
            <span className="mx-2">•</span>
            <a href="/cookies" className="hover:text-primary transition-colors">Cookies</a>
          </p>
        </div>
      </div>
    </footer>
  );
}