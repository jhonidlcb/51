import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import {
  users,
  partners,
  projects,
  referrals,
  tickets,
  portfolio,
  notifications,
  projectMessages,
  projectFiles,
  projectTimeline,
  ticketResponses,
  paymentMethods,
  invoices,
  transactions,
  paymentStages,
  budgetNegotiations,
  workModalities,
  clientBillingInfo,
  companyBillingInfo,
  exchangeRateConfig,
  legalPages, // Importación faltante agregada
  heroSlides,
} from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const currentDbUrl = process.env.DATABASE_URL;

// Log para verificar la conexión a la base de datos
console.log('🔗 Conectando a la base de datos...');
console.log('📊 Database URL configurada:', process.env.DATABASE_URL ? 'SÍ' : 'NO');
console.log('🌐 Host de la DB:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'No detectado');

// Define el objeto schema con todas las tablas
const schema = {
  users,
  partners,
  projects,
  referrals,
  tickets,
  portfolio,
  notifications,
  projectMessages,
  projectFiles,
  projectTimeline,
  ticketResponses,
  paymentMethods,
  invoices,
  transactions,
  paymentStages,
  budgetNegotiations,
  workModalities,
  clientBillingInfo,
  companyBillingInfo,
  exchangeRateConfig, // Incluir la nueva tabla en el schema
  legalPages, // Incluir la nueva tabla en el schema
  heroSlides, // Incluir la nueva tabla en el schema
};

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

// Export all tables from the schema for easy access
export {
  users,
  partners,
  projects,
  tickets,
  portfolio,
  paymentMethods, // Asegúrate de que 'payments' no esté duplicado o sea un alias incorrecto. Si 'payments' es un typo y debía ser 'paymentMethods', esto lo corrige. Si 'payments' es una tabla diferente, necesitaría ser añadida aquí y en el schema.
  paymentStages,
  notifications,
  projectMessages,
  projectFiles,
  projectTimeline,
  ticketResponses,
  referrals,
  budgetNegotiations,
  // sessions, // Estas tablas parecen faltar en el schema original proporcionado. Si son necesarias, deben ser importadas en "@shared/schema" y añadidas al objeto 'schema' aquí.
  // passwordResetTokens, // Ídem
  invoices,
  transactions,
  workModalities,
  clientBillingInfo,
  companyBillingInfo,
  exchangeRateConfig,
  legalPages,
  heroSlides, // Exportar la nueva tabla
};

// --- Inicialización de datos ---
async function initializeDatabase() {
  console.log("🚀 Iniciando inicialización de la base de datos...");

  console.log("🌱 Verificando slides del hero...");
  const existingSlides = await db.select().from(heroSlides).limit(1);

  if (existingSlides.length === 0) {
    console.log("🌱 Creando slide hero inicial...");
    await db.insert(heroSlides).values({
      title: "SoftwarePar: Tu Partner Tecnológico en Paraguay",
      subtitle: "Empresa paraguaya de desarrollo de software",
      description: "Somos la empresa paraguaya líder en desarrollo de software, especializada en apps web y móviles, y facturación electrónica SIFEN. Con más de 50 proyectos completados y soporte 24/7, transformamos empresas paraguayas en su camino tecnológico.",
      imageUrl: "", // Sin imagen de fondo, usará el gradiente
      buttonText: "Cotización Gratuita",
      buttonLink: "#contacto",
      displayOrder: 0,
      isActive: true
    });
    console.log("✅ Slide hero inicial creado");
  } else {
    console.log("✅ Slides hero ya existen");
  }

  // Verificar información de la empresa
  const existingCompany = await db.select().from(companyBillingInfo).limit(1);
  if (existingCompany.length === 0) {
    console.log("🌱 Creando información de facturación de la empresa...");
    await db.insert(companyBillingInfo).values({
      companyName: "SOFTWAREPAR",
      titularName: "JHONI FABIAN BENITEZ DE LA CRUZ",
      ruc: "4220058-0",
      address: "BARRIO RESIDENCIAL",
      city: "CARLOS A. LOPEZ",
      department: "ITAPUA",
      country: "Paraguay",
      phone: "0985990",
      email: "SOFTWAREPAR.LAT@GMAIL.COM",
      taxRegime: "IRE SIMPLE",
      economicActivity: "62090 - Otras actividades de tecnología de la información",
      timbradoNumber: "18398622",
      isActive: true,
      ivaPercentage: "10.00"
    });
    console.log("✅ Información de la empresa creada");
  } else {
    // Asegurarse de que el RUC sea el correcto si ya existe
    await db.update(companyBillingInfo)
      .set({ 
        companyName: "SOFTWAREPAR",
        titularName: "JHONI FABIAN BENITEZ DE LA CRUZ",
        ruc: "4220058-0",
        ivaPercentage: "10.00",
        isSignatureProcessEnabled: true
      })
      .where(eq(companyBillingInfo.id, existingCompany[0].id));
  }

  console.log("🌱 Verificando modalidades de trabajo...");
  const existingModalities = await db.select().from(workModalities).limit(1);

  if (existingModalities.length === 0) {
    console.log("🌱 Creando modalidades de trabajo iniciales...");
    await db.insert(workModalities).values([
      {
        title: "Lanzamiento Web",
        subtitle: "Tu sitio profesional listo en pocos días",
        badgeText: "Ideal para Emprendedores",
        badgeVariant: "default",
        description: "Ideal para negocios y emprendedores que desean una página web moderna, rápida y optimizada. Incluye dominio, hosting, y soporte técnico por 30 días.",
        priceText: "Gs 1.500.000",
        priceSubtitle: "Entrega en 7 a 15 días",
        features: JSON.stringify([
          "Diseño web profesional (hasta 5 secciones)",
          "Dominio .com o .com.py incluido",
          "Hosting y certificado SSL",
          "Diseño responsive (PC, tablet, móvil)",
          "Formulario de contacto y WhatsApp directo",
          "Optimización SEO básica",
          "Soporte técnico 30 días"
        ]),
        buttonText: "Cotizar mi web profesional",
        buttonVariant: "default",
        isPopular: false,
        isActive: true,
        displayOrder: 1
      },
      {
        title: "E-commerce Avanzado",
        subtitle: "Tu tienda online lista para vender",
        badgeText: "Escalabilidad y Ventas",
        badgeVariant: "success",
        description: "Plataforma de comercio electrónico robusta y escalable, diseñada para maximizar tus ventas online. Incluye integración con pasarelas de pago locales e internacionales, gestión de inventario y reportes avanzados.",
        priceText: "Gs 3.500.000",
        priceSubtitle: "Entrega en 20 a 30 días",
        features: JSON.stringify([
          "Diseño web profesional (hasta 15 secciones)",
          "Catálogo de productos ilimitado",
          "Integración con pasarelas de pago (ej. WEP, Bancard)",
          "Gestión de inventario y stock",
          "Diseño responsive (PC, tablet, móvil)",
          "Optimización SEO avanzada",
          "Integración con redes sociales",
          "Soporte técnico 60 días"
        ]),
        buttonText: "Crear mi tienda online",
        buttonVariant: "default",
        isPopular: true,
        isActive: true,
        displayOrder: 2
      },
      {
        title: "App Web a Medida",
        subtitle: "Soluciones digitales personalizadas",
        badgeText: "Innovación y Eficiencia",
        badgeVariant: "primary",
        description: "Desarrollamos aplicaciones web a medida para optimizar tus procesos de negocio y alcanzar tus objetivos. Desde sistemas de gestión interna hasta plataformas complejas, creamos soluciones únicas para tu empresa.",
        priceText: "A cotizar",
        priceSubtitle: "Según complejidad",
        features: JSON.stringify([
          "Análisis de requerimientos detallado",
          "Diseño UI/UX personalizado",
          "Desarrollo Full-Stack (Frontend y Backend)",
          "Integración con sistemas existentes",
          "Despliegue y soporte técnico",
          "Escalabilidad y seguridad"
        ]),
        buttonText: "Diseñar mi solución",
        buttonVariant: "default",
        isPopular: false,
        isActive: true,
        displayOrder: 3
      }
    ]);
    console.log("✅ Modalidades de trabajo iniciales creadas");
  } else {
    console.log("✅ Modalidades de trabajo ya existen");
  }

  console.log("✨ Inicialización de la base de datos completada.");
}

// Llama a la función de inicialización si no se han creado los datos
// En un entorno de producción, podrías querer ejecutar esto solo una vez o
// tener una estrategia de migración más robusta.
// Para este ejemplo, lo llamamos directamente.
initializeDatabase().catch(error => {
  console.error("❌ Error durante la inicialización de la base de datos:", error);
});