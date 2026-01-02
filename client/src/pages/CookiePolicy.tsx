import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Layout from "@/components/Layout";
import Footer from "@/components/Footer";
import { useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function CookiePolicy() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["/api/public/legal/cookies"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/public/legal/cookies");
      return await response.json();
    },
  });

  const openAuthModal = (mode: "login" | "register") => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <Layout onAuthClick={openAuthModal}>
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 bg-background min-h-screen">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl font-bold text-center">
                {isLoading ? "Cargando..." : pageData?.title || "Política de Cookies"}
              </CardTitle>
              <p className="text-center text-muted-foreground">
                {pageData?.updatedAt
                  ? `Última actualización: ${new Date(pageData.updatedAt).toLocaleDateString()}`
                  : "Última actualización: Enero 2024"
                }
              </p>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: pageData?.content || "" }} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        mode={authMode}
        onModeChange={setAuthMode}
      />
    </Layout>
  );
}