
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Plus, Edit, Trash2, MoveUp, MoveDown, Image as ImageIcon, Copy } from "lucide-react";
import type { HeroSlide } from "@shared/schema";

export default function HeroSlidesManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<HeroSlide | null>(null);

  const { data: slides, isLoading } = useQuery<HeroSlide[]>({
    queryKey: ["/api/admin/hero-slides"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/hero-slides", {});
      return await response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<HeroSlide>) => {
      const response = await apiRequest("POST", "/api/admin/hero-slides", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-slides"] });
      toast({ title: "Slide creado exitosamente" });
      setIsDialogOpen(false);
      setEditingSlide(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<HeroSlide> }) => {
      const response = await apiRequest("PUT", `/api/admin/hero-slides/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-slides"] });
      toast({ title: "Slide actualizado exitosamente" });
      setIsDialogOpen(false);
      setEditingSlide(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/hero-slides/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-slides"] });
      toast({ title: "Slide eliminado exitosamente" });
    },
  });

  const cloneSlide = (slide: HeroSlide) => {
    // Crear una copia sin el ID para forzar la creación de un nuevo slide
    const { id, createdAt, updatedAt, ...slideData } = slide;
    const clonedSlide = {
      ...slideData,
      title: `${slide.title} (Copia)`,
      displayOrder: (slides?.length || 0) + 1,
    };
    // Establecer editingSlide como null para indicar que es una creación nueva
    // pero pre-llenar el formulario con los datos clonados
    setEditingSlide(null);
    setIsDialogOpen(true);
    
    // Pre-llenar el formulario después de que se abra
    setTimeout(() => {
      const form = document.querySelector('form') as HTMLFormElement;
      if (form) {
        Object.entries(clonedSlide).forEach(([key, value]) => {
          const input = form.elements.namedItem(key) as HTMLInputElement;
          if (input) {
            if (input.type === 'checkbox') {
              input.checked = Boolean(value);
            } else {
              input.value = String(value || '');
            }
          }
        });
      }
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    // Capturar opacidad correctamente - 0 es un valor válido
    const opacityStr = formData.get("backgroundColorOpacity") as string;
    const opacity = opacityStr !== null && opacityStr !== "" ? parseInt(opacityStr) : 100;
    
    const data = {
      title: formData.get("title") as string,
      subtitle: formData.get("subtitle") as string,
      description: formData.get("description") as string,
      imageUrl: formData.get("imageUrl") as string || null,
      mediaType: formData.get("mediaType") as string || "image",
      backgroundColor: formData.get("backgroundColor") as string || null,
      backgroundColorOpacity: opacity,
      buttonText: formData.get("buttonText") as string,
      buttonLink: formData.get("buttonLink") as string,
      displayOrder: parseInt(formData.get("displayOrder") as string) || 0,
      isActive: formData.get("isActive") === "on",
    };

    if (editingSlide) {
      updateMutation.mutate({ id: editingSlide.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <DashboardLayout title="Gestión de Slides Hero">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Slides del Hero Section</h2>
          <Button onClick={() => { setEditingSlide(null); setIsDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Slide
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="text-center py-8">Cargando slides...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Orden</TableHead>
                    <TableHead>Imagen</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slides?.map((slide) => (
                    <TableRow key={slide.id}>
                      <TableCell className="font-medium">{slide.displayOrder}</TableCell>
                      <TableCell>
                        <img 
                          src={slide.imageUrl} 
                          alt={slide.title}
                          className="w-20 h-12 object-cover rounded"
                          onError={(e) => {
                            e.currentTarget.src = "/public/logo-softwarepar.png";
                          }}
                        />
                      </TableCell>
                      <TableCell>{slide.title}</TableCell>
                      <TableCell>
                        {slide.isActive ? (
                          <span className="text-green-600 font-medium">Activo</span>
                        ) : (
                          <span className="text-gray-400">Inactivo</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingSlide(slide); setIsDialogOpen(true); }}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cloneSlide(slide)}
                            title="Clonar"
                          >
                            <Copy className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("¿Eliminar este slide?")) {
                                deleteMutation.mutate(slide.id);
                              }
                            }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSlide ? "Editar Slide" : "Nuevo Slide"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pb-4">
              <div>
                <Label htmlFor="title">Título Principal *</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={editingSlide?.title}
                  required
                />
              </div>

              <div>
                <Label htmlFor="subtitle">Subtítulo</Label>
                <Input
                  id="subtitle"
                  name="subtitle"
                  defaultValue={editingSlide?.subtitle || ""}
                />
              </div>

              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingSlide?.description || ""}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="mediaType">Tipo de Medio</Label>
                <select
                  id="mediaType"
                  name="mediaType"
                  defaultValue={editingSlide?.mediaType || "image"}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="image">Imagen</option>
                  <option value="video">Video</option>
                </select>
              </div>

              <div>
                <Label htmlFor="imageUrl">URL de Medio (opcional)</Label>
                <Input
                  id="imageUrl"
                  name="imageUrl"
                  defaultValue={editingSlide?.imageUrl || ""}
                  placeholder="/public/imagen.jpg o https://video.mp4"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Para imágenes: /public/nombre.jpg - Para videos: URL completa del archivo .mp4
                </p>
              </div>

              <div>
                <Label htmlFor="backgroundColor">Color de Fondo (opcional)</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="backgroundColor"
                    name="backgroundColor"
                    type="color"
                    defaultValue={editingSlide?.backgroundColor || "#3b82f6"}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    defaultValue={editingSlide?.backgroundColor || "#3b82f6"}
                    placeholder="#3b82f6"
                    className="flex-1"
                    onChange={(e) => {
                      const colorInput = document.getElementById('backgroundColor') as HTMLInputElement;
                      if (colorInput) colorInput.value = e.target.value;
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Se usa cuando no hay imagen. Puedes elegir un color o escribir un código hexadecimal.
                </p>
              </div>

              <div>
                <Label htmlFor="backgroundColorOpacity">Opacidad del Color: {editingSlide?.backgroundColorOpacity || 100}%</Label>
                <div className="flex gap-2 items-center">
                  <input
                    id="backgroundColorOpacity"
                    name="backgroundColorOpacity"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue={editingSlide?.backgroundColorOpacity || 100}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    onChange={(e) => {
                      const label = document.querySelector('label[for="backgroundColorOpacity"]');
                      if (label) {
                        label.textContent = `Opacidad del Color: ${e.target.value}%`;
                      }
                    }}
                  />
                  <span className="text-sm font-medium w-12 text-right">{editingSlide?.backgroundColorOpacity || 100}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  0% = Transparente completamente, 100% = Color sólido. Ajusta para controlar cuánto se ve el color encima de la imagen.
                </p>
              </div>

              <div>
                <Label htmlFor="buttonText">Texto del Botón</Label>
                <Input
                  id="buttonText"
                  name="buttonText"
                  defaultValue={editingSlide?.buttonText || ""}
                />
              </div>

              <div>
                <Label htmlFor="buttonLink">Link del Botón</Label>
                <Input
                  id="buttonLink"
                  name="buttonLink"
                  defaultValue={editingSlide?.buttonLink || ""}
                  placeholder="#contacto o /ruta"
                />
              </div>

              <div>
                <Label htmlFor="displayOrder">Orden de Visualización</Label>
                <Input
                  id="displayOrder"
                  name="displayOrder"
                  type="number"
                  defaultValue={editingSlide?.displayOrder || 0}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  name="isActive"
                  defaultChecked={editingSlide?.isActive ?? true}
                />
                <Label htmlFor="isActive">Slide Activo</Label>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingSlide ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
