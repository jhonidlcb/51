import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useQueryClient } from "@tanstack/react-query";

interface WebSocketMessage {
  type: string;
  message?: string;
  data?: any;
  timestamp: string;
}

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Use refs for timers to avoid dependency issues
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;


  const connectWebSocket = useCallback(() => {
    if (!user?.id) return;

    // Clear any existing timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    reconnectAttemptsRef.current = 0; // Reset attempts on manual connect

    const connect = () => {
      try {
        // Use secure WebSocket in production, regular WebSocket in development
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        console.log('🔌 Intentando conectar WebSocket a:', wsUrl);
        const ws_instance = new WebSocket(wsUrl);
        ws.current = ws_instance;

        ws_instance.onopen = () => {
          console.log('✅ WebSocket conectado');
          setIsConnected(true);
          reconnectAttemptsRef.current = 0; // Reset attempts on successful connection

          // Authenticate the WebSocket connection
          if (ws_instance && user?.id) {
            const authMessage = {
              type: 'auth',
              userId: user.id,
              token: localStorage.getItem('token')
            };
            console.log('🔐 Enviando autenticación WebSocket:', { userId: user.id, hasToken: !!localStorage.getItem('token') });
            ws_instance.send(JSON.stringify(authMessage));
          }

          // Setup heartbeat
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = setInterval(() => {
            if (ws_instance && ws_instance.readyState === WebSocket.OPEN) {
              ws_instance.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        ws_instance.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📨 Mensaje WebSocket recibido:', message);
            setLastMessage(message);

            // Handle different message types
            if (message.type === 'notification' && message.data) {
              console.log('🔔 Nueva notificación recibida:', message.data);
              setNotifications(prev => {
                const newNotifications = [message.data, ...prev].slice(0, 10);
                console.log('📋 Notificaciones actualizadas:', newNotifications);
                return newNotifications;
              });
              setUnreadCount(prev => {
                const newCount = prev + 1;
                console.log('🔢 Contador no leídas actualizado:', newCount);
                return newCount;
              });

              // Show browser notification if supported
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(message.data.title, {
                  body: message.data.message,
                  icon: '/favicon.ico',
                });
              }
            } else if (message.type === 'data_update') {
              // Handle data update events - invalidate relevant queries
              console.log('🔄 Evento de actualización de datos recibido:', message.eventType, message.data);
              handleDataUpdate(message.eventType, message.data);
            } else if (message.type === 'pong') {
              console.log('🏓 Pong received from server');
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        ws_instance.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnected(false);
        };

        ws_instance.onclose = () => {
          console.log('🔌 WebSocket desconectado');
          setIsConnected(false);

          // Clear heartbeat
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }

          // Auto-reconnect with exponential backoff
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              connect();
            }, delay);
          } else {
            console.error('❌ Máximo número de intentos de reconexión alcanzado');
          }
        };

      } catch (error) {
        console.error("Failed to initialize WebSocket:", error);
        setIsConnected(false);
        // Attempt to reconnect if initialization itself fails
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          console.error('❌ Máximo número de intentos de reconexión alcanzado tras fallo de inicialización');
        }
      }
    };

    connect();

  }, [user?.id]); // Only depend on user.id

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    setIsConnected(false);
  }, []);

  const markAsRead = useCallback((id: string | number) => {
    console.log(`📖 Marcando notificación ${id} como leída`);
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, isRead: true } : notif
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => disconnect();
  }, [connectWebSocket, disconnect]);

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected. Message not sent:", message);
    }
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Handle data update events and invalidate relevant queries
  const handleDataUpdate = useCallback((eventType: string, eventData: any) => {
    console.log(`🔄 Procesando evento de actualización: ${eventType}`, eventData);
    
    switch (eventType) {
      case 'payment_proof_uploaded':
        // Invalidate payment stages queries
        console.log('💳 Invalidando queries de etapas de pago');
        queryClient.invalidateQueries({ queryKey: ['/api/payment-stages'] });
        if (eventData?.projectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId, 'payment-stages'] });
        }
        break;
        
      case 'payment_approved':
      case 'payment_rejected':
        // Invalidate payment stages and billing queries
        console.log('💰 Invalidando queries de pagos y facturación');
        queryClient.invalidateQueries({ queryKey: ['/api/payment-stages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing'] });
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        if (eventData?.projectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId] });
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId, 'payment-stages'] });
        }
        break;
        
      case 'project_created':
        // Invalidate project queries when a new project is created
        console.log('🚀 Invalidando queries de proyectos (nuevo proyecto creado)');
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/projects'] });
        break;
        
      case 'project_updated':
        // Invalidate project queries
        console.log('📋 Invalidando queries de proyectos');
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
        if (eventData?.projectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId] });
        }
        break;
        
      case 'ticket_created':
      case 'ticket_updated':
        // Invalidate ticket queries
        console.log('🎫 Invalidando queries de tickets');
        queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
        if (eventData?.ticketId) {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets', eventData.ticketId] });
          // CRITICAL: Also invalidate ticket responses for real-time updates
          queryClient.invalidateQueries({ queryKey: ['/api/tickets', eventData.ticketId, 'responses'] });
        }
        break;
        
      case 'message_created':
        // Invalidate project messages queries
        console.log('💬 Invalidando queries de mensajes de proyecto');
        if (eventData?.projectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId, 'messages'] });
        }
        break;
        
      case 'file_uploaded':
        // Invalidate project files queries
        console.log('📎 Invalidando queries de archivos de proyecto');
        if (eventData?.projectId) {
          queryClient.invalidateQueries({ queryKey: ['/api/projects', eventData.projectId, 'files'] });
        }
        break;
        
      case 'invoice_generated':
        // Invalidate invoice queries
        console.log('📄 Invalidando queries de facturas');
        queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
        break;
        
      case 'analytics_updated':
        // Invalidate analytics queries
        console.log('📊 Invalidando queries de analíticas');
        queryClient.invalidateQueries({ queryKey: ['/api/admin/analytics'] });
        break;
        
      default:
        console.log(`⚠️ Tipo de evento no manejado: ${eventType}`);
    }
  }, [queryClient]);

  return {
    isConnected,
    notifications,
    unreadCount,
    connect: connectWebSocket,
    disconnect,
    markAsRead,
    sendMessage,
    clearNotifications,
    lastMessage
  };
}