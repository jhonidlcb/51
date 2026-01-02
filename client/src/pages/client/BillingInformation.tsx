import { useState } from "react";
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
import { Building2, Save, FileText, AlertCircle, CheckCircle, User, MapPin } from "lucide-react";

interface ClientBillingInfo {
  id?: number;
  clientType: string;
  legalName: string;
  documentType: string;
  documentNumber: string;
  additionalRuc?: string;
  address?: string;
  city?: string;
  department?: string;
  country: string;
  email?: string;
  phone?: string;
  observations?: string;
  isDefault: boolean;
}

// Departamentos y ciudades de Paraguay - Lista completa actualizada según SET
const DEPARTAMENTOS_CIUDADES_PARAGUAY: Record<string, string[]> = {
  'Asunción': ['Asunción'],
  'Alto Paraguay': ['Fuerte Olimpo', 'Bahía Negra', 'Carmelo Peralta', 'Puerto Casado'],
  'Alto Paraná': [
    'Ciudad del Este', 'Presidente Franco', 'Hernandarias', 'Minga Guazú', 'Santa Rita',
    'Juan E. O\'Leary', 'Naranjal', 'San Alberto', 'Santa Rosa del Monday', 'Domingo Martínez de Irala',
    'Doctor Juan León Mallorquín', 'Ñacunday', 'Yguazú', 'Los Cedrales', 'Mbaracayú', 'Tavapy',
    'Itakyry', 'San Cristóbal', 'Iruña', 'Minga Porá', 'Karonay', 'Santa Fe del Paraná',
    'Cedrales', 'Doctor Raúl Peña'
  ],
  'Amambay': [
    'Pedro Juan Caballero', 'Bella Vista', 'Capitán Bado', 'Zanja Pytã', 'Karapaí'
  ],
  'Boquerón': [
    'Filadelfia', 'Loma Plata', 'Mariscal José Félix Estigarribia'
  ],
  'Caaguazú': [
    'Coronel Oviedo', 'Caaguazú', 'Repatriación', 'José Eulogio Estigarribia', 'R.I. 3 Corrales',
    'Nueva Londres', 'San Joaquín', 'San José de los Arroyos', 'Yhu', 'Doctor Juan Manuel Frutos',
    'Raúl Arsenio Oviedo', 'José Domingo Ocampos', 'Mariscal Francisco Solano López', 'La Pastora',
    'Vaquería', 'Carayaó', 'Santa Rosa del Mbutuy', 'Tres de Febrero', 'Simón Bolívar',
    'Tembiapora', 'Nueva Toledo', 'Cecilio Báez'
  ],
  'Caazapá': [
    'Caazapá', 'Abaí', 'Buena Vista', 'Doctor Moisés Santiago Bertoni', 'General Higinio Morínigo',
    'Maciel', 'San Juan Nepomuceno', 'Tavaí', 'Yegros', 'Yuty', 'Fulgencio Yegros', '3 de Mayo'
  ],
  'Canindeyú': [
    'Salto del Guairá', 'Corpus Christi', 'Curuguaty', 'Francisco Caballero Álvarez', 'General Francisco Álvarez',
    'Itanará', 'Katueté', 'La Paloma del Espíritu Santo', 'Nueva Esperanza', 'Villa Ygatimí',
    'Ypejhú', 'Yasy Cañy', 'Yby Pytá', 'Ybyrarobaná', 'Villa Curuguaty'
  ],
  'Central': [
    'Areguá', 'Capiatá', 'Fernando de la Mora', 'Guarambaré', 'Itá', 'Itauguá',
    'Lambaré', 'Limpio', 'Luque', 'Mariano Roque Alonso', 'Ñemby', 'Nueva Italia',
    'San Antonio', 'San Lorenzo', 'Villa Elisa', 'Villeta', 'Ypacaraí', 'Ypané', 'J. Augusto Saldívar'
  ],
  'Concepción': [
    'Concepción', 'Belén', 'Horqueta', 'Loreto', 'San Carlos del Apa', 'San Lázaro',
    'Yby Yaú', 'Azotey', 'Sargento José Félix López', 'San Alfredo', 'Paso Barreto', 'Paso Horqueta'
  ],
  'Cordillera': [
    'Caacupé', 'Altos', 'Arroyos y Esteros', 'Atyrá', 'Caraguatay', 'Emboscada',
    'Eusebio Ayala', 'Isla Pucú', 'Itacurubí de la Cordillera', 'Juan de Mena',
    'Loma Grande', 'Mbocayaty del Yhaguy', 'Nueva Colombia', 'Piribebuy',
    'Primero de Marzo', 'San Bernardino', 'Santa Elena', 'Tobatí', 'Valenzuela', 'San José Obrero'
  ],
  'Guairá': [
    'Villarrica', 'Borja', 'Capitán Mauricio José Troche', 'Coronel Martínez', 'Doctor Bottrell',
    'Félix Pérez Cardozo', 'General Eugenio Alejandrino Garay', 'Independencia', 'Itapé', 'Iturbe',
    'José Fassardi', 'Mbocayaty del Guairá', 'Natalicio Talavera', 'Ñumí', 'San Salvador', 'Yataity del Guairá',
    'Paso Yobái', 'Mauricio José Troche'
  ],
  'Itapúa': [
    'Encarnación', 'Bella Vista', 'Cambyretá', 'Capitán Meza', 'Capitán Miranda', 'Carmen del Paraná',
    'Coronel Bogado', 'Fram', 'General Artigas', 'General Delgado', 'Hohenau', 'Jesús', 'Natalio',
    'Obligado', 'Pirapó', 'San Cosme y Damián', 'San Pedro del Paraná', 'San Rafael del Paraná',
    'Trinidad', 'Edelira', 'Tomás Romero Pereira', 'Carlos Antonio López', 'Mayor Otaño',
    'Nueva Alborada', 'Alto Verá', 'La Paz', 'Yatytay', 'San Juan del Paraná'
  ],
  'Misiones': [
    'San Juan Bautista', 'Ayolas', 'San Ignacio', 'San Miguel', 'San Patricio',
    'Santa María', 'Santa Rosa', 'Santiago', 'Villa Florida', 'Yabebyry'
  ],
  'Ñeembucú': [
    'Pilar', 'Alberdi', 'Cerrito', 'Desmochados', 'General José Eduvigis Díaz',
    'Guazú Cuá', 'Humaitá', 'Isla Umbú', 'Laureles', 'Mayor José de Jesús Martínez',
    'Paso de Patria', 'San Juan Bautista del Ñeembucú', 'Tacuaras', 'Villa Franca',
    'Villa Oliva', 'Villalbín'
  ],
  'Paraguarí': [
    'Paraguarí', 'Acahay', 'Caapucú', 'Caballero', 'Carapeguá', 'Escobar',
    'General Bernardino Caballero', 'La Colmena', 'Mbuyapey', 'Pirayú', 'Quiindy',
    'Quyquyhó', 'Roque González de Santa Cruz', 'Sapucai', 'Tebicuary-mí',
    'Yaguarón', 'Ybycuí', 'Ybytymí'
  ],
  'Presidente Hayes': [
    'Villa Hayes', 'Benjamín Aceval', 'Puerto Pinasco', 'Nanawa', 'José Falcón',
    'Teniente Esteban Martínez', 'Teniente Primero Manuel Irala Fernández', 'General José María Bruguez',
    'Presidente Hayes'
  ],
  'San Pedro': [
    'San Pedro de Ycuamandiyú', 'Antequera', 'Capiibary', 'Choré', 'General Elizardo Aquino',
    'General Francisco Isidoro Resquín', 'Guayaibí', 'Itacurubí del Rosario', 'Lima',
    'Nueva Germania', 'San Estanislao', 'San Pablo', 'Tacuatí', 'Unión', 'Villa del Rosario',
    'Yataity del Norte', 'Yrybucuá', 'Liberación', 'Santa Rosa del Aguaray', 'General Resquín',
    '25 de Diciembre', 'Villa San Pedro'
  ]
};

