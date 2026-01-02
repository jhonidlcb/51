import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Building2, Save, FileText, AlertCircle, CheckCircle } from "lucide-react";

interface CompanyBillingInfo {
  id?: number;
  companyName: string;
  titularName?: string;
  ruc: string;
  address: string;
  city: string;
  department?: string;
  country: string;
  phone?: string;
  email?: string;
  website?: string;
  taxRegime?: string;
  economicActivity?: string;
  logoUrl?: string;
  timbradoNumber?: string;
  vigenciaTimbrado?: string;
  vencimientoTimbrado?: string;
  boletaPrefix?: string;
  boletaSequence?: number;
  isActive: boolean;
}

export default function CompanyBillingInfo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: companyInfo, isLoading } = useQuery({
    queryKey: ["/api/admin/company-billing-info"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/company-billing-info");
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No tiene datos de empresa aún
        }
        throw new Error('Error al cargar datos de la empresa');
      }
      return await response.json();
    },
  });

  const updateCompanyInfoMutation = useMutation({
    mutationFn: async (data: CompanyBillingInfo) => {
      const method = companyInfo ? "PUT" : "POST";
      const url = companyInfo
        ? `/api/admin/company-billing-info/${companyInfo.id}`
        : "/api/admin/company-billing-info";

      const response = await apiRequest(method, url, data);
      if (!response.ok) throw new Error('Error al guardar datos de la empresa');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/company-billing-info"] });
      toast({
        title: "✅ Datos guardados",
        description: "Los datos de facturación de la empresa han sido actualizados correctamente",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error al guardar",
        description: error.message || "No se pudieron guardar los datos",
        variant: "destructive",
      });
    },
  });

  const [formData, setFormData] = useState({
    companyName: '',
    titularName: '',
    ruc: '',
    address: '',
    city: '',
    department: 'Itapúa',
    country: 'Paraguay',
    phone: '',
    email: '',
    website: '',
    taxRegime: '',
    economicActivity: '',
    logoUrl: '',
    timbradoNumber: '',
    vigenciaTimbrado: '',
    vencimientoTimbrado: '',
    boletaPrefix: '001-001',
    boletaSequence: 1,
    ivaPercentage: 10.00,
  });

  // Update form data when company info is loaded
  useEffect(() => {
    if (companyInfo) {
      setFormData({
        companyName: companyInfo.companyName || '',
        titularName: companyInfo.titularName || '',
        ruc: companyInfo.ruc || '',
        address: companyInfo.address || '',
        city: companyInfo.city || '',
        department: companyInfo.department || 'Itapúa',
        country: companyInfo.country || 'Paraguay',
        phone: companyInfo.phone || '',
        email: companyInfo.email || '',
        website: companyInfo.website || '',
        taxRegime: companyInfo.taxRegime || '',
        economicActivity: companyInfo.economicActivity || '',
        logoUrl: companyInfo.logoUrl || '',
        timbradoNumber: companyInfo.timbradoNumber || '',
        vigenciaTimbrado: companyInfo.vigenciaTimbrado || '',
        vencimientoTimbrado: companyInfo.vencimientoTimbrado || '',
        boletaPrefix: companyInfo.boletaPrefix || '001-001',
        boletaSequence: companyInfo.boletaSequence || 1,
        ivaPercentage: companyInfo.ivaPercentage || 10.00,
      });
    }
  }, [companyInfo]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CompanyBillingInfo = {
      ...formData,
      isActive: true,
    };

    console.log('Submitting company info:', data);
    updateCompanyInfoMutation.mutate(data);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'boletaSequence' ? parseInt(value) || 1 : 
               field === 'ivaPercentage' ? parseFloat(value) || 10.00 : value
    }));
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Datos de la Empresa">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Datos de Facturación - Empresa">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {companyInfo?.logoUrl ? (
              <img src={companyInfo.logoUrl} alt="Company Logo" className="h-16 w-16 mx-auto mb-4" />
            ) : (
              <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
            )}
            <h1 className="text-3xl font-bold text-foreground mb-2">Datos de Facturación</h1>
            <p className="text-muted-foreground">
              Configura los datos de la empresa para emisión de facturas según normativas SET Paraguay
            </p>
          </motion.div>
        </div>

        {/* Alert Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Información importante:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Estos datos aparecerán en todas las facturas emitidas por la empresa</li>
                    <li>• Son requeridos según normativas SET Paraguay</li>
                    <li>• RUC debe estar registrado ante la SET</li>
                    <li>• Los datos deben coincidir con la inscripción en RUC</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Company Information Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Datos de la Empresa
                </span>
                {companyInfo && !isEditing ? (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Editar
                  </Button>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {companyInfo && !isEditing ? (
                // Display Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Titular</Label>
                      <p className="font-medium">{companyInfo.titularName || companyInfo.companyName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">RUC</Label>
                      <p className="font-medium">{companyInfo.ruc}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Ciudad</Label>
                      <p className="font-medium">{companyInfo.city}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Departamento</Label>
                      <p className="font-medium">{companyInfo.department || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">País</Label>
                      <p className="font-medium">{companyInfo.country}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Teléfono</Label>
                      <p className="font-medium">{companyInfo.phone || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                      <p className="font-medium">{companyInfo.email || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Sitio Web</Label>
                      <p className="font-medium">{companyInfo.website || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Régimen Tributario</Label>
                      <p className="font-medium">{companyInfo.taxRegime || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">IVA (%)</Label>
                      <p className="font-medium">{companyInfo.ivaPercentage || '10.00'}%</p>
                    </div>
                  </div>

                  {companyInfo.address && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Dirección</Label>
                      <p className="font-medium">{companyInfo.address}</p>
                    </div>
                  )}

                  {companyInfo.economicActivity && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Actividad Económica</Label>
                      <p className="font-medium">{companyInfo.economicActivity}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-800">Datos de la empresa configurados correctamente</span>
                  </div>
                </div>
              ) : (
                // Edit/Create Mode
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="companyName">Nombre de la Empresa *</Label>
                      <Input
                        id="companyName"
                        name="companyName"
                        value={formData.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                        placeholder="SoftwarePar S.R.L."
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="titularName">Nombre del Titular</Label>
                      <Input
                        id="titularName"
                        name="titularName"
                        value={formData.titularName}
                        onChange={(e) => handleInputChange('titularName', e.target.value)}
                        placeholder="Nombre completo del titular de la empresa"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Este nombre aparecerá como "Titular:" en las facturas RESIMPLE
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="ruc">RUC *</Label>
                      <Input
                        id="ruc"
                        name="ruc"
                        value={formData.ruc}
                        onChange={(e) => handleInputChange('ruc', e.target.value)}
                        placeholder="80001234-5"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="city">Ciudad *</Label>
                      <Input
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="Carlos Antonio López"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="department">Departamento</Label>
                      <Select
                        value={formData.department}
                        onValueChange={(value) => handleInputChange('department', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Itapúa">Itapúa</SelectItem>
                          <SelectItem value="Central">Central</SelectItem>
                          <SelectItem value="Alto Paraná">Alto Paraná</SelectItem>
                          <SelectItem value="Asunción">Asunción</SelectItem>
                          <SelectItem value="Cordillera">Cordillera</SelectItem>
                          <SelectItem value="Guairá">Guairá</SelectItem>
                          <SelectItem value="Caaguazú">Caaguazú</SelectItem>
                          <SelectItem value="Paraguarí">Paraguarí</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="country">País</Label>
                      <Select
                        value={formData.country}
                        onValueChange={(value) => handleInputChange('country', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona país" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Paraguay">Paraguay</SelectItem>
                          <SelectItem value="Argentina">Argentina</SelectItem>
                          <SelectItem value="Brasil">Brasil</SelectItem>
                          <SelectItem value="Uruguay">Uruguay</SelectItem>
                          <SelectItem value="Chile">Chile</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+595 XXX XXX XXX"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="info@empresa.com"
                      />
                    </div>

                    <div>
                      <Label htmlFor="website">Sitio Web</Label>
                      <Input
                        id="website"
                        name="website"
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        placeholder="https://www.empresa.com"
                      />
                    </div>

                    <div>
                      <Label htmlFor="taxRegime">Régimen Tributario</Label>
                      <Select
                        value={formData.taxRegime}
                        onValueChange={(value) => handleInputChange('taxRegime', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona régimen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pequeño Contribuyente - RESIMPLE">Pequeño Contribuyente - RESIMPLE</SelectItem>
                          <SelectItem value="Régimen General">Régimen General</SelectItem>
                          <SelectItem value="Régimen Simplificado">Régimen Simplificado</SelectItem>
                          <SelectItem value="Régimen de Pequeño Contribuyente">Régimen de Pequeño Contribuyente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">Dirección Completa *</Label>
                    <Textarea
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                      placeholder="Barrio Residencial, referencias específicas (sin incluir ciudad)"
                      rows={3}
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      No incluir ciudad ni departamento aquí, se muestran por separado
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="economicActivity">Actividad Económica</Label>
                    <Input
                      id="economicActivity"
                      name="economicActivity"
                      value={formData.economicActivity}
                      onChange={(e) => handleInputChange('economicActivity', e.target.value)}
                      placeholder="Desarrollo de software y sistemas informáticos"
                    />
                  </div>

                  <div>
                    <Label htmlFor="logoUrl">URL del Logo</Label>
                    <Input
                      id="logoUrl"
                      name="logoUrl"
                      value={formData.logoUrl}
                      onChange={(e) => handleInputChange('logoUrl', e.target.value)}
                      placeholder="https://ejemplo.com/logo.png"
                    />
                  </div>

                  {/* Sección de Timbrado y Boleta */}
                  <div className="border-t pt-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Información de Timbrado y Boleta (DNIT Paraguay)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="timbradoNumber">Timbrado N° *</Label>
                        <Input
                          id="timbradoNumber"
                          name="timbradoNumber"
                          value={formData.timbradoNumber}
                          onChange={(e) => handleInputChange('timbradoNumber', e.target.value)}
                          placeholder="556454566"
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Número de timbrado otorgado por DNIT Paraguay (aparece en el footer)
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="vigenciaTimbrado">Vigencia del Timbrado</Label>
                        <Input
                          id="vigenciaTimbrado"
                          name="vigenciaTimbrado"
                          value={formData.vigenciaTimbrado}
                          onChange={(e) => handleInputChange('vigenciaTimbrado', e.target.value)}
                          placeholder="01/10/2025"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Fecha de inicio de vigencia (dd/mm/aaaa)
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="vencimientoTimbrado">Vencimiento del Timbrado</Label>
                        <Input
                          id="vencimientoTimbrado"
                          name="vencimientoTimbrado"
                          value={formData.vencimientoTimbrado}
                          onChange={(e) => handleInputChange('vencimientoTimbrado', e.target.value)}
                          placeholder="30/09/2027"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Fecha de vencimiento del timbrado (dd/mm/aaaa)
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="boletaPrefix">Prefijo de Boleta</Label>
                        <Input
                          id="boletaPrefix"
                          name="boletaPrefix"
                          value={formData.boletaPrefix}
                          onChange={(e) => handleInputChange('boletaPrefix', e.target.value)}
                          placeholder="001-001"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Prefijo fijo para numeración de boletas
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="boletaSequence">Número Secuencial Actual</Label>
                        <Input
                          id="boletaSequence"
                          name="boletaSequence"
                          type="number"
                          value={formData.boletaSequence}
                          onChange={(e) => handleInputChange('boletaSequence', e.target.value)}
                          placeholder="1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Próximo número de boleta (auto-incrementa con cada factura)
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="ivaPercentage">Porcentaje de IVA (%)</Label>
                        <Input
                          id="ivaPercentage"
                          name="ivaPercentage"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={formData.ivaPercentage}
                          onChange={(e) => handleInputChange('ivaPercentage', e.target.value)}
                          placeholder="10.00"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Porcentaje de IVA aplicable a las facturas (ej: 10.00 para 10%)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    {companyInfo && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={updateCompanyInfoMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateCompanyInfoMutation.isPending ? "Guardando..." : "Guardar Datos"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}