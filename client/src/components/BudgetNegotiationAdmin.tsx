import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { formatWithPyg, type ExchangeRate } from "@/lib/currency";
import { DollarSign, MessageCircle, Clock, CheckCircle, XCircle, ArrowRightLeft } from "lucide-react";

interface BudgetNegotiationAdminProps {
  projectId: number;
  currentPrice: string;
  projectStatus: string;
}

export default function BudgetNegotiationAdmin({ 
  projectId, 
  currentPrice, 
  projectStatus 
}: BudgetNegotiationAdminProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [proposedPrice, setProposedPrice] = useState("");
  const [message, setMessage] = useState("");

  const { data: exchangeRate } = useQuery<ExchangeRate>({
    queryKey: ["/api/exchange-rate"],
    queryFn: async () => {
      const response = await fetch('/api/exchange-rate');
      if (!response.ok) throw new Error('Failed to fetch exchange rate');
      return await response.json();
    },
  });

  const { data: negotiations, isLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "budget-negotiations"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${projectId}/budget-negotiations`);
      return await response.json();
    },
    enabled: projectStatus === "negotiating",
  });

  const createNegotiationMutation = useMutation({
    mutationFn: async (data: { proposedPrice: number; message: string }) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/budget-negotiations`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget-negotiations"] });
      setProposedPrice("");
      setMessage("");
      toast({
        title: "Propuesta enviada",
        description: "Tu propuesta de presupuesto ha sido enviada al cliente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al enviar propuesta",
        variant: "destructive",
      });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (data: { negotiationId: number; status: string; message?: string; counterPrice?: number }) => {
      const response = await apiRequest("PUT", `/api/budget-negotiations/${data.negotiationId}/respond`, {
        status: data.status,
        message: data.message,
        counterPrice: data.counterPrice,
      });
      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget-negotiations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });

      const statusMessages = {
        accepted: "¡Propuesta aceptada! El proyecto iniciará pronto.",
        rejected: "Propuesta rechazada. El cliente será notificado.",
      };

      toast({
        title: "Respuesta enviada",
        description: statusMessages[variables.status as keyof typeof statusMessages],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al responder",
        variant: "destructive",
      });
    },
  });

  const handleRespond = (negotiationId: number, status: string) => {
    respondMutation.mutate({
      negotiationId,
      status,
    });
  };

  const handleSubmitProposal = () => {
    const price = parseFloat(proposedPrice);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Error de validación",
        description: "Ingresa un precio válido",
        variant: "destructive",
      });
      return;
    }

    createNegotiationMutation.mutate({
      proposedPrice: price,
      message,
    });
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      pending: { variant: "outline" as const, icon: Clock, text: "Pendiente Respuesta", color: "text-yellow-500" },
      accepted: { variant: "default" as const, icon: CheckCircle, text: "Aceptado", color: "text-green-500" },
      rejected: { variant: "destructive" as const, icon: XCircle, text: "Rechazado", color: "text-red-500" },
      countered: { variant: "secondary" as const, icon: ArrowRightLeft, text: "Contrapropuesta", color: "text-blue-500" },
    };

    const config = configs[status as keyof typeof configs] || configs.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {config.text}
      </Badge>
    );
  };

  // Find the latest pending negotiation
  const latestPending = negotiations?.find((n: any) => n.status === "pending");

  if (projectStatus !== "negotiating") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Negociación de Presupuesto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>La negociación de presupuesto está disponible solo cuando el proyecto está en estado "Negociando".</p>
            <p className="text-sm mt-2">Cambia el estado del proyecto a "Negociando Presupuesto" para iniciar.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Nueva Propuesta de Presupuesto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Precio Original del Cliente</Label>
              <div className="text-lg font-bold text-muted-foreground">
                {formatWithPyg(currentPrice, exchangeRate)}
              </div>
            </div>
            <div>
              <Label htmlFor="proposed-price">Tu Precio Propuesto *</Label>
              <Input
                id="proposed-price"
                type="number"
                step="0.01"
                min="0"
                value={proposedPrice}
                onChange={(e) => setProposedPrice(e.target.value)}
                placeholder="75000.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="message">Mensaje Explicativo</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explica por qué el precio propuesto es el adecuado..."
              rows={3}
            />
          </div>

          <Button 
            onClick={handleSubmitProposal} 
            disabled={createNegotiationMutation.isPending}
            className="w-full"
          >
            {createNegotiationMutation.isPending ? "Enviando..." : "Enviar Propuesta al Cliente"}
          </Button>
        </CardContent>
      </Card>

      {/* Historial de Negociaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Historial de Negociaciones
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-muted rounded-lg"></div>
              ))}
            </div>
          ) : negotiations?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aún no hay negociaciones para este proyecto.</p>
              <p className="text-sm">Envía la primera propuesta arriba.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {negotiations?.map((negotiation: any) => (
                <div key={negotiation.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold">
                        {formatWithPyg(negotiation.originalPrice, exchangeRate)} → {formatWithPyg(negotiation.proposedPrice, exchangeRate)}
                      </div>
                      {getStatusBadge(negotiation.status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Por {negotiation.proposerName} • {new Date(negotiation.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {negotiation.message && (
                    <div className="bg-muted/50 p-3 rounded-md">
                      <p className="text-sm">{negotiation.message}</p>
                    </div>
                  )}

                  {negotiation.status === "pending" && negotiation.proposerId !== "admin" && (
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleRespond(negotiation.id, "accepted")}
                        disabled={respondMutation.isPending}
                      >
                        Aceptar Contraoferta
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => handleRespond(negotiation.id, "rejected")}
                        disabled={respondMutation.isPending}
                      >
                        Rechazar Contraoferta
                      </Button>
                    </div>
                  )}

                  {negotiation.respondedAt && (
                    <div className="text-xs text-muted-foreground">
                      Respondido el {new Date(negotiation.respondedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}