// Provincias y ciudades principales de Argentina
const PROVINCIAS_CIUDADES_ARGENTINA: Record<string, string[]> = {
  'Buenos Aires': ['Buenos Aires (Capital)', 'La Plata', 'Mar del Plata', 'Bahía Blanca', 'Tandil', 'Quilmes', 'Avellaneda', 'San Isidro', 'Tigre', 'Pilar'],
  'Catamarca': ['San Fernando del Valle de Catamarca', 'Andalgalá', 'Belén', 'Tinogasta', 'Santa María'],
  'Chaco': ['Resistencia', 'Sáenz Peña', 'Villa Ángela', 'Charata', 'General Pinedo'],
  'Chubut': ['Rawson', 'Comodoro Rivadavia', 'Puerto Madryn', 'Trelew', 'Esquel'],
  'Córdoba': ['Córdoba', 'Villa Carlos Paz', 'Río Cuarto', 'Villa María', 'Alta Gracia', 'Bell Ville'],
  'Corrientes': ['Corrientes', 'Goya', 'Paso de los Libres', 'Mercedes', 'Curuzú Cuatiá'],
  'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú', 'Concepción del Uruguay', 'Victoria'],
  'Formosa': ['Formosa', 'Clorinda', 'Pirané', 'El Colorado', 'Ingeniero Juárez'],
  'Jujuy': ['San Salvador de Jujuy', 'Palpalá', 'San Pedro', 'Libertador General San Martín', 'Humahuaca'],
  'La Pampa': ['Santa Rosa', 'General Pico', 'Toay', 'Eduardo Castex', 'General Acha'],
  'La Rioja': ['La Rioja', 'Chilecito', 'Arauco', 'Chamical', 'Aimogasta'],
  'Mendoza': ['Mendoza', 'San Rafael', 'Godoy Cruz', 'Maipú', 'Luján de Cuyo', 'Tunuyán'],
  'Misiones': ['Posadas', 'Puerto Iguazú', 'Oberá', 'Eldorado', 'Puerto Rico'],
  'Neuquén': ['Neuquén', 'San Martín de los Andes', 'Zapala', 'Cutral Có', 'Junín de los Andes'],
  'Río Negro': ['Viedma', 'San Carlos de Bariloche', 'General Roca', 'Cipolletti', 'Villa Regina'],
  'Salta': ['Salta', 'San Ramón de la Nueva Orán', 'Tartagal', 'Metán', 'Cafayate'],
  'San Juan': ['San Juan', 'Rawson', 'Chimbas', 'Caucete', 'Pocito'],
  'San Luis': ['San Luis', 'Villa Mercedes', 'La Punta', 'Merlo', 'Justo Daract'],
  'Santa Cruz': ['Río Gallegos', 'Caleta Olivia', 'Pico Truncado', 'Puerto Deseado', 'El Calafate'],
  'Santa Fe': ['Santa Fe', 'Rosario', 'Rafaela', 'Venado Tuerto', 'Reconquista'],
  'Santiago del Estero': ['Santiago del Estero', 'La Banda', 'Termas de Río Hondo', 'Frías', 'Añatuya'],
  'Tierra del Fuego': ['Ushuaia', 'Río Grande', 'Tolhuin'],
  'Tucumán': ['San Miguel de Tucumán', 'Yerba Buena', 'Tafí Viejo', 'Concepción', 'Aguilares']
};

