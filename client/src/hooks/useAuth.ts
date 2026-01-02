import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { User, LoginInput, RegisterInput } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/me");
      if (!response.ok) {
        throw new Error("No autenticado");
      }
      return response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!localStorage.getItem("auth_token"), // Only run if token exists
    refetchOnWindowFocus: false, // No recargar al enfocar ventana
    refetchOnReconnect: false, // No recargar al reconectar
  });

  const hasToken = !!localStorage.getItem("auth_token");

  return {
    user: user as User | undefined,
    isLoading: hasToken ? isLoading : false,
    error,
    isAuthenticated: !!user && hasToken,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginInput) => {
      console.log("🔐 Attempting login for:", credentials.email);
      
      try {
        const response = await apiRequest("POST", "/api/auth/login", credentials);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error("❌ Login failed:", errorData);
          throw new Error(errorData.message || "Error en el login");
        }

        const data = await response.json();
        console.log("✅ Login successful:", data.user?.email);

        // Store token in localStorage
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
          console.log("🔑 Token saved to localStorage");
        } else {
          console.error("⚠️ No token received from server");
        }

        return data;
      } catch (error) {
        console.error("❌ Login error:", error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Error desconocido en el login");
      }
    },
    onSuccess: (data) => {
      console.log("✅ Login mutation successful, updating cache");
      // Set the user data in the query cache immediately
      queryClient.setQueryData(["/api/auth/me"], data.user);

      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error) => {
      console.error("❌ Login mutation error:", error);
    }
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: RegisterInput) => {
      const response = await apiRequest("POST", "/api/auth/register", userData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error en el registro");
      }

      const data = await response.json();

      // Store token in localStorage
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
      }

      return data;
    },
    onSuccess: (data) => {
      // Set the user data in the query cache immediately
      queryClient.setQueryData(["/api/auth/me"], data.user);

      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Clear token from localStorage
      localStorage.removeItem("auth_token");
      return { message: "Logged out successfully" };
    },
    onSuccess: () => {
      // Clear all queries
      queryClient.clear();
      // Force redirect to home page
      window.location.href = "/";
    },
  });
}