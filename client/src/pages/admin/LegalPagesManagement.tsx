
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { FileText, Save, Eye } from "lucide-react";

export default function LegalPagesManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: legalPages, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-legal-pages"],
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/admin/legal-pages");
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Error loading legal pages:", errorText);
          return [];
        }
        const data = await response.json();
        console.log("Legal pages loaded:", data);
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.error("Error fetching legal pages:", err);
        return [];
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const updatePageMutation = useMutation({
    mutationFn: async ({ pageType, updates }: { pageType: string; updates: any }) => {
      const response = await apiRequest("PUT", `/api/admin/legal-pages/${pageType}`, updates);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/legal-pages"] });
      toast({
        title: "Página actualizada",
        description: "El contenido ha sido guardado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la página",
        variant: "destructive",
      });
    },
  });

  const [editingPages, setEditingPages] = useState<Record<string, any>>({});

  const handleSave = (pageType: string) => {
    const page = editingPages[pageType] || normalizedPages?.find((p: any) => p.pageType === pageType);
    
    const updates = {
      title: page?.title || '',
      content: page?.content || '',
    };

    // Validar que haya contenido
    if (!updates.title || !updates.content) {
      toast({
        title: "Error",
        description: "El título y contenido son requeridos",
        variant: "destructive",
      });
      return;
    }

    updatePageMutation.mutate({
      pageType,
      updates,
    });
  };

  const handleEdit = (pageType: string, field: string, value: string) => {
    setEditingPages((prev) => ({
      ...prev,
      [pageType]: {
        ...(prev[pageType] || legalPages?.find((p: any) => p.pageType === pageType)),
        [field]: value,
      },
    }));
  };

  const getPageData = (pageType: string) => {
    return editingPages[pageType] || normalizedPages?.find((p: any) => p.pageType === pageType) || {
      pageType: pageType,
      title: '',
      content: '',
      updatedAt: null
    };
  };

  const pageConfigs = [
    { type: "terms", label: "Términos y Condiciones", icon: FileText },
    { type: "privacy", label: "Política de Privacidad", icon: FileText },
    { type: "cookies", label: "Política de Cookies", icon: FileText },
  ];

  // Normalizar datos de páginas para asegurar consistencia
  const normalizedPages = (legalPages || []).map((page: any) => ({
    ...page,
    pageType: page.pageType || page.page_type
  }));

  if (isLoading) {
    return (
      <DashboardLayout title="Gestión de Páginas Legales" subtitle="Cargando contenido...">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded w-1/3"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout title="Gestión de Páginas Legales" subtitle="Error al cargar">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <p className="text-destructive">Error al cargar las páginas legales.</p>
              <p className="text-sm text-muted-foreground">
                Por favor, verifica la conexión con la base de datos.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  // Permitir edición incluso si no hay datos - se crearán al guardar
  const hasData = legalPages && legalPages.length > 0;

  return (
    <DashboardLayout title="Gestión de Páginas Legales">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Contenido Legal</h1>
          <p className="text-muted-foreground mt-2">
            Administra el contenido de las páginas legales del sitio web
          </p>
        </div>

        <Tabs defaultValue="terms" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {pageConfigs.map((config) => (
              <TabsTrigger key={config.type} value={config.type}>
                <config.icon className="h-4 w-4 mr-2" />
                {config.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {pageConfigs.map((config) => {
            const pageData = getPageData(config.type);
            return (
              <TabsContent key={config.type} value={config.type} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{config.label}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/${config.type}`, "_blank")}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Vista previa
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSave(config.type)}
                          disabled={updatePageMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {updatePageMutation.isPending ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    </CardTitle>
                    <CardDescription>
                      Última actualización: {pageData.updatedAt ? new Date(pageData.updatedAt).toLocaleString() : 'Nunca'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor={`title-${config.type}`}>Título de la Página</Label>
                      <Input
                        id={`title-${config.type}`}
                        value={pageData.title || ""}
                        onChange={(e) => handleEdit(config.type, "title", e.target.value)}
                        placeholder="Título de la página"
                      />
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor={`content-${config.type}`}>Contenido HTML</Label>
                        <Textarea
                          id={`content-${config.type}`}
                          value={pageData.content || ""}
                          onChange={(e) => handleEdit(config.type, "content", e.target.value)}
                          placeholder="Contenido en formato HTML"
                          rows={20}
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Usa HTML para dar formato al contenido. Ejemplo: {'<h2>Título</h2>, <p>Párrafo</p>, <ul><li>Lista</li></ul>'}
                        </p>
                      </div>

                      <div className="border rounded-lg p-4 bg-muted/50">
                        <h4 className="font-semibold mb-2">Vista previa del contenido:</h4>
                        <div
                          className="prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: pageData.content || "" }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