// Estados y ciudades principales de Brasil
const ESTADOS_CIUDADES_BRASIL: Record<string, string[]> = {
  'Acre': ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá'],
  'Alagoas': ['Maceió', 'Arapiraca', 'Palmeira dos Índios', 'Rio Largo'],
  'Amapá': ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque'],
  'Amazonas': ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru'],
  'Bahia': ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Juazeiro', 'Ilhéus'],
  'Ceará': ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral'],
  'Distrito Federal': ['Brasília'],
  'Espírito Santo': ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Cachoeiro de Itapemirim'],
  'Goiás': ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia'],
  'Maranhão': ['São Luís', 'Imperatriz', 'Caxias', 'Timon', 'Codó'],
  'Mato Grosso': ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra'],
  'Mato Grosso do Sul': ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã'],
  'Minas Gerais': ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros'],
  'Pará': ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Castanhal'],
  'Paraíba': ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux'],
  'Paraná': ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'Foz do Iguaçu'],
  'Pernambuco': ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina'],
  'Piauí': ['Teresina', 'Parnaíba', 'Picos', 'Floriano', 'Piripiri'],
  'Rio de Janeiro': ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Petrópolis'],
  'Rio Grande do Norte': ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba'],
  'Rio Grande do Sul': ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí'],
  'Rondônia': ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Cacoal', 'Vilhena'],
  'Roraima': ['Boa Vista', 'Rorainópolis', 'Caracaraí'],
  'Santa Catarina': ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Criciúma', 'Chapecó'],
  'São Paulo': ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'Ribeirão Preto'],
  'Sergipe': ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana'],
  'Tocantins': ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional']
};

// Combinar todos los datos geográficos
const DATOS_GEOGRAFICOS: Record<string, Record<string, string[]>> = {
  'Paraguay': DEPARTAMENTOS_CIUDADES_PARAGUAY,
  'Argentina': PROVINCIAS_CIUDADES_ARGENTINA,
  'Brasil': ESTADOS_CIUDADES_BRASIL
};

const PAISES_DISPONIBLES = ['Paraguay', 'Argentina', 'Brasil'];

export default function BillingInformation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>('Paraguay');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');

  const { data: billingInfo, isLoading } = useQuery({
    queryKey: ["/api/client/billing-info"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/client/billing-info");
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No tiene datos de facturación aún
        }
        throw new Error('Error al cargar datos de facturación');
      }
      return await response.json();
    },
  });

  const updateBillingInfoMutation = useMutation({
    mutationFn: async (data: ClientBillingInfo) => {
      const method = billingInfo ? "PUT" : "POST";
      const url = billingInfo
        ? `/api/client/billing-info/${billingInfo.id}`
        : "/api/client/billing-info";

      const response = await apiRequest(method, url, data);
      if (!response.ok) throw new Error('Error al guardar datos de facturación');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/client/billing-info"] });
      toast({
        title: "✅ Datos guardados",
        description: "Tus datos de facturación han sido actualizados correctamente",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const data: ClientBillingInfo = {
      clientType: formData.get('clientType') as string,
      legalName: formData.get('legalName') as string,
      documentType: formData.get('documentType') as string,
      documentNumber: formData.get('documentNumber') as string,
      additionalRuc: formData.get('additionalRuc') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      department: formData.get('department') as string,
      country: formData.get('country') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      observations: formData.get('observations') as string,
      isDefault: true,
    };

    updateBillingInfoMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Datos de Facturación">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Datos de Facturación">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Building2 className="h-12 w-12 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground mb-2">Datos de Facturación</h1>
            <p className="text-muted-foreground">
              Configura tus datos completos para la emisión de facturas según normativas SET Paraguay
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
                    <li>• Estos datos aparecerán en todas las facturas que recibas</li>
                    <li>• Son requeridos según normativas SET Paraguay</li>
                    <li>• El email es obligatorio para el envío de facturas en PDF</li>
                    <li>• Asegúrate de que todos los datos sean correctos</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Billing Information Form */}
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
                  Información de Facturación
                </span>
                {billingInfo && !isEditing ? (
                  <Button variant="outline" onClick={() => setIsEditing(true)}>
                    Editar
                  </Button>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {billingInfo && !isEditing ? (
                // Display Mode
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Tipo de Cliente
                      </Label>
                      <p className="font-medium">
                        {billingInfo.clientType === 'persona_fisica' && 'Persona Física'}
                        {billingInfo.clientType === 'empresa' && 'Empresa'}
                        {billingInfo.clientType === 'consumidor_final' && 'Consumidor Final'}
                        {billingInfo.clientType === 'extranjero' && 'Extranjero'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">
                        {billingInfo.clientType === 'empresa' ? 'Razón Social' : 'Nombre Completo'}
                      </Label>
                      <p className="font-medium">{billingInfo.legalName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Documento Principal</Label>
                      <p className="font-medium">{billingInfo.documentType}: {billingInfo.documentNumber}</p>
                    </div>
                    {billingInfo.additionalRuc && (
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">RUC Adicional</Label>
                        <p className="font-medium">{billingInfo.additionalRuc}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                      <p className="font-medium">{billingInfo.email || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Teléfono</Label>
                      <p className="font-medium">{billingInfo.phone || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Ciudad
                      </Label>
                      <p className="font-medium">{billingInfo.city || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Departamento</Label>
                      <p className="font-medium">{billingInfo.department || 'No especificado'}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">País</Label>
                      <p className="font-medium">{billingInfo.country}</p>
                    </div>
                  </div>

                  {billingInfo.address && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Dirección Completa</Label>
                      <p className="font-medium">{billingInfo.address}</p>
                    </div>
                  )}

                  {billingInfo.observations && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Observaciones</Label>
                      <p className="font-medium">{billingInfo.observations}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-800">Datos de facturación configurados correctamente</span>
                  </div>
                </div>
              ) : (
                // Edit/Create Mode
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <Label htmlFor="clientType">Tipo de Cliente *</Label>
                      <Select name="clientType" defaultValue={billingInfo?.clientType || 'persona_fisica'}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo de cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="persona_fisica">Persona Física</SelectItem>
                          <SelectItem value="empresa">Empresa</SelectItem>
                          <SelectItem value="consumidor_final">Consumidor Final</SelectItem>
                          <SelectItem value="extranjero">Extranjero</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="md:col-span-2">
                      <Label htmlFor="legalName">Nombre Completo / Razón Social *</Label>
                      <Input
                        id="legalName"
                        name="legalName"
                        defaultValue={billingInfo?.legalName || ''}
                        placeholder="Nombre completo o razón social según tipo de cliente"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Persona Física: Nombre y Apellido completo | Empresa: Razón Social completa
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="documentType">Tipo de Documento Principal *</Label>
                      <Select name="documentType" defaultValue={billingInfo?.documentType || 'CI'}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo de documento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CI">Cédula de Identidad (CI)</SelectItem>
                          <SelectItem value="RUC">RUC</SelectItem>
                          <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                          <SelectItem value="Documento_Extranjero">Documento Extranjero</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="documentNumber">Número de Documento *</Label>
                      <Input
                        id="documentNumber"
                        name="documentNumber"
                        defaultValue={billingInfo?.documentNumber || ''}
                        placeholder="Número sin puntos ni guiones"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="additionalRuc">RUC Adicional</Label>
                      <Input
                        id="additionalRuc"
                        name="additionalRuc"
                        defaultValue={billingInfo?.additionalRuc || ''}
                        placeholder="RUC adicional (opcional)"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Para personas físicas que también tienen RUC
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="email">Correo Electrónico *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={billingInfo?.email || ''}
                        placeholder="correo@ejemplo.com"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Obligatorio para envío de facturas en PDF
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="phone">Teléfono de Contacto</Label>
                      <Input
                        id="phone"
                        name="phone"
                        defaultValue={billingInfo?.phone || ''}
                        placeholder="+595 9XX XXX XXX"
                      />
                    </div>

                    <div>
                      <Label htmlFor="department">
                        {selectedCountry === 'Paraguay' && 'Departamento'}
                        {selectedCountry === 'Argentina' && 'Provincia'}
                        {selectedCountry === 'Brasil' && 'Estado'}
                      </Label>
                      <Select 
                        name="department" 
                        defaultValue={billingInfo?.department || ''}
                        onValueChange={(value) => setSelectedDepartment(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Selecciona ${selectedCountry === 'Paraguay' ? 'departamento' : selectedCountry === 'Argentina' ? 'provincia' : 'estado'}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(DATOS_GEOGRAFICOS[selectedCountry] || {}).sort().map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="city">Ciudad</Label>
                      <Select 
                        name="city" 
                        defaultValue={billingInfo?.city || ''}
                        disabled={!selectedDepartment && !billingInfo?.department}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={selectedDepartment || billingInfo?.department ? "Selecciona ciudad" : `Primero selecciona ${selectedCountry === 'Paraguay' ? 'departamento' : selectedCountry === 'Argentina' ? 'provincia' : 'estado'}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {(selectedDepartment || billingInfo?.department) && 
                            DATOS_GEOGRAFICOS[selectedCountry]?.[selectedDepartment || billingInfo?.department || '']?.map((ciudad) => (
                              <SelectItem key={ciudad} value={ciudad}>
                                {ciudad}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="country">País</Label>
                      <Select 
                        name="country" 
                        defaultValue={billingInfo?.country || 'Paraguay'}
                        onValueChange={(value) => {
                          setSelectedCountry(value);
                          setSelectedDepartment('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona país" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAISES_DISPONIBLES.map((pais) => (
                            <SelectItem key={pais} value={pais}>
                              {pais}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">Dirección Completa</Label>
                    <Textarea
                      id="address"
                      name="address"
                      defaultValue={billingInfo?.address || ''}
                      placeholder="Calle, número, barrio, referencias"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="observations">Observaciones</Label>
                    <Textarea
                      id="observations"
                      name="observations"
                      defaultValue={billingInfo?.observations || ''}
                      placeholder="Notas adicionales: Sucursal Central, Proyecto Web, etc."
                      rows={2}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    {billingInfo && (
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
                      disabled={updateBillingInfoMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateBillingInfoMutation.isPending ? "Guardando..." : "Guardar Datos"}
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