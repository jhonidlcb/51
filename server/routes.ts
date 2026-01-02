import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import fs from 'fs'; // Import fs module for file operations
import QRCode from 'qrcode';
import { storage } from "./storage";
import {
  authenticateToken,
  requireRole,
  generateToken,
  hashPassword,
  comparePassword,
  type AuthRequest
} from "./auth";
import { sendEmail, sendWelcomeEmail, sendContactNotification, sendContactConfirmation, sendPartnerCommissionNotification, sendPaymentProofNotificationToAdmin, sendPaymentProofConfirmationToClient, generateBudgetAcceptanceEmailHTML, generatePaymentStageAvailableEmailHTML } from "./email";

// Function to verify reCAPTCHA
async function verifyRecaptcha(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6Lc1Iu0rAAAAAJRyHPH1N3Srv72K27bTFNaF12ZP';

  if (!process.env.RECAPTCHA_SECRET_KEY) {
    console.warn('⚠️ RECAPTCHA_SECRET_KEY not configured in Secrets. Using development key.');
  }

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = await response.json();

    console.log(`🔐 reCAPTCHA verified - Score: ${data.score || 'N/A'}, Success: ${data.success}`);

    // reCAPTCHA v3 returns a score from 0.0 to 1.0
    // We consider it valid if the score is above 0.1 for more flexibility
    return data.success && (data.score === undefined || data.score >= 0.1);
  } catch (error) {
    console.error('❌ Error verifying reCAPTCHA:', error);
    return false;
  }
}

import {
  loginSchema,
  registerSchema,
  contactSchema,
  insertProjectSchema,
  insertTicketSchema,
} from "@shared/schema";
import {
  registerWSConnection,
  sendComprehensiveNotification,
  notifyProjectCreated,
  notifyProjectUpdated,
  notifyNewMessage,
  notifyTicketCreated,
  notifyTicketResponse,
  notifyPaymentStageAvailable,
  notifyBudgetNegotiation
} from "./notifications";
import { z } from "zod";
import { db, users, partners, projects, notifications, tickets, paymentStages, portfolio, referrals, projectMessages, projectFiles, projectTimeline, ticketResponses, paymentMethods, invoices, transactions, budgetNegotiations, workModalities, clientBillingInfo, companyBillingInfo, exchangeRateConfig, heroSlides } from "./db";
import { eq, desc, and, or, count, sql, like, inArray, asc } from "drizzle-orm"; // Import necessary drizzle-orm functions
import bcrypt from 'bcryptjs'; // Import bcryptjs for password hashing

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware for authentication and authorization
const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  authenticateToken(req, res, () => {
    if (req.user) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });
};

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Forbidden: Admins only" });
  }
};

// Validation middleware
const validateSchema = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid input data",
          errors: error.errors,
        });
      }
      next(error);
    }
  };
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/pdf'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only images (JPG, PNG, GIF) and PDFs are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      // Test database connection
      const dbTest = await db.select().from(users).limit(1);

      res.json({
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
        database_url_configured: !!process.env.DATABASE_URL,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Legal pages routes - Public
  app.get("/api/public/legal/:pageType", async (req, res) => {
    try {
      const { pageType } = req.params;
      const page = await storage.getLegalPage(pageType);

      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      res.json(page);
    } catch (error) {
      console.error("Error getting legal page:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Legal pages routes - Admin
  app.get("/api/admin/legal-pages", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      console.log("📄 Fetching all legal pages...");
      const pages = await storage.getAllLegalPages();
      console.log("✅ Legal pages fetched:", pages?.length || 0, pages);

      // Ensure an array is always returned
      const result = Array.isArray(pages) ? pages : [];
      res.json(result);
    } catch (error) {
      console.error("❌ Error getting legal pages:", error);
      // Return an empty array in case of error instead of 500
      res.json([]);
    }
  });

  app.put("/api/admin/legal-pages/:pageType", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { pageType } = req.params;
      const updates = req.body;

      const updated = await storage.updateLegalPage(pageType, updates, req.user!.id);
      res.json(updated);
    } catch (error) {
      console.error("Error updating legal page:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public endpoint for company billing info (for footer)
  app.get("/api/public/company-info", async (req, res) => {
    try {
      const companyInfo = await db
        .select({
          companyName: companyBillingInfo.companyName,
          titularName: companyBillingInfo.titularName,
          ruc: companyBillingInfo.ruc,
          timbradoNumber: companyBillingInfo.timbradoNumber,
        })
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .orderBy(desc(companyBillingInfo.updatedAt))
        .limit(1);

      if (companyInfo.length === 0) {
        return res.json({
          companyName: "SoftwarePar",
          titularName: null,
          ruc: "In progress",
          timbradoNumber: "In progress",
        });
      }

      res.json(companyInfo[0]);
    } catch (error) {
      console.error("Error getting public company info:", error);
      res.status(500).json({
        companyName: "SoftwarePar",
        titularName: null,
        ruc: "In progress",
        timbradoNumber: "In progress",
      });
    }
  });

  // Sitemap XML endpoint for SEO
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = process.env.BASE_URL || "https://softwarepar.com";
      const currentDate = new Date().toISOString().split('T')[0];

      // Static pages
      const staticPages = [
        { url: '', changefreq: 'daily', priority: '1.0' },
        { url: 'terminos', changefreq: 'monthly', priority: '0.5' },
        { url: 'privacidad', changefreq: 'monthly', priority: '0.5' },
        { url: 'cookies', changefreq: 'monthly', priority: '0.5' },
      ];

      // Get dynamic portfolio items
      const portfolioItems = await db.select({ id: portfolio.id, updatedAt: portfolio.updatedAt })
        .from(portfolio)
        .where(eq(portfolio.isActive, true))
        .limit(50);

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

      // Add static pages
      staticPages.forEach(page => {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/${page.url}</loc>\n`;
        xml += `    <lastmod>${currentDate}</lastmod>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += '  </url>\n';
      });

      xml += '</urlset>';

      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send('Error generating sitemap');
    }
  });



  // API routes
  // Seed initial data
  await storage.seedUsers();

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password, recaptchaToken } = req.body;

      console.log('🔐 Login attempt for:', email);

      // Verify reCAPTCHA
      if (recaptchaToken) {
        const isValidRecaptcha = await verifyRecaptcha(recaptchaToken);
        if (!isValidRecaptcha) {
          console.log('❌ Login attempt blocked by reCAPTCHA for:', email);
          return res.status(403).json({ 
            message: process.env.NODE_ENV === 'development' 
              ? "Verificación de seguridad falló - Score muy bajo. Intenta nuevamente en unos segundos."
              : "Security verification failed" 
          });
        }
        console.log('✅ reCAPTCHA verified for:', email);
      }

      const validatedData = loginSchema.parse({ email, password });

      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        console.log('❌ User not found:', validatedData.email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        console.log('❌ User inactive:', validatedData.email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log('👤 User found:', { email: user.email, role: user.role, isActive: user.isActive });

      const isValidPassword = await comparePassword(validatedData.password, user.password);
      if (!isValidPassword) {
        console.log('❌ Invalid password for:', validatedData.email);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      console.log('✅ Password valid for:', validatedData.email);

      const token = generateToken(user.id);
      const { password: _, ...userWithoutPassword } = user;

      console.log('✅ Login successful for:', user.email, '- Role:', user.role);

      res.json({
        user: userWithoutPassword,
        token,
        message: "Login successful",
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      if (error instanceof z.ZodError) {
        console.error('❌ Validation error:', error.errors);
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public registration disabled - only admins can create users

  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { password: _, ...userWithoutPassword } = req.user!;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Password Reset Routes
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email, recaptchaToken } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Verify reCAPTCHA
      const recaptchaValid = await verifyRecaptcha(recaptchaToken);
      if (!recaptchaValid) {
        return res.status(400).json({ message: "reCAPTCHA verification failed" });
      }

      const user = await storage.getUserByEmail(email);

      // For security, always respond with success even if the user doesn't exist
      if (!user) {
        return res.status(200).json({
          message: "If the email exists, you will receive recovery instructions"
        });
      }

      // Generate unique and secure reset token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Token valid for 24 hours

      // Save token to the database (already secure as 32-byte random hex)
      await storage.createPasswordResetToken({
        userId: user.id,
        token: resetToken,
        expiresAt,
      });

      // Get current domain for the link
      // Use the origin from the request headers for dynamic domain resolution
      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || process.env.BASE_URL || `https://${process.env.REPL_ID}.${process.env.REPL_SLUG}.replit.dev` || 'http://localhost:5000';
      const resetLink = `${origin}/reset-password?token=${resetToken}`;

      // Send email with reset link
      await sendPasswordResetEmail(user.email, user.fullName, resetLink);

      res.json({
        message: "If the email exists, you will receive recovery instructions"
      });
    } catch (error) {
      console.error("Error in forgot-password:", error);
      res.status(500).json({ message: "Error processing request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long" });
      }

      // Verify the token
      const resetTokenRecord = await storage.getPasswordResetToken(token);

      if (!resetTokenRecord) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      if (resetTokenRecord.used) {
        return res.status(400).json({ message: "This token has already been used" });
      }

      if (new Date() > new Date(resetTokenRecord.expiresAt)) {
        return res.status(400).json({ message: "The token has expired" });
      }

      // Update user's password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(resetTokenRecord.userId, hashedPassword);

      // Mark the token as used
      await storage.markPasswordResetTokenAsUsed(token);

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error in reset-password:", error);
      res.status(500).json({ message: "Error resetting password" });
    }
  });

  // Exchange Rate Routes
  app.get("/api/exchange-rate", async (req, res) => {
    try {
      const exchangeRate = await storage.getCurrentExchangeRate();
      res.json(exchangeRate || { usdToGuarani: "7300.00", isDefault: true });
    } catch (error) {
      console.error("Error getting exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/exchange-rate/fetch-from-api", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { fetchCurrentExchangeRate } = await import('./exchange-rate-api');

      console.log('🌐 Fetching exchange rate from API...');
      const apiRate = await fetchCurrentExchangeRate();

      if (!apiRate) {
        return res.status(500).json({
          message: "No se pudo obtener el tipo de cambio desde la API. Usando valor por defecto.",
          rate: "7300.00"
        });
      }

      // Redondear a 2 decimales
      const rate = apiRate.toFixed(2);

      console.log(`✅ Exchange rate fetched successfully: 1 USD = ${rate} PYG`);

      res.json({
        success: true,
        rate: rate,
        message: "Tipo de cambio obtenido exitosamente desde la API",
        source: "exchangerate-api.com"
      });

    } catch (error) {
      console.error("Error fetching exchange rate from API:", error);
      res.status(500).json({
        message: "Error al obtener el tipo de cambio desde la API",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  app.get("/api/admin/exchange-rate", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const exchangeRate = await storage.getCurrentExchangeRate();
      res.json(exchangeRate || {
        usdToGuarani: "7300.00",
        isDefault: true,
        updatedAt: new Date(),
        updatedBy: req.user!.id
      });
    } catch (error) {
      console.error("Error getting exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/exchange-rate", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { usdToGuarani } = req.body;

      if (!usdToGuarani || isNaN(parseFloat(usdToGuarani))) {
        return res.status(400).json({ message: "Invalid exchange rate" });
      }

      const updatedRate = await storage.updateExchangeRate(usdToGuarani, req.user!.id);
      res.json(updatedRate);
    } catch (error) {
      console.error("Error updating exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Contact Routes
  app.post("/api/contact", async (req, res) => {
    try {
      const { recaptchaToken, ...contactDataRaw } = req.body;

      // Verify reCAPTCHA
      if (recaptchaToken) {
        const isValidRecaptcha = await verifyRecaptcha(recaptchaToken);
        if (!isValidRecaptcha) {
          console.log('❌ Contact form blocked by reCAPTCHA');
          return res.status(403).json({ message: "Security verification failed. Please try again." });
        }
        console.log('✅ reCAPTCHA verified successfully');
      }

      const contactData = contactSchema.parse(contactDataRaw);

      // Send notification email to admin
      try {
        await sendContactNotification(contactData);
        console.log(`📧 Contact notification sent to admin for: ${contactData.fullName}`);
      } catch (emailError) {
        console.error("Error sending contact notification:", emailError);
      }

      // Send confirmation email to client
      try {
        await sendContactConfirmation(contactData.email, contactData.fullName);
        console.log(`📧 Confirmation sent to client: ${contactData.email}`);
      } catch (emailError) {
        console.error("Error sending contact confirmation:", emailError);
      }

      res.json({
        message: "Thank you for contacting us! We have received your inquiry and will respond within 24 hours."
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });



  // User Routes
  app.get("/api/users", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user (Admin or own profile)
  app.put("/api/users/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { currentPassword, newPassword, ...updates } = req.body;

      // Only allow users to update their own profile unless they're admin
      if (req.user!.id !== userId && req.user!.role !== 'admin') {
        return res.status(403).json({ message: "You don't have permission to update this profile" });
      }

      // If attempting to change password
      if (newPassword && currentPassword) {
        // Verify that the current password is correct
        const [currentUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!currentUser) {
          return res.status(404).json({ message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);
        if (!isPasswordValid) {
          return res.status(400).json({ message: "Incorrect current password" });
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);
        updates.password = hashedPassword;
      }

      const [updatedUser] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Do not send the password in the response
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Partner Routes
  app.get("/api/partners/me", authenticateToken, requireRole(["partner"]), async (req: AuthRequest, res) => {
    try {
      const partner = await storage.getPartner(req.user!.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }

      const stats = await storage.getPartnerStats(partner.id);
      res.json({ ...partner, ...stats });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/partners/referrals", authenticateToken, requireRole(["partner"]), async (req: AuthRequest, res) => {
    try {
      const partner = await storage.getPartner(req.user!.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }

      const referrals = await storage.getReferrals(partner.id);
      res.json(referrals);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/partner/earnings", authenticateToken, requireRole(["partner"]), async (req: AuthRequest, res) => {
    try {
      const partner = await storage.getPartner(req.user!.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }

      const earningsData = await storage.getPartnerEarningsData(partner.id);
      res.json(earningsData);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/partner/commissions", authenticateToken, requireRole(["partner"]), async (req: AuthRequest, res) => {
    try {
      const partner = await storage.getPartner(req.user!.id);
      if (!partner) {
        return res.status(404).json({ message: "Partner not found" });
      }

      const commissions = await storage.getPartnerCommissions(partner.id);
      res.json(commissions);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/partners", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { userId, commissionRate } = req.body;

      const existingPartner = await storage.getPartner(userId);
      if (existingPartner) {
        return res.status(400).json({ message: "User is already a partner" });
      }

      const referralCode = `PAR${userId}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const partner = await storage.createPartner({
        userId,
        referralCode,
        commissionRate: commissionRate || "25.00",
        totalEarnings: "0.00",
      });

      res.status(201).json(partner);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Projects
  app.get("/api/projects", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projects = await storage.getProjects(req.user!.id, req.user!.role);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify permissions
      if (req.user!.role !== "admin" && project.clientId !== req.user!.id) {
        return res.status(403).json({ message: "You do not have permission to view this project" });
      }

      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/projects/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Verify project exists and user has permissions
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Only the client owner or admin can delete
      if (req.user!.role !== "admin" && project.clientId !== req.user!.id) {
        return res.status(403).json({ message: "You do not have permission to delete this project" });
      }

      await storage.deleteProject(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { name, description, price } = req.body;

      const projectData = {
        name,
        description,
        price: price.toString(), // Ensure price is a string for decimal field
        clientId: req.user!.id,
        status: "pending",
        progress: 0,
      };

      // Only admin can set different client ID
      if (req.user!.role === "admin" && req.body.clientId) {
        projectData.clientId = req.body.clientId;
      }

      const project = await storage.createProject(projectData);

      // Send notifications
      const adminUsers = await storage.getUsersByRole("admin");
      const adminIds = adminUsers.map(admin => admin.id);
      await notifyProjectCreated(projectData.clientId, adminIds, name, project.id);

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/projects/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const updates = req.body;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Get original project data
      const originalProject = await storage.getProject(projectId);
      if (!originalProject) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Validate dates if provided
      if (updates.startDate && updates.startDate !== null) {
        const startDate = new Date(updates.startDate);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "Invalid start date" });
        }
      }

      if (updates.deliveryDate && updates.deliveryDate !== null) {
        const deliveryDate = new Date(updates.deliveryDate);
        if (isNaN(deliveryDate.getTime())) {
          return res.status(400).json({ message: "Invalid delivery date" });
        }
      }

      const project = await storage.updateProject(projectId, updates);

      // Send notification about project update
      if (req.user!.role === "admin") {
        let updateDescription = "The project has been updated";
        let hasStatusChange = false;
        let hasProgressChange = false;

        if (updates.status && updates.status !== originalProject.status) {
          const statusLabels = {
            'pending': 'Pending',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
          };
          updateDescription = `Status changed to: ${statusLabels[updates.status as keyof typeof statusLabels] || updates.status}`;
          hasStatusChange = true;
        }

        if (updates.progress && updates.progress !== originalProject.progress) {
          if (hasStatusChange) {
            updateDescription += ` - Progress updated to ${updates.progress}%`;
          } else {
            updateDescription = `Progress updated to ${updates.progress}%`;
          }
          hasProgressChange = true;
        }

        if (updates.startDate && updates.startDate !== originalProject.startDate) {
          updateDescription += ` - Start date updated`;
        }

        if (updates.deliveryDate && updates.deliveryDate !== originalProject.deliveryDate) {
          updateDescription += ` - Delivery date updated`;
        }

        if (updates.price && updates.price !== originalProject.price) {
          updateDescription += ` - Price updated to $${updates.price}`;
        }

        console.log(`📧 Sending project update notification: ${updateDescription}`);

        await notifyProjectUpdated(
          originalProject.clientId,
          originalProject.name,
          updateDescription,
          req.user!.fullName
        );

        // Special notifications for status changes
        if (hasStatusChange) {
          const statusLabels = {
            'pending': 'Pending',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
          };

          console.log(`📧 Sending special status change notifications to: ${updates.status}`);

          // Notify all admins about status change
          const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));
          for (const admin of adminUsers) {
            try {
              if (admin.email) {
                await sendEmail({
                  to: admin.email,
                  subject: `Status Change: ${originalProject.name} - ${statusLabels[updates.status as keyof typeof statusLabels] || updates.status}`,
                  html: generateProjectStatusChangeEmailHTML(
                    originalProject.name,
                    statusLabels[originalProject.status as keyof typeof statusLabels] || originalProject.status,
                    statusLabels[updates.status as keyof typeof statusLabels] || updates.status,
                    req.user!.fullName,
                    originalProject.clientId
                  ),
                });
                console.log(`✅ Status change email sent to admin: ${admin.email}`);
              }
            } catch (adminError) {
              console.error(`❌ Error sending status change email to admin ${admin.id}:`, adminError);
            }
          }

          // Also send to the main system email
          try {
            await sendEmail({
              to: process.env.GMAIL_USER || 'softwarepar.lat@gmail.com',
              subject: `Status Change: ${originalProject.name} - ${statusLabels[updates.status as keyof typeof statusLabels] || updates.status}`,
              html: generateProjectStatusChangeEmailHTML(
                originalProject.name,
                statusLabels[originalProject.status as keyof typeof statusLabels] || originalProject.status,
                statusLabels[updates.status as keyof typeof statusLabels] || updates.status,
                req.user!.fullName,
                originalProject.clientId
              ),
            });
            console.log(`✅ Status change email sent to main system email`);
          } catch (systemEmailError) {
            console.error(`❌ Error sending status change email to main system:`, systemEmailError);
          }
        }
      }

      // Send real-time event for project update
      const { sendRealtimeEvent } = await import("./notifications");
      sendRealtimeEvent(originalProject.clientId, 'project_updated', {
        projectId: project.id,
        projectName: project.name
      });

      // Also notify all admins
      const adminUsers = await storage.getUsersByRole("admin");
      for (const admin of adminUsers) {
        sendRealtimeEvent(admin.id, 'project_updated', {
          projectId: project.id,
          projectName: project.name,
          clientId: originalProject.clientId
        });
      }

      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });



  // Project detail routes
  app.get("/api/projects/:id/messages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const messages = await storage.getProjectMessages(projectId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects/:id/messages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { message } = req.body;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const newMessage = await storage.createProjectMessage({
        projectId,
        userId: req.user!.id,
        message,
      });

      // Notify the other party (if client sends message, notify admin; if admin sends, notify client)
      const { sendRealtimeEvent } = await import("./notifications");
      if (req.user!.role === "client") {
        // Client sent message, notify admins
        const adminUsers = await storage.getUsersByRole("admin");
        for (const admin of adminUsers) {
          await notifyNewMessage(
            admin.id,
            req.user!.fullName,
            project.name,
            message
          );

          // Send real-time event to admins
          sendRealtimeEvent(admin.id, 'message_created', {
            projectId,
            messageId: newMessage.id,
            userId: req.user!.id
          });
        }
      } else if (req.user!.role === "admin") {
        // Admin sent message, notify client
        await notifyNewMessage(
          project.clientId,
          req.user!.fullName,
          project.name,
          message
        );

        // Send real-time event to client
        sendRealtimeEvent(project.clientId, 'message_created', {
          projectId,
          messageId: newMessage.id,
          userId: req.user!.id
        });
      }

      res.status(201).json(newMessage);
    } catch (error) {
      console.error("Error creating project message:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects/:id/files", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const files = await storage.getProjectFiles(projectId);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects/:id/files", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { fileName, fileUrl, fileType } = req.body;

      const newFile = await storage.createProjectFile({
        projectId,
        fileName,
        fileUrl,
        fileType,
        uploadedBy: req.user!.id,
      });

      // Send real-time event for file upload
      const { sendRealtimeEvent } = await import("./notifications");
      const project = await storage.getProject(projectId);
      if (project) {
        // Notify client
        sendRealtimeEvent(project.clientId, 'file_uploaded', {
          projectId,
          fileId: newFile.id,
          fileName: newFile.fileName
        });

        // Notify admins
        const adminUsers = await storage.getUsersByRole("admin");
        for (const admin of adminUsers) {
          sendRealtimeEvent(admin.id, 'file_uploaded', {
            projectId,
            fileId: newFile.id,
            fileName: newFile.fileName,
            clientId: project.clientId
          });
        }
      }

      res.status(201).json(newFile);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects/:id/timeline", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const timeline = await storage.getProjectTimeline(projectId);
      res.json(timeline);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects/:id/timeline", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const timelineData = { ...req.body, projectId };

      const timeline = await storage.createProjectTimeline(timelineData);
      res.status(201).json(timeline);
    } catch (error) {
      console.error("Error creating project timeline:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/projects/:id/timeline/:timelineId", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const timelineId = parseInt(req.params.timelineId);
      const updates = req.body;

      const timeline = await storage.updateProjectTimeline(timelineId, updates);
      res.json(timeline);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Budget Negotiation Routes
  app.get("/api/projects/:id/budget-negotiations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const negotiations = await storage.getBudgetNegotiations(projectId);
      res.json(negotiations);
    } catch (error) {
      console.error("Error getting budget negotiations:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/projects/:id/budget-negotiations", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { proposedPrice, message } = req.body;

      // Get project for original price
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const negotiation = await storage.createBudgetNegotiation({
        projectId,
        proposedBy: req.user!.id,
        originalPrice: project.price,
        proposedPrice: proposedPrice.toString(),
        message,
        status: "pending",
      });

      // Notify the other party about the budget negotiation
      if (req.user!.role === "client") {
        // Client made proposal, notify admins
        const adminUsers = await storage.getUsersByRole("admin");
        for (const admin of adminUsers) {
          await notifyBudgetNegotiation(
            admin.id,
            project.name,
            proposedPrice.toString(),
            message || "",
            true, // Es contraoferta del cliente
            projectId,
            'client' // Rol del que propone
          );
        }
      } else if (req.user!.role === "admin") {
        // Admin made counter-proposal, notify client
        await notifyBudgetNegotiation(
          project.clientId,
          project.name,
          proposedPrice.toString(),
          message || "",
          true,
          projectId,
          'admin' // Rol del que propone
        );
      }

      res.status(201).json(negotiation);
    } catch (error) {
      console.error("Error creating budget negotiation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/budget-negotiations/:id/respond", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const negotiationId = parseInt(req.params.id);
      const { status, message, counterPrice } = req.body;

      let updates: any = { status };

      // If accepting, also update the project price
      if (status === "accepted") {
        const [negotiation] = await db
          .select()
          .from(budgetNegotiations)
          .where(eq(budgetNegotiations.id, negotiationId))
          .limit(1);

        if (negotiation) {
          await storage.updateProject(negotiation.projectId, {
            price: negotiation.proposedPrice,
            status: "in_progress",
          });

          // Get project and client info for email notification
          const project = await storage.getProject(negotiation.projectId);
          const client = await storage.getUserById(project?.clientId);

          if (project && client) {
            // Notify all admins about acceptance
            const adminUsers = await storage.getUsersByRole("admin");
            for (const admin of adminUsers) {
              try {
                if (admin.email) {
                  await sendEmail({
                    to: admin.email,
                    subject: `✅ Counter-offer Accepted: ${project.name} - $${negotiation.proposedPrice}`,
                    html: generateBudgetAcceptanceEmailHTML(
                      project.name,
                      client.fullName,
                      client.email,
                      negotiation.originalPrice,
                      negotiation.proposedPrice,
                      message || ""
                    ),
                  });
                  console.log(`✅ Counter-offer acceptance email sent to admin: ${admin.email}`);
                }
              } catch (adminError) {
                console.error(`❌ Error sending acceptance email to admin ${admin.id}:`, adminError);
              }
            }

            // Also send to the main system email
            try {
              await sendEmail({
                to: process.env.GMAIL_USER || 'softwarepar.lat@gmail.com',
                subject: `✅ Counter-offer Accepted: ${project.name} - $${negotiation.proposedPrice}`,
                html: generateBudgetAcceptanceEmailHTML(
                  project.name,
                  client.fullName,
                  client.email,
                  negotiation.originalPrice,
                  negotiation.proposedPrice,
                  message || ""
                ),
              });
              console.log(`✅ Acceptance email sent to main system email`);
            } catch (systemEmailError) {
              console.error(`❌ Error sending acceptance email to main system:`, systemEmailError);
            }
          }
        }
      }

      // If countering, create new negotiation
      if (status === "countered" && counterPrice) {
        const [oldNegotiation] = await db
          .select()
          .from(budgetNegotiations)
          .where(eq(budgetNegotiations.id, negotiationId))
          .limit(1);

        if (oldNegotiation) {
          await storage.createBudgetNegotiation({
            projectId: oldNegotiation.projectId,
            proposedBy: req.user!.id,
            originalPrice: oldNegotiation.proposedPrice,
            proposedPrice: counterPrice.toString(),
            message,
            status: "pending",
          });
        }
      }

      const updated = await storage.updateBudgetNegotiation(negotiationId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error responding to budget negotiation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ticket Routes
  app.get("/api/tickets", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const tickets = await storage.getTickets(req.user!.id);
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tickets", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { title, description, priority, projectId } = req.body;

      const ticketData = {
        title,
        description,
        priority: priority || "medium",
        userId: req.user!.id,
        projectId: projectId || null,
      };

      const ticket = await storage.createTicket(ticketData);

      // Notify admins about new ticket
      const adminUsers = await storage.getUsersByRole("admin");
      const adminIds = adminUsers.map(admin => admin.id);
      await notifyTicketCreated(adminIds, req.user!.fullName, title);

      // Send real-time event to admins for data update
      const { sendRealtimeEvent } = await import("./notifications");
      for (const adminId of adminIds) {
        sendRealtimeEvent(adminId, 'ticket_created', {
          ticketId: ticket.id,
          title: ticket.title,
          priority: ticket.priority,
          userId: req.user!.id
        });
      }

      res.status(201).json(ticket);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating ticket:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/tickets/:id/responses", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const { message } = req.body;

      // Get ticket info
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const response = await storage.createTicketResponse({
        ticketId,
        userId: req.user!.id,
        message,
        isFromSupport: req.user!.role === "admin",
      });

      // Notify the other party about the response
      const { sendRealtimeEvent } = await import("./notifications");
      if (req.user!.role === "admin") {
        // Admin responded, notify the ticket creator (client)
        await notifyTicketResponse(
          ticket.userId,
          req.user!.fullName,
          ticket.title,
          message,
          true
        );

        // Send real-time event to client
        sendRealtimeEvent(ticket.userId, 'ticket_updated', {
          ticketId: ticket.id,
          title: ticket.title
        });
      } else {
        // Client responded, notify admins
        const adminUsers = await storage.getUsersByRole("admin");
        for (const admin of adminUsers) {
          await notifyTicketResponse(
            admin.id,
            req.user!.fullName,
            ticket.title,
            message,
            false
          );

          // Send real-time event to admins
          sendRealtimeEvent(admin.id, 'ticket_updated', {
            ticketId: ticket.id,
            title: ticket.title,
            userId: ticket.userId
          });
        }
      }

      res.status(201).json(response);
    } catch (error) {
      console.error("Error creating ticket response:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/tickets/:id/responses", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const responses = await storage.getTicketResponses(ticketId);
      res.json(responses);
    } catch (error) {
      console.error("Error getting ticket responses:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Notification Routes
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notifications = await storage.getNotifications(req.user!.id);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationAsRead(notificationId);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Payment Stages Routes
  app.post("/api/projects/:id/payment-stages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { stages } = req.body;

      // Verify project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Create payment stages
      const createdStages = [];
      const availableStages = [];
      for (const stage of stages) {
        const stageData = {
          projectId: projectId,
          stageName: stage.name,
          stagePercentage: stage.percentage,
          amount: (parseFloat(project.price) * stage.percentage / 100),
          requiredProgress: stage.requiredProgress,
          status: stage.requiredProgress === 0 ? 'available' : 'pending'
        };
        const created = await storage.createPaymentStage(stageData);
        createdStages.push(created);

        // Collect available stages for notification
        if (stageData.status === 'available') {
          availableStages.push(created);
        }
      }

      // Notify client by email about available stages
      if (availableStages.length > 0) {
        const client = await storage.getUserById(project.clientId);
        if (client?.email) {
          for (const stage of availableStages) {
            try {
              const emailHtml = await generatePaymentStageAvailableEmailHTML(
                client.fullName,
                project.name,
                stage.stageName,
                stage.amount.toString(),
                stage.stagePercentage
              );

              await sendEmail({
                to: client.email,
                subject: `💰 Pago Disponible: ${project.name} - ${stage.stageName}`,
                html: emailHtml,
              });
              console.log(`📧 Email de etapa disponible enviado a cliente: ${client.email} para etapa: ${stage.stageName}`);
            } catch (emailError) {
              console.error(`❌ Error enviando email de etapa disponible al cliente:`, emailError);
            }
          }
        }
      }

      // Create timeline automatically only if one doesn't exist yet
      const hasTimeline = await storage.hasProjectTimeline(projectId);

      if (!hasTimeline) {
        const timelineItems = [
          {
            title: "Analysis and Planning",
            description: "Requirements analysis and project planning",
            status: "pending",
            estimatedDate: null
          },
          {
            title: "Design and Architecture",
            description: "Interface design and system architecture",
            status: "pending",
            estimatedDate: null
          },
          {
            title: "Development - Phase 1",
            description: "Core functionality development (50% of the project)",
            status: "pending",
            estimatedDate: null
          },
          {
            title: "Development - Phase 2",
            description: "Complete development and optimizations (90% of the project)",
            status: "pending",
            estimatedDate: null
          },
          {
            title: "Testing and QA",
            description: "Exhaustive testing and quality assurance",
            status: "pending",
            estimatedDate: null
          },
          {
            title: "Entrega Final",
            description: "Entrega del proyecto completado y documentación",
            status: "pending",
            estimatedDate: null
          }
        ];

        // Create timeline items
        for (const timelineItem of timelineItems) {
          await storage.createProjectTimeline({
            projectId: projectId,
            title: timelineItem.title,
            description: timelineItem.description,
            status: timelineItem.status,
            estimatedDate: timelineItem.estimatedDate,
          });
        }
      }

      res.json(createdStages);
    } catch (error) {
      console.error("Error creating payment stages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/projects/:id/payment-stages", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const stages = await storage.getPaymentStages(projectId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching payment stages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/payment-stages/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const updates = req.body;
      const updated = await storage.updatePaymentStage(stageId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating payment stage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/payment-stages/:id/complete", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const updated = await storage.completePaymentStage(stageId);
      res.json(updated);
    } catch (error) {
      console.error("Error completing payment stage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/payment-stages/:id/confirm-payment", authenticateToken, upload.single('proofFile'), async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);

      // Get form data (multipart/form-data)
      const paymentMethod = req.body.paymentMethod;
      const proofFileInfo = req.body.proofFileInfo ? JSON.parse(req.body.proofFileInfo) : null;
      const proofFile = req.file; // File processed by multer

      console.log(`💰 Processing payment confirmation for stage ${stageId}:`, {
        paymentMethod,
        hasFile: !!proofFile,
        fileName: proofFile?.originalname,
        fileSize: proofFile?.size,
        mimetype: proofFile?.mimetype
      });

      // Get stage info and project details
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        return res.status(404).json({ message: "Stage not found" });
      }

      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const client = await storage.getUserById(project.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      // Save file locally if uploaded
      let proofFileUrl = null;
      if (proofFile) {
        try {
          // Create uploads directory if it doesn't exist
          const uploadsDir = path.join(__dirname, '../uploads/payment-proofs');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }

          // Create unique filename
          const fileExtension = path.extname(proofFile.originalname);
          const fileName = `stage_${stageId}_${Date.now()}${fileExtension}`;
          const filePath = path.join(uploadsDir, fileName);

          // Save file to disk
          fs.writeFileSync(filePath, proofFile.buffer);
          proofFileUrl = fileName; // Store just the filename, not the full path

          console.log(`✅ Comprobante guardado localmente: ${fileName}`);
        } catch (storageError) {
          console.error(`❌ Error guardando comprobante localmente:`, storageError);
          return res.status(500).json({ message: "Error al guardar el comprobante" });
        }
      } else if (proofFileInfo) {
        proofFileUrl = `stage_${stageId}_${Date.now()}.${proofFileInfo.fileType?.split('/')[1] || 'jpg'}`;
      }

      const updated = await storage.updatePaymentStage(stageId, {
        paymentMethod,
        proofFileUrl,
        status: 'pending_verification',
        paymentData: {
          confirmedBy: req.user!.id,
          confirmedAt: new Date(),
          method: paymentMethod,
          fileInfo: proofFileInfo || (proofFile ? {
            fileName: proofFile.originalname,
            fileSize: proofFile.size,
            fileType: proofFile.mimetype
          } : null),
          originalFileName: proofFile?.originalname
        }
      });

      // Notify admin about payment confirmation
      const adminUsers = await storage.getUsersByRole("admin");
      for (const admin of adminUsers) {
        await storage.createNotification({
          userId: admin.id,
          title: "📋 Comprobante de Pago Recibido",
          message: `El cliente ${client.fullName} envió comprobante de pago para "${stage[0].stageName}" mediante ${paymentMethod}. ${proofFile ? `Comprobante: ${proofFile.originalname}` : 'Sin comprobante adjunto'}. Requiere verificación.`,
          type: "warning",
        });
      }

      // Send real-time event to admins for data update
      const { sendRealtimeEvent } = await import("./notifications");
      const adminIds = adminUsers.map(admin => admin.id);
      for (const adminId of adminIds) {
        sendRealtimeEvent(adminId, 'payment_proof_uploaded', {
          stageId: stage[0].id,
          projectId: stage[0].projectId,
          clientId: project.clientId,
          stageName: stage[0].stageName,
          paymentMethod
        });
      }

      // Send email notifications
      try {
        // Prepare file information for email
        let fileAttachmentInfo = null;
        if (proofFile) {
          const fileSizeMB = (proofFile.size / 1024 / 1024).toFixed(2);
          fileAttachmentInfo = `📎 Attached file: ${proofFile.originalname} (${fileSizeMB} MB) - Type: ${proofFile.mimetype}`;
          console.log(`📎 File received: ${proofFile.originalname}, Size: ${fileSizeMB}MB, Type: ${proofFile.mimetype}`);
        } else if (proofFileInfo) {
          const fileSizeMB = (proofFileInfo.fileSize / 1024 / 1024).toFixed(2);
          fileAttachmentInfo = `📎 Indicated file: ${proofFileInfo.fileName} (${fileSizeMB} MB) - ${proofFileInfo.fileType}`;
        } else {
          console.log(`ℹ️ No attachment provided for stage ${stageId}`);
        }

        // Notify admin via email with proof information
        await sendPaymentProofNotificationToAdmin(
          client.fullName,
          project.name,
          stage[0].stageName,
          stage[0].amount,
          paymentMethod,
          fileAttachmentInfo
        );

        // Confirm to client via email
        await sendPaymentProofConfirmationToClient(
          client.email,
          client.fullName,
          project.name,
          stage[0].stageName,
          stage[0].amount,
          paymentMethod
        );

        console.log(`📧 Email notifications sent for ${client.fullName}'s payment`);
      } catch (emailError) {
        console.error("❌ Error sending email notifications:", emailError);
        // Do not fail the operation due to email errors
      }

      res.json({
        ...updated,
        message: "Proof submitted successfully. Your payment is pending verification by our team. We will notify you upon approval.",
      });
    } catch (error) {
      console.error("❌ Error confirming payment stage:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/payment-stages/:id/approve-payment", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);
      console.log(`✅ Admin approving payment for stage: ${stageId}`);

      // Get stage info and project details
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        console.error(`❌ Stage ${stageId} not found`);
        return res.status(404).json({ message: "Stage not found" });
      }

      if (stage[0].status !== 'pending_verification') {
        return res.status(400).json({ message: "This stage is not pending verification" });
      }

      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        console.error(`❌ Project ${stage[0].projectId} not found`);
        return res.status(404).json({ message: "Project not found" });
      }

      const client = await storage.getUserById(project.clientId);
      if (!client) {
        console.error(`❌ Client ${project.clientId} not found`);
        return res.status(404).json({ message: "Client not found" });
      }

      // IMPORTANT: Get the current exchange rate and save it permanently with this payment
      const exchangeRateData = await storage.getCurrentExchangeRate();
      const currentExchangeRate = exchangeRateData ? exchangeRateData.usdToGuarani : "7300.00";

      console.log(`💱 Saving exchange rate at the time of payment: 1 USD = ${currentExchangeRate} PYG for stage ${stageId}`);

      // Update stage to paid with the fixed current exchange rate
      const updated = await storage.updatePaymentStage(stageId, {
        status: 'paid',
        paidAt: new Date(),
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        exchangeRateUsed: currentExchangeRate
      });

      // Notify client about payment approval
      await storage.createNotification({
        userId: project.clientId,
        title: "✅ Pago Aprobado",
        message: `Tu pago para la etapa "${stage[0].stageName}" ha sido verificado y aprobado. ¡Continuamos con el desarrollo!`,
        type: "success",
      });

      // Send email notification to client about payment approval
      if (client?.email) {
        try {
          const { generatePaymentApprovedEmailHTML } = await import('./email');
          const emailHtml = await generatePaymentApprovedEmailHTML(
            client.fullName,
            project.name,
            stage[0].stageName,
            stage[0].amount.toString(),
            stage[0].paymentMethod || 'Transferencia Bancaria',
            stage[0].paidAt ? new Date(stage[0].paidAt).toLocaleDateString('es-PY') : new Date().toLocaleDateString('es-PY')
          );

          await sendEmail({
            to: client.email,
            subject: `✅ Pago Aprobado: ${project.name} - ${stage[0].stageName}`,
            html: emailHtml,
          });

          console.log(`📧 Email de pago aprobado enviado a cliente: ${client.email}`);
        } catch (emailError) {
          console.error(`❌ Error enviando email de pago aprobado al cliente:`, emailError);
        }
      }

      // Send real-time event to client and admins for data update
      const { sendRealtimeEvent } = await import("./notifications");
      sendRealtimeEvent(project.clientId, 'payment_approved', {
        stageId: stage[0].id,
        projectId: stage[0].projectId,
        stageName: stage[0].stageName
      });

      // Also notify all admins
      const adminUsers = await storage.getUsersByRole("admin");
      for (const admin of adminUsers) {
        sendRealtimeEvent(admin.id, 'payment_approved', {
          stageId: stage[0].id,
          projectId: stage[0].projectId,
          clientId: project.clientId,
          stageName: stage[0].stageName
        });
      }

      // ** NEW: Create/update invoice and process with FacturaSend **
      console.log(`📄 Generating invoice for stage ${stageId}...`);

      // Get company info
      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .limit(1);

      if (companyInfo[0]) {
        // Check if an invoice already exists for this stage
        const existingInvoice = await db
          .select()
          .from(invoices)
          .where(eq(invoices.paymentStageId, stageId))
          .limit(1);

        let newInvoice = existingInvoice[0];
        let boletaNumber = existingInvoice[0]?.invoiceNumber;
        let shouldSendToFacturaSend = false;

        if (!existingInvoice[0]) {
          // Generate invoice number
          const boletaPrefix = companyInfo[0].boletaPrefix || '001-001';
          const currentSequence = companyInfo[0].boletaSequence || 1;
          boletaNumber = `${boletaPrefix}-${String(currentSequence).padStart(7, '0')}`;

          // Get client billing info to create snapshot
          const clientInfo = await db
            .select()
            .from(clientBillingInfo)
            .where(eq(clientBillingInfo.userId, project.clientId))
            .limit(1);

          const clientData = clientInfo[0] || {};

          // Create invoice in DB with client snapshot
          const amountValue = stage[0].amount;
          [newInvoice] = await db.insert(invoices).values({
            projectId: stage[0].projectId,
            clientId: project.clientId,
            paymentStageId: stageId,
            invoiceNumber: boletaNumber,
            amount: amountValue,
            totalAmount: amountValue,
            taxAmount: '0.00',
            discountAmount: '0.00',
            currency: 'USD',
            status: 'paid',
            dueDate: new Date(),
            paidDate: stage[0].paidAt || new Date(),
            exchangeRateUsed: currentExchangeRate,
            // Snapshot de datos de facturación del cliente (congelados)
            clientSnapshotType: clientData.clientType,
            clientSnapshotLegalName: clientData.legalName,
            clientSnapshotDocumentType: clientData.documentType,
            clientSnapshotDocumentNumber: clientData.documentNumber,
            clientSnapshotAddress: clientData.address,
            clientSnapshotCity: clientData.city,
            clientSnapshotDepartment: clientData.department,
            clientSnapshotCountry: clientData.country,
            clientSnapshotEmail: clientData.email,
            clientSnapshotPhone: clientData.phone,
          }).returning();

          // Update invoice sequence
          await db.update(companyBillingInfo)
            .set({ boletaSequence: currentSequence + 1 })
            .where(eq(companyBillingInfo.id, companyInfo[0].id));

          console.log(`✅ Invoice created: ${boletaNumber}`);
          shouldSendToFacturaSend = true;
        } else if (existingInvoice[0].sifenCDC) {
          console.log(`ℹ️ Invoice ${boletaNumber} already sent to FacturaSend (CDC: ${existingInvoice[0].sifenCDC})`);
          shouldSendToFacturaSend = false;
        } else {
          console.log(`⚠️ Invoice ${boletaNumber} exists but has no CDC, retrying send...`);
          shouldSendToFacturaSend = true;
        }

        // ** PROCESS WITH FACTURASEND IN BACKGROUND (only if necessary) **
        if (shouldSendToFacturaSend) {
          import('./facturasend').then(async (facturasend) => {
            try {
              console.log(`🔄 Starting FacturaSend process for invoice ${boletaNumber}...`);

            const clientInfo = await db
              .select()
              .from(clientBillingInfo)
              .where(eq(clientBillingInfo.userId, client.id))
              .limit(1);

            const exchangeRate = parseFloat(currentExchangeRate);

            const numeroDocumento = parseInt(boletaNumber.split('-').pop() || '1');

            const clientData = clientInfo[0] || {};
            if (!clientData.user) {
              clientData.user = client;
            }

            // Get all stages to determine stage number
            const allStages = await storage.getPaymentStages(stage[0].projectId);
            const sortedStages = allStages.sort((a: any, b: any) => a.requiredProgress - b.requiredProgress);
            const stageNumber = sortedStages.findIndex((s: any) => s.id === stage[0].id) + 1;
            const totalStages = sortedStages.length;

            // Add stage number info to the stage object
            const stageWithInfo = {
              ...stage[0],
              stageNumber,
              totalStages
            };

            const documento = await facturasend.construirDocumentoFacturaSend(
              companyInfo[0],
              clientData,
              stageWithInfo,
              project,
              exchangeRate,
              numeroDocumento
            );

            console.log(`📤 Sending to FacturaSend...`);
            const respuestaAPI = await facturasend.enviarFacturaFacturaSend(documento);

            const resultado = facturasend.extraerResultadoFacturaSend(respuestaAPI);

            // Truncate QR URL if too long (max 1000 characters)
            const qrUrlTruncated = resultado.qr && resultado.qr.length > 1000
              ? resultado.qr.substring(0, 1000)
              : resultado.qr;

            await db.update(invoices)
              .set({
                sifenCDC: resultado.cdc,
                sifenProtocolo: resultado.protocoloAutorizacion,
                sifenEstado: resultado.estado,
                sifenFechaEnvio: new Date(),
                sifenMensajeError: resultado.mensaje,
                sifenXML: resultado.xml,
                sifenQR: qrUrlTruncated || null,
                updatedAt: new Date()
              })
              .where(eq(invoices.id, newInvoice.id));

            console.log(`✅ Invoice updated with FacturaSend data:`);
            console.log(`   📋 CDC: ${resultado.cdc || 'Not available'}`);
            console.log(`   📱 QR URL: ${qrUrlTruncated ? 'Available (' + qrUrlTruncated.length + ' chars)' : 'Not available'}`);
            console.log(`   📊 Status: ${resultado.estado}`);
            console.log(`   📝 Protocol: ${resultado.protocoloAutorizacion}`);

            console.log(`${resultado.estado === 'aceptado' ? '✅' : '❌'} FacturaSend: ${resultado.estado.toUpperCase()}`);
            if (resultado.cdc) {
              console.log(`📋 Generated CDC: ${resultado.cdc}`);
            }
            if (resultado.protocoloAutorizacion) {
              console.log(`🔐 Protocol: ${resultado.protocoloAutorizacion}`);
            }
            if (resultado.mensaje) {
              console.log(`💬 Message: ${resultado.mensaje}`);
            }
          } catch (facturasendError) {
            console.error('❌ Error processing FacturaSend:', facturasendError);
            }
          }).catch(err => {
            console.error('❌ Error importing FacturaSend module:', err);
          });
        } else {
          console.log(`✅ Invoice ${boletaNumber} already processed, skipping FacturaSend`);
        }
      }

      res.json({
        ...updated,
        message: "Payment approved successfully"
      });
    } catch (error) {
      console.error("❌ Error approving payment:", error);
      res.status(500).json({
        message: "Error approving payment",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  app.post("/api/payment-stages/:id/reject-payment", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const { reason } = req.body;
      console.log(`❌ Admin rejecting payment for stage: ${stageId}, reason: ${reason}`);

      // Get stage info and project details
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        console.error(`❌ Stage ${stageId} not found`);
        return res.status(404).json({ message: "Stage not found" });
      }

      if (stage[0].status !== 'pending_verification') {
        return res.status(400).json({ message: "This stage is not pending verification" });
      }

      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        console.error(`❌ Project ${stage[0].projectId} not found`);
        return res.status(404).json({ message: "Project not found" });
      }

      const client = await storage.getUserById(project.clientId);
      if (!client) {
        console.error(`❌ Client ${project.clientId} not found`);
        return res.status(404).json({ message: "Client not found" });
      }

      // Update stage back to available and clean payment data
      const updated = await storage.updatePaymentStage(stageId, {
        status: 'available',
        paymentMethod: null,
        proofFileUrl: null,
        paymentData: {
          rejectedBy: req.user!.id,
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });

      // Notify client about payment rejection (in-app)
      await storage.createNotification({
        userId: project.clientId,
        title: "❌ Pago Rechazado",
        message: `Tu comprobante de pago para "${stage[0].stageName}" fue rechazado. Motivo: ${reason}. Por favor envía un nuevo comprobante.`,
        type: "error",
      });

      // Send email notification to client about payment rejection
      if (client?.email) {
        try {
          const { generatePaymentRejectedEmailHTML } = await import('./email');
          const emailHtml = await generatePaymentRejectedEmailHTML(
            client.fullName,
            project.name,
            stage[0].stageName,
            stage[0].amount.toString(),
            stage[0].paymentMethod || 'Transferencia Bancaria',
            reason
          );

          await sendEmail({
            to: client.email,
            subject: `❌ Pago Rechazado: ${project.name} - ${stage[0].stageName}`,
            html: emailHtml,
          });

          console.log(`📧 Email de pago rechazado enviado a cliente: ${client.email}`);
        } catch (emailError) {
          console.error(`❌ Error enviando email de pago rechazado al cliente:`, emailError);
        }
      }

      // Send real-time event to client and admins for data update
      const { sendRealtimeEvent } = await import("./notifications");
      sendRealtimeEvent(project.clientId, 'payment_rejected', {
        stageId: stage[0].id,
        projectId: stage[0].projectId,
        stageName: stage[0].stageName,
        reason
      });

      // Also notify all admins
      const adminUsers = await storage.getUsersByRole("admin");
      for (const admin of adminUsers) {
        sendRealtimeEvent(admin.id, 'payment_rejected', {
          stageId: stage[0].id,
          projectId: stage[0].projectId,
          clientId: project.clientId,
          stageName: stage[0].stageName,
          reason
        });
      }

      res.json({
        ...updated,
        message: "Payment rejected and client notified"
      });
    } catch (error) {
      console.error("❌ Error rejecting payment:", error);
      res.status(500).json({
        message: "Error rejecting payment",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  app.get("/api/payment-stages/:id/receipt-file", async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.id);

      // Verificar autenticación - permitir token en query param o header
      const tokenFromQuery = req.query.token as string;
      const tokenFromHeader = req.headers.authorization?.split(' ')[1];
      const token = tokenFromQuery || tokenFromHeader;

      if (!token) {
        return res.status(401).json({ message: "No authentication token provided" });
      }

      // Verificar el token JWT
      const { verifyToken } = await import('./auth');

      let userId: number;
      let userRole: string;

      const decoded = verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Obtener usuario completo para verificar permisos
      const user = await storage.getUserById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "User not found or inactive" });
      }

      userId = user.id;
      userRole = user.role;

      // Get stage info
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        return res.status(404).json({ message: "Stage not found" });
      }

      // Check if user has permission to view this file
      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Only admin or project client can view the receipt
      if (userRole !== "admin" && project.clientId !== userId) {
        return res.status(403).json({ message: "You do not have permission to view this file" });
      }

      // Check if there's a payment proof file
      if (!stage[0].proofFileUrl) {
        return res.status(404).json({ message: "No proof available" });
      }

      // Try to retrieve file from local storage
      try {
        const uploadsDir = path.join(__dirname, '../uploads/payment-proofs');
        const filePath = path.join(uploadsDir, stage[0].proofFileUrl);

        console.log(`🔍 Intentando descargar: ${filePath}`);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.error(`❌ Archivo no encontrado: ${filePath}`);
          return res.status(404).json({ message: "Comprobante no encontrado en el servidor" });
        }

        // Read file from disk
        const fileBuffer = fs.readFileSync(filePath);

        // Get file info
        const fileInfo = stage[0].paymentData?.fileInfo || {};
        const fileName = stage[0].paymentData?.originalFileName || "comprobante.jpg";
        const fileType = fileInfo.fileType || "image/jpeg";

        console.log(`✅ Archivo descargado: ${fileBuffer.length} bytes`);

        // Set appropriate headers
        res.setHeader('Content-Type', fileType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Content-Length', fileBuffer.length);

        // Send file
        res.send(fileBuffer);

        console.log(`✅ Comprobante servido desde almacenamiento local: ${stage[0].proofFileUrl}`);
      } catch (storageError) {
        console.error("❌ Error retrieving file from local storage:", storageError);
        console.error("❌ Stack:", storageError instanceof Error ? storageError.stack : 'No stack trace');

        return res.status(500).json({
          message: "Error al recuperar el comprobante",
          error: process.env.NODE_ENV === 'development' ? (storageError instanceof Error ? storageError.message : 'Unknown error') : undefined
        });
      }
    } catch (error) {
      console.error("❌ Error serving receipt file:", error);
      res.status(500).json({
        message: "Error serving file",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
      });
    }
  });

  // Endpoint to download stage payment invoice
  app.get("/api/client/stage-invoices/:stageId/download", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.stageId);

      if (isNaN(stageId)) {
        return res.status(400).json({ message: "Invalid stage ID" });
      }

      // Get stage info
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        return res.status(404).json({ message: "Stage not found" });
      }

      // Get project info
      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify that the stage belongs to the client
      if (project.clientId !== req.user!.id) {
        return res.status(403).json({ message: "You do not have permission to view this invoice" });
      }

      // Verify that the stage has been paid
      if (stage[0].status !== 'paid') {
        return res.status(400).json({ message: "This stage has not been paid yet" });
      }

      // Get all stages to determine which stage number this is
      const allStages = await storage.getPaymentStages(stage[0].projectId);
      const sortedStages = allStages.sort((a: any, b: any) => a.requiredProgress - b.requiredProgress);
      const stageNumber = sortedStages.findIndex(s => s.id === stage[0].id) + 1;
      const totalStages = sortedStages.length;

      // Get current exchange rate and convert to guaraníes
      const exchangeRateData = await storage.getCurrentExchangeRate();
      const exchangeRate = exchangeRateData ? parseFloat(exchangeRateData.usdToGuarani) : 7300;
      const amountUSD = parseFloat(stage[0].amount);
      const amountPYG = Math.round(amountUSD * exchangeRate);

      // Get company billing info
      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .orderBy(desc(companyBillingInfo.updatedAt))
        .limit(1);
      const company = companyInfo[0];

      // Get invoice data for CDC info
      const invoiceData = await db
        .select()
        .from(invoices)
        .where(eq(invoices.paymentStageId, stageId))
        .limit(1);
      
      const cdcInfo = invoiceData[0] ? {
        cdc: invoiceData[0].sifenCDC,
        qrUrl: invoiceData[0].sifenQR
      } : null;

      // Generate professional invoice number
      const invoiceNumber = invoiceData[0]?.invoiceNumber || `${String(new Date().getFullYear()).slice(-2)}${String(stage[0].projectId).padStart(4, '0')}`;
      const issueDate = new Date().toLocaleDateString('es-PY');

      // Create PDF document with A4 size
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SoftwarePar_Factura_${invoiceNumber}_Etapa_${stageNumber}.pdf"`);

      // Handle PDF stream errors
      doc.on('error', (error) => {
        console.error('Error al generar PDF:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error al generar PDF" });
        }
      });

      // Pipe PDF to response
      doc.pipe(res);

      // Page dimensions
      const pageWidth = 595;
      const leftMargin = 50;
      const rightMargin = 50;
      const contentWidth = pageWidth - leftMargin - rightMargin;

      // Logo
      try {
        const logoPath = path.join(__dirname, '../attached_assets/image_1767296553782.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, leftMargin, 20, { width: 150 });
        } else {
          // Fallback if the logo doesn't exist
          doc.fontSize(20).fillColor('#2563eb').text('SoftwarePar', leftMargin, 30);
        }
      } catch (e) {
        console.error('Error al cargar logo:', e);
        doc.fontSize(20).fillColor('#2563eb').text('SoftwarePar', leftMargin, 30);
      }

      // INVOICE title on the right
      doc.fontSize(28).fillColor('#2563eb').text('FACTURA', pageWidth - 200, 25);

      // Company details below header
      let yPos = 120;
      doc.fontSize(12).fillColor('#000').font('Helvetica-Bold').text('SOFTWAREPAR', leftMargin, yPos);
      yPos += 15;
      doc.fontSize(10).fillColor('#6b7280').font('Helvetica');
      doc.text('Paraguay', leftMargin, yPos);
      doc.text('Teléfono: +595 985 990 046', leftMargin, yPos + 12);
      doc.text('Email: softwarepar.lat@gmail.com', leftMargin, yPos + 24);

      // Invoice details on the right
      const rightColumnX = 350;
      let rightYPos = 120;
      doc.fontSize(10).fillColor('#374151');
      doc.text('Fecha:', rightColumnX, rightYPos);
      doc.text('Factura #:', rightColumnX, rightYPos + 15);
      doc.text('Etapa de Pago:', rightColumnX, rightYPos + 30);

      doc.fontSize(10).fillColor('#000');
      doc.text(issueDate, rightColumnX + 80, rightYPos);
      doc.text(invoiceNumber, rightColumnX + 80, rightYPos + 15);
      doc.text(`${stageNumber} de ${totalStages}`, rightColumnX + 80, rightYPos + 30);

      // Bill To section
      yPos = 220;
      doc.rect(leftMargin, yPos, contentWidth, 20).fillColor('#2563eb').fill();
      doc.fontSize(11).fillColor('#ffffff').text('Facturar a:', leftMargin + 10, yPos + 5);

      yPos += 30;
      doc.fontSize(11).fillColor('#000').font('Helvetica-Bold');
      doc.text(req.user!.fullName, leftMargin + 10, yPos);
      doc.font('Helvetica').fontSize(10);
      doc.text(req.user!.email, leftMargin + 10, yPos + 15);
      doc.text(`ID Cliente: ${req.user!.id.toString().padStart(6, '0')}`, leftMargin + 10, yPos + 30);
      doc.text(`Proyecto: ${project.name}`, leftMargin + 10, yPos + 45);

      // Table header
      yPos = 310;
      const tableX = leftMargin;
      const tableWidth = contentWidth;
      const rowHeight = 25;

      doc.rect(tableX, yPos, tableWidth, rowHeight).fillColor('#2563eb').fill();

      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('Cant.', tableX + 10, yPos + 7);
      doc.text('Descripción', tableX + 60, yPos + 7);
      doc.text('Precio Unit.', tableX + 320, yPos + 7);
      doc.text('Total', tableX + 420, yPos + 7);

      // Table rows
      const rows = [
        {
          qty: '1',
          description: `${stage[0].stageName} - Etapa ${stageNumber} de ${totalStages}`.replace('Initial Payment', 'Pago Inicial').replace('Payment Stage', 'Etapa de Pago').replace('Final Payment', 'Pago Final'),
          unitPrice: `$ ${amountUSD.toFixed(2)} USD`,
          amount: `$ ${amountUSD.toFixed(2)} USD`
        },
        {
          qty: '',
          description: `Equivalente en Guaraníes (1 USD = ₲ ${exchangeRate.toLocaleString('es-PY')})`,
          unitPrice: `₲ ${amountPYG.toLocaleString('es-PY')}`,
          amount: `₲ ${amountPYG.toLocaleString('es-PY')}`
        }
      ];

      yPos += rowHeight;
      doc.font('Helvetica').fontSize(10).fillColor('#000');

      rows.forEach((row) => {
        doc.rect(tableX, yPos, tableWidth, rowHeight).strokeColor('#e5e7eb').stroke();
        doc.text(row.qty, tableX + 15, yPos + 8);
        doc.text(row.description, tableX + 60, yPos + 8);
        doc.text(row.unitPrice, tableX + 320, yPos + 8);
        doc.text(row.amount, tableX + 420, yPos + 8);
        yPos += rowHeight;
      });

      // Fill empty rows
      for (let i = 0; i < 5; i++) {
        doc.rect(tableX, yPos, tableWidth, rowHeight).strokeColor('#e5e7eb').stroke();
        yPos += rowHeight;
      }

      // Totals section
      yPos += 10;
      const totalsX = 350;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Subtotal USD:', totalsX, yPos);
      doc.font('Helvetica').text(`USD ${amountUSD.toFixed(2)}`, totalsX + 100, yPos);
      
      yPos += 15;
      doc.font('Helvetica-Bold');
      doc.text('Subtotal ₲:', totalsX, yPos);
      doc.font('Helvetica').text(`₲ ${amountPYG.toLocaleString('es-PY')}`, totalsX + 100, yPos);

      yPos += 15;
      doc.font('Helvetica-Bold');
      doc.text('IVA (Exento):', totalsX, yPos);
      doc.font('Helvetica').text('0%', totalsX + 100, yPos);

      yPos += 20;
      doc.rect(totalsX - 10, yPos - 5, 160, 25).fillColor('#2563eb').fill();
      doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('TOTAL:', totalsX, yPos);
      doc.text(`₲ ${amountPYG.toLocaleString('es-PY')}`, totalsX + 70, yPos);

      // QR Code and CDC Section (Solo si hay CDC de SIFEN)
      if (cdcInfo && cdcInfo.cdc) {
        yPos += 40;
        doc.rect(leftMargin, yPos, contentWidth, 110).strokeColor('#000000').lineWidth(1).stroke();

        const qrSize = 85;
        const qrX = leftMargin + 10;
        const qrY = yPos + 12;

        if (cdcInfo.qrUrl) {
          try {
            const qrDataUrl = await QRCode.toDataURL(cdcInfo.qrUrl, { margin: 1 });
            const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
            doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
          } catch (e) {
            console.error('Error QR:', e);
          }
        }

        const textX = qrX + qrSize + 15;
        const textWidth = contentWidth - qrSize - 40;
        let textY = yPos + 15;

        doc.fontSize(10).fillColor('#000000').font('Helvetica');
        doc.text('Consulte la validez de este Documento Electrónico con el número de CDC impreso', textX, textY, { width: textWidth });
        
        textY += 15;
        doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold');
        doc.text('https://ekuatia.set.gov.py/consultas', textX, textY, { link: 'https://ekuatia.set.gov.py/consultas', underline: true });

        textY += 20;
        const cdcFormatted = cdcInfo.cdc.match(/.{1,4}/g)?.join(' ') || cdcInfo.cdc;
        doc.fontSize(11).text(`CDC:  ${cdcFormatted}`, textX, textY, { width: textWidth });

        textY += 25;
        doc.fontSize(10).text('ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)', textX, textY, { width: textWidth });
        
        yPos += 130;
      } else {
        // Footer legal note fallback
        yPos += 60;
        doc.fontSize(8).fillColor('#4b5563').font('Helvetica');
        doc.text('Régimen Tributario: Servicios Digitales (Ley 125/91) - IVA Exento', leftMargin, yPos, { align: 'center', width: contentWidth });
        
        if (company?.isSignatureProcessEnabled) {
          yPos += 20;
          doc.fontSize(9).fillColor('#991b1b').font('Helvetica-Bold');
          doc.text('FIRMA DIGITAL EN PROCESO - ESTE DOCUMENTO ES UNA CONSTANCIA DE PAGO INTERNA', leftMargin, yPos, { align: 'center', width: contentWidth });
        }
      }

      yPos += 30;
      doc.fontSize(14).fillColor('#2563eb').font('Helvetica-Bold').text('¡Gracias por confiar en SoftwarePar!', leftMargin, yPos, { align: 'center', width: contentWidth });

      // Finalize PDF
      doc.end();

    } catch (error) {
      console.error("❌ Error downloading stage invoice:", error);
      if (!res.headersSent) {
        res.status(500).json({
          message: "Internal server error",
          error: process.env.NODE_ENV === 'development' ? error.message : 'Error generating invoice'
        });
      }
    }
  });

  // Endpoint to download RESIMPLE Boleta (simplified version according to SET Paraguay)
  app.get("/api/client/stage-invoices/:stageId/download-resimple", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const stageId = parseInt(req.params.stageId);

      if (isNaN(stageId)) {
        return res.status(400).json({ message: "Invalid stage ID" });
      }

      // Get stage info
      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        return res.status(404).json({ message: "Stage not found" });
      }

      // Get project info
      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify that the stage belongs to the client
      if (project.clientId !== req.user!.id) {
        return res.status(403).json({ message: "You do not have permission to view this invoice" });
      }

      // Verify that the stage has been paid
      if (stage[0].status !== 'paid') {
        return res.status(400).json({ message: "This stage has not been paid yet" });
      }

      // Get company billing info
      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .orderBy(sql`${companyBillingInfo.updatedAt} DESC`)
        .limit(1);

      // Get invoice data first to use snapshot
      const invoiceData = await db
        .select()
        .from(invoices)
        .where(eq(invoices.paymentStageId, stageId))
        .limit(1);

      // Get all stages to determine stage info
      const allStages = await storage.getPaymentStages(stage[0].projectId);
      const sortedStages = allStages.sort((a: any, b: any) => a.requiredProgress - b.requiredProgress);
      const stageNumber = sortedStages.findIndex(s => s.id === stage[0].id) + 1;
      const totalStages = sortedStages.length;

      // ALWAYS use the exchange rate that was saved at the time of payment
      let exchangeRate: number;
      if (stage[0].exchangeRateUsed) {
        exchangeRate = parseFloat(stage[0].exchangeRateUsed);
        console.log(`✅ Using SAVED exchange rate at the time of payment: ${exchangeRate} PYG/USD`);
      } else {
        const exchangeRateData = await storage.getCurrentExchangeRate();
        exchangeRate = exchangeRateData ? parseFloat(exchangeRateData.usdToGuarani) : 7300;
        console.log(`⚠️ Old payment without saved exchange rate. Saving current exchange rate (${exchangeRate}) for this payment.`);

        await db.update(paymentStages)
          .set({
            exchangeRateUsed: exchangeRate.toString(),
            updatedAt: new Date()
          })
          .where(eq(paymentStages.id, stageId));
      }

      const amountUSD = parseFloat(stage[0].amount);
      const amountPYG = Math.round(amountUSD * exchangeRate);

      // **CRÍTICO**: SIEMPRE usar fecha/hora guardada en la factura (INMUTABLE)
      let issueDate: string;
      let issueDateTime: string;

      if (invoiceData.length > 0 && invoiceData[0].issueDateSnapshot && invoiceData[0].issueDateTimeSnapshot) {
        // ✅ Usar las fechas inmutables guardadas en la factura
        issueDate = invoiceData[0].issueDateSnapshot;
        issueDateTime = invoiceData[0].issueDateTimeSnapshot;
        console.log(`✅ Using IMMUTABLE issue date from invoice: ${issueDateTime}`);
      } else {
        // ❌ ERROR: La factura NO tiene fecha guardada - generar y guardar AHORA
        const now = new Date();
        issueDate = now.toLocaleDateString('es-PY');
        issueDateTime = now.toLocaleString('es-PY', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        console.log(`⚠️ CRITICAL: Invoice ${invoiceData[0]?.invoiceNumber || 'unknown'} missing issue date - saving NOW: ${issueDateTime}`);

        // Guardar la fecha inmutable en la base de datos AHORA
        if (invoiceData.length > 0) {
          await db.update(invoices)
            .set({
              issueDateSnapshot: issueDate,
              issueDateTimeSnapshot: issueDateTime,
              updatedAt: new Date()
            })
            .where(eq(invoices.id, invoiceData[0].id));

          console.log(`✅ Issue date saved to invoice ${invoiceData[0].invoiceNumber}: ${issueDateTime}`);
        }
      }

      // Extract company data before creating PDF (with fallbacks)
      const company = companyInfo && companyInfo.length > 0 ? companyInfo[0] : null;

      // Use snapshot data from invoice if available (frozen at invoice creation), otherwise fetch current data
      let client = null;
      const hasSnapshot = invoiceData.length > 0 &&
                         invoiceData[0] &&
                         invoiceData[0].clientSnapshotLegalName !== null;

      if (hasSnapshot) {
        // Use frozen snapshot from invoice (ensures legal accuracy)
        client = {
          clientType: invoiceData[0].clientSnapshotType,
          legalName: invoiceData[0].clientSnapshotLegalName,
          documentType: invoiceData[0].clientSnapshotDocumentType,
          documentNumber: invoiceData[0].clientSnapshotDocumentNumber,
          address: invoiceData[0].clientSnapshotAddress,
          city: invoiceData[0].clientSnapshotCity,
          department: invoiceData[0].clientSnapshotDepartment,
          country: invoiceData[0].clientSnapshotCountry,
          email: invoiceData[0].clientSnapshotEmail,
          phone: invoiceData[0].clientSnapshotPhone,
        };
        console.log(`✅ Using FROZEN client billing data from invoice snapshot`);
      } else {
        // Graceful fallback for legacy invoices without snapshot
        const clientInfo = await db
          .select()
          .from(clientBillingInfo)
          .where(eq(clientBillingInfo.userId, req.user!.id))
          .limit(1);
        client = clientInfo && clientInfo.length > 0 ? clientInfo[0] : null;
        console.log(`⚠️ No snapshot found (legacy invoice) - using current client billing data as fallback`);
      }

      // ** GET ELECTRONIC INVOICING DATA **

      let cdcInfo = null;
      if (invoiceData.length > 0 && invoiceData[0].sifenCDC) {
        cdcInfo = {
          cdc: invoiceData[0].sifenCDC,
          qrUrl: invoiceData[0].sifenQR,
          consultaUrl: 'https://ekuatia.set.gov.py/consultas'
        };
        console.log(`📋 Electronic invoice found - CDC: ${cdcInfo.cdc}`);
        console.log(`📱 QR URL: ${cdcInfo.qrUrl ? 'Available' : 'Not available'}`);
      } else {
        console.log(`⚠️ No electronic invoice found for this stage`);
      }

      // Check if an invoice already exists for this payment stage
      let boletaNumber: string;
      const existingInvoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.paymentStageId, stageId))
        .limit(1);

      if (existingInvoice.length > 0 && existingInvoice[0].invoiceNumber) {
        boletaNumber = existingInvoice[0].invoiceNumber;
        console.log(`✅ Reusing existing invoice number: ${boletaNumber} for stage ${stageId}`);
      } else {
        const boletaPrefix = company?.boletaPrefix || '001-001';
        const currentSequence = company?.boletaSequence || 1;
        boletaNumber = `${boletaPrefix}-${String(currentSequence).padStart(7, '0')}`;

        if (company) {
          await db.update(companyBillingInfo)
            .set({ boletaSequence: currentSequence + 1 })
            .where(eq(companyBillingInfo.id, company.id));
        }

        if (existingInvoice.length > 0) {
          const updateData: any = {
            invoiceNumber: boletaNumber,
            updatedAt: new Date()
          };

          if (stage[0].exchangeRateUsed || exchangeRate) {
            updateData.exchangeRateUsed = stage[0].exchangeRateUsed || exchangeRate.toString();
          }

          // Si la factura existente NO tiene snapshot, agregarlo ahora (para facturas legacy)
          if (existingInvoice[0].clientSnapshotLegalName === null && client) {
            updateData.clientSnapshotType = client.clientType;
            updateData.clientSnapshotLegalName = client.legalName;
            updateData.clientSnapshotDocumentType = client.documentType;
            updateData.clientSnapshotDocumentNumber = client.documentNumber;
            updateData.clientSnapshotAddress = client.address;
            updateData.clientSnapshotCity = client.city;
            updateData.clientSnapshotDepartment = client.department;
            updateData.clientSnapshotCountry = client.country;
            updateData.clientSnapshotEmail = client.email;
            updateData.clientSnapshotPhone = client.phone;
            console.log(`📸 Adding missing client snapshot to invoice ${boletaNumber}`);
          }

          // **CRÍTICO**: Si la factura NO tiene fecha de emisión, agregarla ahora y congelarla
          if (!existingInvoice[0].issueDateSnapshot || !existingInvoice[0].issueDateTimeSnapshot) {
            updateData.issueDateSnapshot = issueDate;
            updateData.issueDateTimeSnapshot = issueDateTime;
            console.log(`📸 Adding IMMUTABLE issue date to invoice ${boletaNumber}`);
          }

          await db.update(invoices)
            .set(updateData)
            .where(eq(invoices.id, existingInvoice[0].id));
        } else {
          // **CRÍTICO**: Al crear una factura nueva, SIEMPRE guardar snapshot del cliente
          // Obtener datos actuales del cliente para el snapshot
          const clientInfoForSnapshot = await db
            .select()
            .from(clientBillingInfo)
            .where(eq(clientBillingInfo.userId, req.user!.id))
            .limit(1);

          const clientSnapshot = clientInfoForSnapshot && clientInfoForSnapshot.length > 0
            ? clientInfoForSnapshot[0]
            : null;

          const amountValue = stage[0].amount;

          // **CRÍTICO**: Generar fecha de emisión AHORA y guardarla como INMUTABLE
          const now = new Date();
          const newIssueDate = now.toLocaleDateString('es-PY');
          const newIssueDateTime = now.toLocaleString('es-PY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          await db.insert(invoices).values({
            projectId: stage[0].projectId,
            clientId: req.user!.id,
            paymentStageId: stageId,
            invoiceNumber: boletaNumber,
            amount: amountValue,
            totalAmount: amountValue,
            taxAmount: '0.00',
            discountAmount: '0.00',
            currency: 'USD',
            status: 'paid',
            dueDate: new Date(),
            paidDate: stage[0].paidAt || new Date(),
            exchangeRateUsed: exchangeRate.toString(),
            // **SNAPSHOT INMUTABLE**: Datos del cliente congelados al momento de la creación
            clientSnapshotType: clientSnapshot?.clientType,
            clientSnapshotLegalName: clientSnapshot?.legalName,
            clientSnapshotDocumentType: clientSnapshot?.documentType,
            clientSnapshotDocumentNumber: clientSnapshot?.documentNumber,
            clientSnapshotAddress: clientSnapshot?.address,
            clientSnapshotCity: clientSnapshot?.city,
            clientSnapshotDepartment: clientSnapshot?.department,
            clientSnapshotCountry: clientSnapshot?.country,
            clientSnapshotEmail: clientSnapshot?.email,
            clientSnapshotPhone: clientSnapshot?.phone,
            // **FECHA INMUTABLE**: Fecha y hora de emisión congeladas al momento de la creación
            issueDateSnapshot: newIssueDate,
            issueDateTimeSnapshot: newIssueDateTime,
          });
          console.log(`📸 Invoice ${boletaNumber} created with IMMUTABLE client snapshot and issue date: ${newIssueDateTime}`);
        }

        console.log(`✅ New invoice number generated: ${boletaNumber} for stage ${stageId}`);
      }

      // Function to convert number to Spanish letters
      const numeroALetras = (num: number): string => {
        const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
        const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
        const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

        if (num === 0) return 'CERO';
        if (num === 100) return 'CIEN';

        let letras = '';

        // Millones
        if (num >= 1000000) {
          const millones = Math.floor(num / 1000000);
          letras += (millones === 1 ? 'UN MILLON ' : numeroALetras(millones) + ' MILLONES ');
          num %= 1000000;
        }

        // Miles
        if (num >= 1000) {
          const miles = Math.floor(num / 1000);
          letras += (miles === 1 ? 'MIL ' : numeroALetras(miles) + ' MIL ');
          num %= 1000;
        }

        // Centenas
        if (num >= 100) {
          letras += centenas[Math.floor(num / 100)] + ' ';
          num %= 100;
        }

        // Decenas y unidades
        if (num >= 30) {
          letras += decenas[Math.floor(num / 10)];
          if (num % 10 > 0) letras += ' Y ' + unidades[num % 10];
        } else if (num >= 20) {
          const especiales = ['VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
          letras += especiales[num - 20];
        } else if (num >= 10) {
          const especiales10 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
          letras += especiales10[num - 10];
        } else if (num > 0) {
          letras += unidades[num];
        }

        return letras.trim();
      };

      const montoEnLetras = `${numeroALetras(amountPYG)} GUARANIES`;

      // Create professional PDF with larger margins for better layout
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        layout: 'portrait'
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="SoftwarePar_Boleta_${boletaNumber.replace(/\//g, '-')}.pdf"`);

      doc.on('error', (error) => {
        console.error('Error generating PDF:', error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Error generating PDF" });
        }
      });

      doc.pipe(res);

      const pageWidth = 595;
      const leftMargin = 40;
      const rightMargin = 40;
      const contentWidth = pageWidth - leftMargin - rightMargin;

      let yPos = 40;

      // ==> HEADER WITH BOX AND LOGO <==
      // Top box with double border (larger for better logo display)
      doc.rect(leftMargin, yPos, contentWidth, 85).strokeColor('#1e3a8a').lineWidth(2).stroke();
      doc.rect(leftMargin + 2, yPos + 2, contentWidth - 4, 81).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      const logoPathNewHeader = path.resolve(process.cwd(), "attached_assets/image_1767293138533.png");
      try {
        if (fs.existsSync(logoPathNewHeader)) {
          // Logo posicionado a la izquierda con espacio del borde
          doc.image(logoPathNewHeader, leftMargin + 15, yPos + 15, { width: 140 });
        } else {
          doc.fontSize(20).fillColor('#1e3a8a').font('Helvetica-Bold').text('SoftwarePar', leftMargin + 20, yPos + 30);
        }
      } catch (e) {
        console.error('Error loading logo:', e);
        doc.fontSize(18).fillColor('#1e3a8a').font('Helvetica-Bold').text('SoftwarePar', leftMargin + 20, yPos + 30);
      }

      // Document information in the right box with background (adjusted for larger header)
      // Posición ajustada del cuadro - 10 puntos más a la izquierda
      const rightHeaderXNewHeader = pageWidth - 220;
      doc.rect(rightHeaderXNewHeader - 5, yPos + 10, 185, 65).fillColor('#f8fafc').fill();
      doc.rect(rightHeaderXNewHeader - 5, yPos + 10, 185, 65).strokeColor('#1e3a8a').lineWidth(1).stroke();

      // BOLETA ELECTRÓNICA - Alineado a la izquierda del cuadro
      doc.fontSize(14).fillColor('#1e3a8a').font('Helvetica-Bold').text('BOLETA ELECTRÓNICA', rightHeaderXNewHeader, yPos + 15);
      doc.fontSize(8).fillColor('#475569').font('Helvetica').text('IVA General 10% / IRE SIMPLE', rightHeaderXNewHeader, yPos + 35);
      doc.fontSize(9).fillColor('#000000').font('Helvetica-Bold').text(project.name, rightHeaderXNewHeader, yPos + 55);

      yPos += 100;

      // ==> INFORMACIÓN DE LA BOLETA <==
      const infoBoxHeight = 50;
      doc.rect(leftMargin, yPos, contentWidth, infoBoxHeight).strokeColor('#1e3a8a').lineWidth(1.5).stroke();
      doc.rect(leftMargin + 1, yPos + 1, contentWidth - 2, infoBoxHeight - 2).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      // Fondo del encabezado
      doc.rect(leftMargin, yPos, contentWidth, 18).fillColor('#f1f5f9').fill();

      // Líneas divisorias verticales
      doc.moveTo(leftMargin + contentWidth * 0.33, yPos).lineTo(leftMargin + contentWidth * 0.33, yPos + infoBoxHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.moveTo(leftMargin + contentWidth * 0.66, yPos).lineTo(leftMargin + contentWidth * 0.66, yPos + infoBoxHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      // Primera columna
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold').text('BOLETA Nº:', leftMargin + 8, yPos + 5);
      doc.fontSize(10).fillColor('#1e3a8a').font('Helvetica-Bold').text(boletaNumber, leftMargin + 8, yPos + 20);

      // Segunda columna
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold').text('FECHA Y HORA DE EMISIÓN:', leftMargin + contentWidth * 0.33 + 8, yPos + 5);
      doc.fontSize(9).fillColor('#000000').font('Helvetica-Bold').text(issueDateTime, leftMargin + contentWidth * 0.33 + 8, yPos + 20);

      // Tercera columna
      doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold').text('ETAPA:', leftMargin + contentWidth * 0.66 + 8, yPos + 5);
      doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold').text(`${stageNumber} de ${totalStages}`, leftMargin + contentWidth * 0.66 + 8, yPos + 20);

      // Información del timbrado en la fila inferior
      if (company?.timbradoNumber) {
        doc.fontSize(7).fillColor('#475569').font('Helvetica').text('TIMBRADO Nº:', leftMargin + 8, yPos + 35);
        doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold').text(company.timbradoNumber, leftMargin + 70, yPos + 35);

        if (company?.vigenciaTimbrado && company?.vencimientoTimbrado) {
          doc.fontSize(7).fillColor('#475569').font('Helvetica').text('VIGENCIA:', leftMargin + contentWidth * 0.5, yPos + 35);
          doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold').text(`${company.vigenciaTimbrado} - ${company.vencimientoTimbrado}`, leftMargin + contentWidth * 0.5 + 50, yPos + 35);
        }
      }

      // Aviso de Firma Digital en Proceso (Si no hay CDC o si el toggle está activo)
      if (!cdcInfo && company?.isSignatureProcessEnabled) {
        doc.rect(leftMargin, yPos + 45, contentWidth, 15).fillColor('#fef2f2').fill();
        doc.fontSize(8).fillColor('#991b1b').font('Helvetica-Bold').text('FIRMA DIGITAL EN PROCESO - ESTE DOCUMENTO ES UNA CONSTANCIA DE PAGO INTERNA', leftMargin, yPos + 49, { align: 'center', width: contentWidth });
        yPos += 15;
      }

      yPos += infoBoxHeight + 12;

      // ==> HEADER WITH BOX AND LOGO <==
      // Top box with double border
      const headerTopBoxHeight = 95;
      doc.rect(leftMargin, yPos, contentWidth, headerTopBoxHeight).strokeColor('#1e3a8a').lineWidth(2).stroke();
      doc.rect(leftMargin + 2, yPos + 2, contentWidth - 4, headerTopBoxHeight - 4).strokeColor('#cbd5e1').lineWidth(0.5).stroke();

      const logoPathNewDoc = path.resolve(process.cwd(), "attached_assets/image_1767293138533.png");
      try {
        if (fs.existsSync(logoPathNewDoc)) {
          doc.image(logoPathNewDoc, leftMargin + 10, yPos + 10, { width: 130 });
        } else {
          doc.fontSize(20).fillColor('#1e3a8a').font('Helvetica-Bold').text('SoftwarePar', leftMargin + 15, yPos + 35);
        }
      } catch (e) {
        doc.fontSize(18).fillColor('#1e3a8a').font('Helvetica-Bold').text('SoftwarePar', leftMargin + 15, yPos + 35);
      }

      // Document information in the right box
      const rightHeaderXNewDoc = pageWidth - 230;
      doc.rect(rightHeaderXNewDoc, yPos + 10, 190, 75).fillColor('#f8fafc').fill();
      doc.rect(rightHeaderXNewDoc, yPos + 10, 190, 75).strokeColor('#1e3a8a').lineWidth(1).stroke();

      doc.fontSize(13).fillColor('#1e3a8a').font('Helvetica-Bold').text('BOLETA ELECTRÓNICA', rightHeaderXNewDoc + 5, yPos + 15);
      doc.fontSize(8).fillColor('#475569').font('Helvetica').text('IVA General 10% / IRE SIMPLE', rightHeaderXNewDoc + 5, yPos + 32);
      
      doc.fontSize(9).fillColor('#1e293b').font('Helvetica-Bold').text(`BOLETA Nº: ${boletaNumber}`, rightHeaderXNewDoc + 5, yPos + 48);
      doc.fontSize(8).fillColor('#475569').font('Helvetica').text(`Emisión: ${issueDateTime}`, rightHeaderXNewDoc + 5, yPos + 62);

      yPos += 105;

      // ==> DATOS DE LA EMPRESA Y CLIENTE <==
      const columnWidth = (contentWidth - 12) / 2;
      const boxHeight = 100;

      // Cuadro de la empresa
      doc.rect(leftMargin, yPos, columnWidth, boxHeight).strokeColor('#1e3a8a').lineWidth(1.5).stroke();
      doc.rect(leftMargin, yPos, columnWidth, 20).fillColor('#1e3a8a').fill();
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold').text('DATOS DE LA EMPRESA', leftMargin + 8, yPos + 6);

      doc.fontSize(8).fillColor('#1e293b').font('Helvetica');
      const displayName = company?.titularName || company?.companyName || 'Jhoni Fabián Benítez De La Cruz';
      doc.text(`Titular: ${displayName}`, leftMargin + 8, yPos + 25, { width: columnWidth - 16 });
      doc.text(`RUC: ${company?.ruc || '4220058-0'}`, leftMargin + 8, yPos + 42);
      doc.text(`Tel: ${company?.phone || '+595 985 990 046'}`, leftMargin + 8, yPos + 54);
      doc.text(`Email: ${company?.email || 'softwarepar.lat@gmail.com'}`, leftMargin + 8, yPos + 66, { width: columnWidth - 16 });
      doc.text(`Dirección: ${company?.address || 'Paraguay'}`, leftMargin + 8, yPos + 78, { width: columnWidth - 16 });

      // Cuadro del cliente
      const clientBoxX = leftMargin + columnWidth + 12;
      doc.rect(clientBoxX, yPos, columnWidth, boxHeight).strokeColor('#1e3a8a').lineWidth(1.5).stroke();
      doc.rect(clientBoxX, yPos, columnWidth, 20).fillColor('#1e3a8a').fill();
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold').text('DATOS DEL CLIENTE', clientBoxX + 8, yPos + 6);

      doc.fontSize(8).fillColor('#1e293b').font('Helvetica');
      const clientName = client?.legalName || req.user!.fullName;
      doc.text(`Nombre: ${clientName}`, clientBoxX + 8, yPos + 25, { width: columnWidth - 16 });
      doc.text(`${client?.documentType || 'RUC'}: ${client?.documentNumber || 'N/A'}`, clientBoxX + 8, yPos + 42);
      doc.text(`Tel: ${client?.phone || 'N/A'}`, clientBoxX + 8, yPos + 54);
      doc.text(`Email: ${client?.email || req.user!.email}`, clientBoxX + 8, yPos + 66, { width: columnWidth - 16 });
      doc.text(`Dirección: ${client?.address || 'N/A'}`, clientBoxX + 8, yPos + 78, { width: columnWidth - 16 });

      yPos += boxHeight + 15;

      // ==> TABLA DE SERVICIOS <==
      const cantWidth = 40;
      const descWidth = 270;
      const precioWidth = 110;
      const totalWidth = 95;

      doc.rect(leftMargin, yPos, contentWidth, 25).fillColor('#1e3a8a').fill();
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('CANT', leftMargin + 5, yPos + 8);
      doc.text('DESCRIPCIÓN DEL SERVICIO', leftMargin + cantWidth + 10, yPos + 8);
      doc.text('PRECIO UNITARIO', leftMargin + cantWidth + descWidth + 10, yPos + 8);
      doc.text('TOTAL', leftMargin + cantWidth + descWidth + precioWidth + 20, yPos + 8);

      yPos += 25;
      doc.rect(leftMargin, yPos, contentWidth, 60).strokeColor('#cbd5e1').lineWidth(1).stroke();
      
      doc.fontSize(9).fillColor('#1e293b').font('Helvetica');
      doc.text('1', leftMargin + 15, yPos + 10);
      doc.text(`${stage[0].stageName}`, leftMargin + cantWidth + 10, yPos + 10, { width: descWidth - 20 });
      doc.fontSize(8).fillColor('#64748b');
      doc.text(`Proyecto: ${project.name}`, leftMargin + cantWidth + 10, yPos + 22);
      doc.text(`TC: 1 USD = ${exchangeRate.toLocaleString('es-PY')} PYG`, leftMargin + cantWidth + 10, yPos + 34);

      doc.fontSize(9).fillColor('#1e293b').font('Helvetica-Bold');
      doc.text(`USD ${amountUSD.toFixed(2)}`, leftMargin + cantWidth + descWidth, yPos + 10, { width: precioWidth, align: 'center' });
      doc.text(`USD ${amountUSD.toFixed(2)}`, leftMargin + cantWidth + descWidth + precioWidth, yPos + 10, { width: totalWidth, align: 'center' });
      
      doc.fontSize(8).fillColor('#64748b').font('Helvetica');
      doc.text(`PYG ${amountPYG.toLocaleString('es-PY')}`, leftMargin + cantWidth + descWidth, yPos + 22, { width: precioWidth, align: 'center' });
      doc.text(`PYG ${amountPYG.toLocaleString('es-PY')}`, leftMargin + cantWidth + descWidth + precioWidth, yPos + 22, { width: totalWidth, align: 'center' });

      yPos += 75;

      // ==> TOTALES <==
      const totalsWidth = 180;
      const totalsX = leftMargin + contentWidth - totalsWidth;
      
      doc.fontSize(9).fillColor('#475569').font('Helvetica');
      doc.text('Subtotal USD:', totalsX, yPos);
      doc.text(`USD ${amountUSD.toFixed(2)}`, totalsX + 90, yPos, { width: 90, align: 'right' });

      yPos += 15;
      doc.text('Subtotal PYG:', totalsX, yPos);
      doc.text(`PYG ${amountPYG.toLocaleString('es-PY')}`, totalsX + 90, yPos, { width: 90, align: 'right' });

      yPos += 15;
      doc.text('IVA (10%):', totalsX, yPos);
      const ivaPYG = Math.round(amountPYG / 11);
      doc.text(`PYG ${ivaPYG.toLocaleString('es-PY')}`, totalsX + 90, yPos, { width: 90, align: 'right' });

      yPos += 20;
      doc.rect(totalsX - 5, yPos - 5, totalsWidth + 5, 25).fillColor('#1e3a8a').fill();
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text('TOTAL:', totalsX, yPos + 2);
      doc.text(`PYG ${amountPYG.toLocaleString('es-PY')}`, totalsX + 60, yPos + 2, { width: totalsWidth - 65, align: 'right' });

      yPos += 35;

      // ==> MONTO EN LETRAS <==
      doc.rect(leftMargin, yPos, contentWidth, 35).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold').text('MONTO EN LETRAS:', leftMargin + 8, yPos + 5);
      doc.fontSize(9).fillColor('#1e293b').font('Helvetica-Bold').text(montoEnLetras, leftMargin + 8, yPos + 18);

      yPos += 45;

      // ==> INFORMACIÓN DE PAGO <==
      doc.rect(leftMargin, yPos, contentWidth, 40).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.rect(leftMargin, yPos, contentWidth, 15).fillColor('#f8fafc').fill();
      doc.fontSize(8).fillColor('#1e3a8a').font('Helvetica-Bold').text('DETALLES DEL PAGO', leftMargin + 8, yPos + 4);

      doc.fontSize(8).fillColor('#475569').font('Helvetica');
      doc.text(`Método: ${stage[0].paymentMethod || 'Transferencia'}`, leftMargin + 8, yPos + 20);
      doc.text(`Fecha: ${stage[0].paidAt ? new Date(stage[0].paidAt).toLocaleDateString('es-PY') : issueDate}`, leftMargin + 180, yPos + 20);
      doc.text(`Estado: PAGADO`, leftMargin + 350, yPos + 20);

      yPos += 55;

      // ==> PIE DE PÁGINA CON INFO FISCAL <==
      // Línea separadora
      doc.moveTo(leftMargin, yPos).lineTo(pageWidth - rightMargin, yPos).lineWidth(1).strokeColor('#cbd5e1').stroke();
      yPos += 8;

      doc.fontSize(7).fillColor('#475569').font('Helvetica');
      doc.text('IVA General 10% / IRE SIMPLE', leftMargin, yPos, {
        width: contentWidth,
        align: 'center'
      });
      yPos += 12;

      // ** SECCIÓN DE VERIFICACIÓN ELECTRÓNICA CON QR **
      if (cdcInfo && cdcInfo.cdc) {
        // Cuadro de verificación con diseño profesional
        doc.rect(leftMargin, yPos, contentWidth, 120).strokeColor('#000000').lineWidth(1).stroke();

        const qrSize = 90;
        const qrX = leftMargin + 10;
        const qrY = yPos + 15;

        // Generar QR
        if (cdcInfo.qrUrl) {
          try {
            const qrDataUrl = await QRCode.toDataURL(cdcInfo.qrUrl, { margin: 1 });
            const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
            doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
          } catch (e) {
            console.error('Error QR:', e);
          }
        }

        const textX = qrX + qrSize + 15;
        const textWidth = contentWidth - qrSize - 40;
        let textY = yPos + 15;

        doc.fontSize(9).fillColor('#000000').font('Helvetica');
        doc.text('Consulte la validez de este Documento Electrónico con el número de CDC impreso en:', textX, textY, { width: textWidth });
        
        textY += 12;
        doc.fontSize(9).fillColor('#000000').font('Helvetica-Bold');
        doc.text('https://ekuatia.set.gov.py/consultas', textX, textY, { link: 'https://ekuatia.set.gov.py/consultas', underline: true });

        textY += 20;
        const cdcFormatted = cdcInfo.cdc.match(/.{1,4}/g)?.join(' ') || cdcInfo.cdc;
        doc.fontSize(10).font('Helvetica-Bold').text('CDC:', textX, textY);
        doc.fontSize(10).font('Helvetica').text(cdcFormatted, textX + 30, textY, { width: textWidth - 30 });

        textY += 25;
        doc.fontSize(9).font('Helvetica-Bold').text('ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)', textX, textY, { width: textWidth });
        
        textY += 25;
        doc.fontSize(8).font('Helvetica').text(`Fecha de Envío SET: ${invoiceData[0]?.sifenFechaEnvio ? new Date(invoiceData[0].sifenFechaEnvio).toLocaleString('es-PY') : issueDateTime}`, textX, textY);
        
        yPos += 140;
      }

      // Footer legal note like in the image
      doc.fontSize(7).fillColor('#4b5563').font('Helvetica');
      doc.text('Si su documento electrónico presenta algún error puede solicitar la modificación dentro de las 72 horas siguientes de la emisión de este comprobante.', leftMargin, yPos, { align: 'center', width: contentWidth });

      yPos += 20;
      doc.fontSize(16).fillColor('#2563eb').font('Helvetica-Bold').text('¡Gracias por confiar en SoftwarePar!', leftMargin, yPos, { align: 'center', width: contentWidth });
      
      yPos += 40;
      doc.fontSize(9).fillColor('#6b7280');
      doc.text(`${company?.companyName || 'SOFTWAREPAR'} • RUC: ${company?.ruc || '4220058-0'} • Paraguay`, leftMargin, yPos, { align: 'center', width: contentWidth });
      doc.text(`Email: ${company?.email || 'softwarepar.lat@gmail.com'} • Tel: ${company?.phone || '+595 985 990 046'}`, leftMargin, yPos + 12, { align: 'center', width: contentWidth });

      doc.end();


    } catch (error) {
      console.error("❌ Error downloading RESIMPLE invoice:", error);
      if (!res.headersSent) {
        res.status(500).json({
          message: "Internal server error",
          error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : 'Error generating RESIMPLE Boleta'
        });
      }
    }
  });

  // Payment Routes - TODO: Implement new payment system

  // Portfolio Routes
  app.get("/api/portfolio", async (req, res) => {
    try {
      const portfolioItems = await storage.getPortfolio();
      res.json(portfolioItems);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/portfolio", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const portfolioData = req.body;
      const portfolio = await storage.createPortfolio(portfolioData);
      res.status(201).json(portfolio);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/portfolio/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const portfolioId = parseInt(req.params.id);
      const updates = req.body;
      const portfolio = await storage.updatePortfolio(portfolioId, updates);
      res.json(portfolio);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/portfolio/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const portfolioId = parseInt(req.params.id);
      await storage.deletePortfolio(portfolioId);
      res.json({ message: "Portfolio item deleted" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Client billing routes
  app.get("/api/client/invoices", authenticateToken, async (req: AuthRequest, res) => {
    try {
      console.log(`📄 Fetching invoices for client: ${req.user!.id}`);

      // Get traditional invoices
      const allTraditionalInvoices = await storage.getInvoicesByClient(req.user!.id);
      console.log(`💳 Traditional invoices found: ${allTraditionalInvoices.length}`);

      // Filter traditional invoices that do NOT have a paymentStageId (to avoid duplicates)
      const traditionalInvoices = allTraditionalInvoices.filter(inv => !inv.paymentStageId);
      console.log(`💳 Traditional invoices without linked stage: ${traditionalInvoices.length}`);

      // Get client's projects
      const projects = await storage.getProjects(req.user!.id, req.user!.role);
      console.log(`🏗️ Client projects: ${projects.length}`);

      // Get paid payment stages from all projects
      const stageInvoices = [];
      for (const project of projects) {
        const stages = await storage.getPaymentStages(project.id);
        const paidStages = stages.filter((stage: any) => stage.status === 'paid');

        for (const stage of paidStages) {
          // Check if an invoice already exists for this stage
          const existingInvoice = await db
            .select()
            .from(invoices)
            .where(eq(invoices.paymentStageId, stage.id))
            .limit(1);

          stageInvoices.push({
            id: stage.id,
            invoiceNumber: existingInvoice[0]?.invoiceNumber || `STAGE-${stage.id}`,
            projectName: project.name,
            amount: stage.amount,
            status: 'paid',
            dueDate: stage.paidAt || stage.createdAt,
            paidAt: stage.paidAt,
            createdAt: stage.createdAt,
            downloadUrl: `/api/client/stage-invoices/${stage.id}/download-resimple`,
            stageName: stage.stageName,
            stagePercentage: stage.stagePercentage,
            type: 'stage_payment',
            exchangeRateUsed: stage.exchangeRateUsed || existingInvoice[0]?.exchangeRateUsed,
            paymentStageId: stage.id,
            sifenEstado: existingInvoice[0]?.sifenEstado || 'pending',
            sifenCDC: existingInvoice[0]?.sifenCDC
          });
        }
      }

      console.log(`🏗️ Paid payment stages found: ${stageInvoices.length}`);

      // Combine both lists (only traditional invoices without stages + paid payment stages)
      const allInvoices = [...traditionalInvoices, ...stageInvoices];
      console.log(`📋 Total invoices to return: ${allInvoices.length}`);

      res.json(allInvoices);
    } catch (error) {
      console.error("Error getting client invoices:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  app.get("/api/client/billing", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const billingData = await storage.getClientBillingData(req.user!.id);
      res.json(billingData);
    } catch (error) {
      console.error("Error getting client billing data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/client/payment-methods", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const paymentMethods = await storage.getPaymentMethodsByUser(req.user!.id);
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error getting client payment methods:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/client/payment-methods", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const paymentMethodData = {
        ...req.body,
        userId: req.user!.id,
      };
      const paymentMethod = await storage.createPaymentMethod(paymentMethodData);
      res.status(201).json(paymentMethod);
    } catch (error) {
      console.error("Error creating client payment method:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/client/payment-methods/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const paymentMethodId = parseInt(req.params.id);
      const updates = req.body;
      const paymentMethod = await storage.updatePaymentMethod(paymentMethodId, updates);
      res.json(paymentMethod);
    } catch (error) {
      console.error("Error updating client payment method:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/client/payment-methods/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const paymentMethodId = parseInt(req.params.id);
      await storage.deletePaymentMethod(paymentMethodId);
      res.json({ message: "Payment method deleted" });
    } catch (error) {
      console.error("Error deleting client payment method:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/client/transactions", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const transactions = await storage.getTransactionsByUser(req.user!.id);
      res.json(transactions);
    } catch (error) {
      console.error("Error getting client transactions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Routes
  app.get("/api/admin/stats", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Partners Management
  app.get("/api/admin/partners", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const partners = await storage.getAllPartnersForAdmin();
      res.json(partners);
    } catch (error) {
      console.error("Error getting partners for admin:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/partners/stats", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getPartnerStatsForAdmin();
      res.json(stats);
    } catch (error) {
      console.error("Error getting partner stats for admin:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/partners/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const partnerId = parseInt(req.params.id);
      const updates = req.body;
      const partner = await storage.updatePartner(partnerId, updates);
      res.json(partner);
    } catch (error) {
      console.error("Error updating admin partner:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Users Stats
  app.get("/api/admin/users/stats", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getUserStatsForAdmin();
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin user stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/users", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const userData = req.body;

      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email is already registered" });
      }

      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      // Create partner if role is partner
      if (userData.role === "partner") {
        const referralCode = `PAR${user.id}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        await storage.createPartner({
          userId: user.id,
          referralCode,
          commissionRate: "25.00",
          totalEarnings: "0.00",
        });
      }

      // Send welcome email
      try {
        await sendWelcomeEmail(user.email, user.fullName);
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError);
      }

      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json({
        user: userWithoutPassword,
        message: "User created successfully",
      });
    } catch (error) {
      console.error("Error creating admin user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const userId = parseInt(req.params.id);

      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // Do not allow an admin to delete themselves
      if (req.user!.id === userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      await storage.deleteUser(userId);

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting admin user:", error);

      if (error.message === "User not found") {
        return res.status(404).json({ message: error.message });
      }

      if (error.message === "Cannot delete the last administrator of the system") {
        return res.status(400).json({ message: error.message });
      }

      if (error.message === "You cannot delete your own account") {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  app.get("/api/admin/projects", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const projects = await storage.getAllProjectsForAdmin();
      res.json(projects);
    } catch (error) {
      console.error("Error getting admin projects:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/projects/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const updates = req.body;

      console.log("Updating project:", projectId, "with data:", updates);

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Validate dates if provided
      if (updates.startDate && updates.startDate !== null) {
        const startDate = new Date(updates.startDate);
        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "Invalid start date" });
        }
      }

      if (updates.deliveryDate && updates.deliveryDate !== null) {
        const deliveryDate = new Date(updates.deliveryDate);
        if (isNaN(deliveryDate.getTime())) {
          return res.status(400).json({ message: "Invalid delivery date" });
        }
      }

      const project = await storage.updateProject(projectId, updates);
      res.json(project);
    } catch (error) {
      console.error("Error updating admin project:", error);
      res.status(500).json({
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });

  app.delete("/api/admin/projects/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const projectId = parseInt(req.params.id);

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Check if project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await storage.deleteProject(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting admin project:", error);
      res.status(500).json({
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });

  app.get("/api/admin/projects/stats", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getProjectStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin project stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Analytics Routes
  app.get("/api/admin/analytics", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const period = req.query.period || '30';
      const analytics = await storage.getAnalyticsData(parseInt(period as string));
      res.json(analytics);
    } catch (error) {
      console.error("Error getting admin analytics data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/revenue", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const period = req.query.period || '30';
      const revenueData = await storage.getRevenueAnalytics(parseInt(period as string));
      res.json(revenueData);
    } catch (error) {
      console.error("Error getting admin revenue analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/users", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const period = req.query.period || '30';
      const userAnalytics = await storage.getUserAnalytics(parseInt(period as string));
      res.json(userAnalytics);
    } catch (error) {
      console.error("Error getting admin user analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/export", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const format = req.query.format || 'pdf';
      const analytics = await storage.getAnalyticsData(30);

      // TODO: Implement PDF/Excel export
      res.json({ message: `Exporting analytics as ${format}`, data: analytics });
    } catch (error) {
      console.error("Error exporting admin analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Client Billing Information Routes
  app.get("/api/client/billing-info", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const billingInfo = await db
        .select()
        .from(clientBillingInfo)
        .where(eq(clientBillingInfo.userId, req.user!.id))
        .limit(1);

      if (billingInfo.length === 0) {
        return res.status(404).json({ message: "Billing information not found" });
      }

      res.json(billingInfo[0]);
    } catch (error) {
      console.error("Error getting client billing info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/client/billing-info", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const billingData = {
        ...req.body,
        userId: req.user!.id,
      };

      const [newBillingInfo] = await db
        .insert(clientBillingInfo)
        .values(billingData)
        .returning();

      res.status(201).json(newBillingInfo);
    } catch (error) {
      console.error("Error creating client billing info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/client/billing-info/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const billingId = parseInt(req.params.id);
      const updates = req.body;

      const [updatedBillingInfo] = await db
        .update(clientBillingInfo)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(clientBillingInfo.id, billingId),
          eq(clientBillingInfo.userId, req.user!.id)
        ))
        .returning();

      if (!updatedBillingInfo) {
        return res.status(404).json({ message: "Billing information not found" });
      }

      res.json(updatedBillingInfo);
    } catch (error) {
      console.error("Error updating client billing info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Company Billing Information Routes (Admin only)
  app.get("/api/admin/company-billing-info", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .orderBy(desc(companyBillingInfo.updatedAt))
        .limit(1);

      if (companyInfo.length === 0) {
        return res.status(404).json({ message: "Company billing information not found" });
      }

      res.json(companyInfo[0]);
    } catch (error) {
      console.error("Error getting company billing info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/company-billing-info", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      // Deactivate existing data
      await db
        .update(companyBillingInfo)
        .set({ isActive: false, updatedAt: new Date() });

      // Create new data
      const [newCompanyInfo] = await db
        .insert(companyBillingInfo)
        .values({ ...req.body, isActive: true })
        .returning();

      res.status(201).json(newCompanyInfo);
    } catch (error) {
      console.error("Error creating company billing info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/company-billing-info/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const updates = req.body;

      console.log(`Updating company billing info ID ${companyId}:`, updates);

      // Validate required fields for company billing
      if (!updates.companyName || !updates.ruc || !updates.address || !updates.city) {
        return res.status(400).json({
          message: "Missing required fields: companyName, ruc, address, city"
        });
      }

      // Deactivate all other records first
      await db
        .update(companyBillingInfo)
        .set({ isActive: false, updatedAt: new Date() })
        .where(sql`${companyBillingInfo.id} != ${companyId}`);

      const [updatedCompanyInfo] = await db
        .update(companyBillingInfo)
        .set({
          ...updates,
          updatedAt: new Date(),
          isActive: true // Ensure it remains active
        })
        .where(eq(companyBillingInfo.id, companyId))
        .returning();

      if (!updatedCompanyInfo) {
        return res.status(404).json({ message: "Company billing information not found" });
      }

      console.log(`✅ Company billing info updated successfully:`, updatedCompanyInfo);
      res.json(updatedCompanyInfo);
    } catch (error) {
      console.error("❌ Error updating company billing info:", error);
      res.status(500).json({
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Admin Invoice Management Routes
  app.get("/api/admin/invoices", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const invoices = await storage.getAllInvoicesForAdmin();
      res.json(invoices);
    } catch (error) {
      console.error("Error getting admin invoices:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/invoices", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { projectId, amount, dueDate } = req.body;

      if (!projectId || !amount || !dueDate) {
        return res.status(400).json({ message: "Required data missing" });
      }

      const invoice = await storage.createInvoiceForProject(
        parseInt(projectId),
        amount.toString(),
        new Date(dueDate)
      );

      // Notify client about new invoice
      const project = await storage.getProject(parseInt(projectId));
      if (project) {
        await storage.createNotification({
          userId: project.clientId,
          title: "💰 New Invoice Generated",
          message: `A new invoice for $${amount} has been generated for project "${project.name}". It is due on ${new Date(dueDate).toLocaleDateString()}.`,
          type: "info",
        });
      }

      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating admin invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/invoices/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { status } = req.body;

      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      const updateData: any = { status };
      if (status === 'paid') {
        updateData.paidAt = new Date();
      }
      const invoice = await storage.updateInvoice(invoiceId, updateData);

      res.json(invoice);
    } catch (error) {
      console.error("Error updating admin invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/client/invoices/:id/pay", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { paymentMethodId } = req.body;

      if (isNaN(invoiceId) || !paymentMethodId) {
        return res.status(400).json({ message: "Invalid data" });
      }

      // Verify that the invoice belongs to the client
      const invoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!invoice[0] || invoice[0].clientId !== req.user!.id) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Create transaction
      const [transaction] = await db.insert(transactions).values({
        invoiceId: invoiceId,
        paymentMethodId: parseInt(paymentMethodId),
        userId: req.user!.id,
        amount: invoice[0].amount,
        currency: invoice[0].currency,
        status: 'completed',
        transactionId: `TXN_${Date.now()}_${invoiceId}`,
        createdAt: new Date(),
        completedAt: new Date(),
      }).returning();

      // Update invoice status
      await storage.updateInvoiceStatus(invoiceId, 'paid', new Date());

      // Notify admin
      const adminUsers = await storage.getUsersByRole("admin");
      for (const admin of adminUsers) {
        await storage.createNotification({
          userId: admin.id,
          title: "💰 Payment Received",
          message: `Client ${req.user!.fullName} has paid invoice #${invoiceId} for $${invoice[0].amount}.`,
          type: "success",
        });
      }

      res.json({
        message: "Payment processed successfully",
        transaction: transaction,
      });
    } catch (error) {
      console.error("Error processing client payment:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/client/invoices/:id/download", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);

      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }

      // Verify that the invoice belongs to the client
      const invoice = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!invoice[0] || invoice[0].clientId !== req.user!.id) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // TODO: Generate actual PDF
      const pdfContent = `Invoice #INV-${new Date().getFullYear()}-${invoiceId.toString().padStart(3, '0')}

Client: ${req.user!.fullName}
Amount: $${invoice[0].amount}
Status: ${invoice[0].status}
Date: ${invoice[0].createdAt}

This is a demo invoice generated by the system.`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice_${invoiceId}.pdf"`);
      res.send(Buffer.from(pdfContent));
    } catch (error) {
      console.error("Error downloading client invoice:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin Support Routes
  app.get("/api/admin/tickets", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const tickets = await storage.getAllTicketsForAdmin();
      res.json(tickets);
    } catch (error) {
      console.error("Error getting admin tickets:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/tickets/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const updates = req.body;
      const ticket = await storage.updateTicket(ticketId, updates);
      res.json(ticket);
    } catch (error) {
      console.error("Error updating admin ticket:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/tickets/stats", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getTicketStats();
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin ticket stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/tickets/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      await storage.deleteTicket(ticketId);
      res.json({ message: "Ticket deleted successfully" });
    } catch (error) {
      console.error("Error deleting admin ticket:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });



  // Work Modalities Routes
  app.get("/api/work-modalities", async (req, res) => {
    try {
      const modalities = await storage.getWorkModalities();
      res.json(modalities);
    } catch (error) {
      console.error("Error getting work modalities:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Exchange Rate Configuration Routes
  app.get("/api/admin/exchange-rate", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const currentRate = await storage.getCurrentExchangeRate();
      if (!currentRate) {
        return res.json({
          usdToGuarani: "7300.00",
          isDefault: true,
          updatedAt: new Date(),
          updatedBy: null
        });
      }
      res.json(currentRate);
    } catch (error) {
      console.error("Error getting admin exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/exchange-rate", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { usdToGuarani } = req.body;

      if (!usdToGuarani || isNaN(parseFloat(usdToGuarani))) {
        return res.status(400).json({ message: "Invalid exchange rate" });
      }

      const updatedRate = await storage.updateExchangeRate(usdToGuarani, req.user!.id);

      console.log(`💱 Exchange rate updated: 1 USD = ${usdToGuarani} PYG by ${req.user!.fullName}`);

      res.json({
        ...updatedRate,
        message: "Exchange rate updated successfully"
      });
    } catch (error) {
      console.error("Error updating admin exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/exchange-rate", async (req, res) => {
    try {
      const currentRate = await storage.getCurrentExchangeRate();
      if (!currentRate) {
        return res.json({
          usdToGuarani: "7300.00",
          isDefault: true,
        });
      }
      res.json({
        usdToGuarani: currentRate.usdToGuarani,
        isDefault: false,
        updatedAt: currentRate.updatedAt
      });
    } catch (error) {
      console.error("Error getting public exchange rate:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Test endpoint to test the full email flow
  app.post("/api/test-email-flow", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      console.log("🧪 Starting full email flow test...");

      // 1. Create a test client
      const testClientEmail = "client.test@test.com";
      const testClientName = "Test Client";

      let testClient;
      try {
        testClient = await storage.getUserByEmail(testClientEmail);
        if (!testClient) {
          const hashedPassword = await hashPassword("123456");
          testClient = await storage.createUser({
            email: testClientEmail,
            password: hashedPassword,
            fullName: testClientName,
            role: "client",
            isActive: true,
          });
          console.log("✅ Test client created:", testClient.email);
        } else {
          console.log("✅ Using existing client:", testClient.email);
        }
      } catch (clientError) {
        console.error("❌ Error creating client:", clientError);
        return res.status(500).json({ message: "Error creating test client" });
      }

      // 2. Create a test project
      const projectData = {
        name: "Test Email Project - " + new Date().toISOString(),
        description: "This is a test project to verify the full email flow",
        price: "5000.00",
        clientId: testClient.id,
        status: "pending",
        progress: 0,
      };

      let testProject;
      try {
        testProject = await storage.createProject(projectData);
        console.log("✅ Test project created:", testProject.name);
      } catch (projectError) {
        console.error("❌ Error creating project:", projectError);
        return res.status(500).json({ message: "Error creating test project" });
      }

      // 3. Simulate project creation notifications
      try {
        console.log("📧 Sending project creation notifications...");
        const adminUsers = await storage.getUsersByRole("admin");
        const adminIds = adminUsers.map(admin => admin.id);
        await notifyProjectCreated(testClient.id, adminIds, testProject.name, testProject.id);
        console.log("✅ Creation notifications sent");
      } catch (notifyError) {
        console.error("❌ Error sending creation notifications:", notifyError);
      }

      // 4. Simulate status change: pending -> in_progress
      try {
        console.log("📧 Simulating status change: pending -> in_progress...");
        const updatedProject1 = await storage.updateProject(testProject.id, {
          status: "in_progress",
          progress: 25,
          startDate: new Date()
        });

        await notifyProjectUpdated(
          testClient.id,
          testProject.name,
          "Status changed to: In Progress - Progress updated to 25%",
          req.user!.fullName
        );

        // Notify special status change
        const statusLabels = {
          'pending': 'Pending',
          'in_progress': 'In Progress',
          'completed': 'Completed',
          'cancelled': 'Cancelled'
        };

        const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));
        for (const admin of adminUsers) {
          if (admin.email) {
            await sendEmail({
              to: admin.email,
              subject: `Status Change (TEST): ${testProject.name} - In Progress`,
              html: generateProjectStatusChangeEmailHTML(
                testProject.name,
                statusLabels['pending'],
                statusLabels['in_progress'],
                req.user!.fullName,
                testClient.id
              ),
            });
          }
        }

        console.log("✅ Status change 1 processed");
      } catch (updateError) {
        console.error("❌ Error in status change 1:", updateError);
      }

      // 5. Wait a moment and change to completed
      setTimeout(async () => {
        try {
          console.log("📧 Simulating status change: in_progress -> completed...");
          await storage.updateProject(testProject.id, {
            status: "completed",
            progress: 100,
            deliveryDate: new Date()
          });

          await notifyProjectUpdated(
            testClient.id,
            testProject.name,
            "Status changed to: Completed - Progress updated to 100%",
            req.user!.fullName
          );

          // Notify special status change
          const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));
          for (const admin of adminUsers) {
            if (admin.email) {
              await sendEmail({
                to: admin.email,
                subject: `Status Change (TEST): ${testProject.name} - Completed`,
                html: generateProjectStatusChangeEmailHTML(
                  testProject.name,
                  'In Progress',
                  'Completed',
                  req.user!.fullName,
                  testClient.id
                ),
              });
            }
          }

          console.log("✅ Status change 2 processed");
        } catch (finalError) {
          console.error("❌ Error in final status change:", finalError);
        }
      }, 2000);

      // 6. Create a test ticket
      try {
        console.log("📧 Creating test ticket...");
        const testTicket = await storage.createTicket({
          title: "Test Ticket - Project inquiry",
          description: "This is a test ticket to verify notifications",
          priority: "medium",
          userId: testClient.id,
          projectId: testProject.id,
        });

        const adminUsers = await storage.getUsersByRole("admin");
        const adminIds = adminUsers.map(admin => admin.id);
        await notifyTicketCreated(adminIds, testClient.fullName, testTicket.title);
        console.log("✅ Test ticket created and notifications sent");
      } catch (ticketError) {
        console.error("❌ Error creating ticket:", ticketError);
      }

      // 7. Simulate a message in the project
      try {
        console.log("📧 Sending test message...");
        const testMessage = await storage.createProjectMessage({
          projectId: testProject.id,
          userId: testClient.id,
          message: "This is a test message from the client to verify notifications.",
        });

        const adminUsers = await storage.getUsersByRole("admin");
        for (const admin of adminUsers) {
          await notifyNewMessage(
            admin.id,
            testClient.fullName,
            testProject.name,
            testMessage.message
          );
        }
        console.log("✅ Test message sent and notifications processed");
      } catch (messageError) {
        console.error("❌ Error sending message:", messageError);
      }

      res.json({
        success: true,
        message: "Email flow test initiated successfully",
        details: {
          clientEmail: testClient.email,
          clientName: testClient.fullName,
          projectName: testProject.name,
          projectId: testProject.id,
          adminEmails: (await storage.getUsersByRole("admin")).map(admin => admin.email),
          systemEmail: process.env.GMAIL_USER,
        },
        instructions: [
          "1. Check server logs for progress",
          "2. Verify your email (both admin and system)",
          "3. Status changes occur 2 seconds apart",
          "4. Sent: creation notification, 2 status changes, ticket, and message"
        ]
      });

    } catch (error) {
      console.error("❌ Email flow test error:", error);
      res.status(500).json({
        message: "Error in email flow test",
        error: error.message
      });
    }
  });

  // Helper function to generate status change HTML (extracted for reuse)
  function generateProjectStatusChangeEmailHTML(projectName: string, oldStatus: string, newStatus: string, updatedBy: string, clientId: number) {
    const getStatusColor = (status: string) => {
      switch (status.toLowerCase()) {
        case 'pending':
        case 'pendiente':
          return '#f59e0b';
        case 'in_progress':
        case 'en progreso':
          return '#3b82f6';
        case 'completed':
        case 'completado':
          return '#10b981';
        case 'cancelled':
        case 'cancelado':
          return '#ef4444';
        default:
          return '#6b7280';
      }
    };

    const newStatusColor = getStatusColor(newStatus);

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Project Status Change - ${projectName}</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, ${newStatusColor} 0%, ${newStatusColor}dd 100%); color: white; padding: 30px; border-radius: 10px; text-align: center;">
          <h1 style="margin: 0;">🔄 Project Status Change</h1>
          <p style="margin: 10px 0 0 0; font-size: 18px;">${newStatus.toUpperCase()}</p>
        </div>
        <div style="padding: 30px 0;">
          <h2>Project status has been updated</h2>
          <div style="background: #f8fafc; border-left: 4px solid ${newStatusColor}; padding: 15px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: ${newStatusColor};">${projectName}</h3>
            <div style="display: flex; align-items: center; margin: 10px 0;">
              <span style="background: #f3f4f6; padding: 5px 10px; border-radius: 5px; margin-right: 10px;">${oldStatus}</span>
              <span style="margin: 0 10px;">→</span>
              <span style="background: ${newStatusColor}; color: white; padding: 5px 10px; border-radius: 5px;">${newStatus}</span>
            </div>
            <p><strong>Updated by:</strong> ${updatedBy}</p>
            <p><strong>Date and time:</strong> ${new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' })}</p>
            <p style="background: #fff3cd; padding: 10px; border-radius: 5px; color: #856404; border: 1px solid #ffeaa7;"><strong>🧪 THIS IS A TEST</strong> - Email sent from the testing system</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://softwarepar.lat/admin/projects" style="background: ${newStatusColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Project in Admin</a>
          </div>
          <div style="background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #0369a1;"><strong>💡 Reminder:</strong> The client has also been notified of this change.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Test endpoint to test connection with FacturaSend
  app.get("/api/test-facturasend", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { verificarConexionFacturaSend } = await import('./facturasend');
      const resultado = await verificarConexionFacturaSend();

      res.json({
        ...resultado,
        apiKeyConfigurada: !!process.env.FACTURASEND_API_KEY,
        tenantId: 'jhonifabianbenitezdelacruz'
      });
    } catch (error: any) {
      console.error('❌ Error verifying FacturaSend:', error);
      res.status(500).json({
        disponible: false,
        mensaje: 'Error verifying FacturaSend',
        error: error.message
      });
    }
  });

  // Test endpoint to test FacturaSend invoice creation
  app.post("/api/test-facturasend", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      console.log('🧪 ========================================');
      console.log('🧪 Starting FacturaSend test');
      console.log('🧪 ========================================');

      const facturasend = await import('./facturasend');

      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .limit(1);

      if (!companyInfo[0]) {
        return res.status(400).json({
          success: false,
          message: 'Company billing information not found.'
        });
      }

      if (!companyInfo[0].timbradoNumber || companyInfo[0].timbradoNumber === '0') {
        return res.status(400).json({
          success: false,
          message: 'Timbrado number is not configured. Please configure it in company information.'
        });
      }

      const currentRate = await storage.getCurrentExchangeRate();
      const exchangeRate = currentRate ? parseFloat(currentRate.usdToGuarani) : 7300;

      const testClientData = {
        legalName: 'Test Client S.A.',
        nombre: 'Test Client',
        documentNumber: '80012345-1',
        documentType: 'RUC',
        clientType: 'empresa',
        address: 'Test Avenue 123',
        houseNumber: '123',
        city: 'Asuncion',
        department: 'Central',
        phone: '0981234567',
        email: 'client@test.com',
        userId: 1
      };

      const testStageData = {
        id: 999,
        stageName: 'FacturaSend Test',
        amount: '1000.00',
        projectId: 1
      };

      const testProjectData = {
        id: 1,
        name: 'FacturaSend Test Project'
      };

      const documento = await facturasend.construirDocumentoFacturaSend(
        companyInfo[0],
        testClientData,
        testStageData,
        testProjectData,
        exchangeRate,
        999
      );

      console.log('📦 Generated Document:', JSON.stringify(documento, null, 2));

      const respuestaAPI = await facturasend.enviarFacturaFacturaSend(documento);
      const resultado = facturasend.extraerResultadoFacturaSend(respuestaAPI);

      console.log('🧪 ========================================');
      console.log(`📊 RESULT: ${resultado.estado === 'aceptado' ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log('🧪 ========================================');

      res.json({
        success: resultado.estado === 'aceptado',
        message: resultado.estado === 'aceptado' ? '✅ Invoice processed successfully' : '❌ Error processing invoice',
        datos: {
          cdc: resultado.cdc,
          protocoloAutorizacion: resultado.protocoloAutorizacion,
          estado: resultado.estado,
          mensaje: resultado.mensaje
        },
        xml: resultado.xml,
        qr: resultado.qr,
        documento: documento
      });
    } catch (error: any) {
      console.error('❌ FacturaSend test error:', error);
      res.status(500).json({
        success: false,
        message: 'Error executing FacturaSend test',
        error: error.message
      });
    }
  });

  // Test endpoint to test SIFEN
  app.post("/api/test-sifen", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      console.log('🧪 ========================================');
      console.log('🧪 Starting SIFEN test');
      console.log('🧪 ========================================');

      const { procesarFacturaElectronica, validarDatosFactura } = await import('./sifen');

      // Get company data
      const companyInfo = await db
        .select()
        .from(companyBillingInfo)
        .where(eq(companyBillingInfo.isActive, true))
        .limit(1);

      if (!companyInfo[0]) {
        return res.status(400).json({
          success: false,
          message: 'Company billing information not found. Please configure it first.'
        });
      }

      if (!companyInfo[0].timbradoNumber || companyInfo[0].timbradoNumber === '0') {
        return res.status(400).json({
          success: false,
          message: 'Timbrado number is not configured. Please configure it in company information.'
        });
      }

      // Get current exchange rate
      const currentRate = await storage.getCurrentExchangeRate();
      const exchangeRate = currentRate ? parseFloat(currentRate.usdToGuarani) : 7300;

      // Test data
      const testData = {
        ruc: companyInfo[0].ruc,
        razonSocial: companyInfo[0].companyName,
        timbrado: companyInfo[0].timbradoNumber,
        numeroFactura: `${companyInfo[0].boletaPrefix || '001-001'}-0000999`,
        fechaEmision: new Date(),
        direccionEmisor: companyInfo[0].address || 'Asuncion',
        telefonoEmisor: companyInfo[0].phone || '021000000',
        emailEmisor: companyInfo[0].email || 'info@softwarepar.com',
        departamentoEmisor: companyInfo[0].department || 'Central',
        ciudadEmisor: 'Asuncion',
        clienteDocumento: '1234567',
        clienteTipoDocumento: 'CI' as const,
        clienteNombre: 'Test Client SIFEN',
        clienteDireccion: 'Test Address 123',
        clienteCiudad: 'Asuncion',
        clienteDepartamento: 'Central',
        clienteTelefono: '0981234567',
        clienteEmail: 'client@test.com',
        items: [
          {
            codigo: 'TEST-001',
            descripcion: 'Web development service - SIFEN Test',
            cantidad: 1,
            precioUnitario: 1000,
            montoTotal: 1000,
            ivaAfectacion: 3 as const,
            tasaIVA: 0 as const
          },
          {
            codigo: 'TEST-002',
            descripcion: 'Technical consulting',
            cantidad: 2,
            precioUnitario: 500,
            montoTotal: 1000,
            ivaAfectacion: 1 as const,
            tasaIVA: 10 as const
          }
        ],
        montoTotal: 2000,
        montoTotalPYG: Math.round(2000 * exchangeRate),
        tipoMoneda: 'USD' as const,
        tipoCambio: exchangeRate,
        condicionOperacion: 'contado' as const,
        indicadorPresencia: 2 as const
      };

      console.log('📊 Test invoice data:', {
        ruc: testData.ruc,
        numeroFactura: testData.numeroFactura,
        cliente: testData.clienteNombre,
        items: testData.items.length,
        montoTotal: testData.montoTotal,
        montoTotalPYG: testData.montoTotalPYG
      });

      // Validate data
      console.log('🔍 Validating invoice data...');
      const validacion = validarDatosFactura(testData);
      if (!validacion.valido) {
        console.error('❌ Validation failed:', validacion.errores);
        return res.status(400).json({
          success: false,
          message: 'Data validation failed',
          errores: validacion.errores
        });
      }
      console.log('✅ Validation successful');

      // Process invoice
      console.log('🔄 Processing electronic invoice...');
      const resultado = await procesarFacturaElectronica(testData);

      console.log('🧪 ========================================');
      console.log(`📊 RESULT: ${resultado.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log('🧪 ========================================');

      // Prepare response
      const response = {
        success: resultado.success,
        message: resultado.success ? '✅ Invoice processed successfully' : '❌ Error processing invoice',
        datos: {
          cdc: resultado.cdc,
          protocoloAutorizacion: resultado.protocoloAutorizacion,
          estado: resultado.estado,
          mensajeError: resultado.mensajeError,
          urlQR: resultado.urlQR
        },
        xml: resultado.xmlGenerado,
        ambiente: process.env.SIFEN_AMBIENTE || 'test',
        configuracion: {
          idCSC: process.env.SIFEN_ID_CSC || '0001',
          tieneCertificado: !!process.env.SIFEN_CERTIFICADO_PATH,
          endpoint: process.env.SIFEN_WSDL_URL || 'https://sifen-test.set.gov.py/de/ws/sync/recibe'
        }
      };

      res.json(response);

    } catch (error: any) {
      console.error('❌ SIFEN test error:', error);
      console.error('📋 Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'SIFEN test error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  app.post("/api/admin/work-modalities", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const modality = await storage.createWorkModality(req.body);
      res.status(201).json(modality);
    } catch (error) {
      console.error("Error creating admin work modality:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/admin/work-modalities/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const modalityId = parseInt(req.params.id);
      const updated = await storage.updateWorkModality(modalityId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating admin work modality:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/work-modalities/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const modalityId = parseInt(req.params.id);
      await storage.deleteWorkModality(modalityId);
      res.json({ message: "Modality deleted successfully" });
    } catch (error) {
      console.error("Error deleting admin work modality:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });


  app.post("/api/admin/payments/approve", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { stageId } = req.body;
      console.log(`💰 Approving payment stage: ${stageId}`);

      const stage = await db.select().from(paymentStages).where(eq(paymentStages.id, stageId)).limit(1);
      if (!stage[0]) {
        return res.status(404).json({ message: "Stage not found" });
      }

      const project = await storage.getProject(stage[0].projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const client = await storage.getUserById(project.clientId);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }

      // Get billing info
      const billingInfo = await db.select().from(clientBillingInfo).where(eq(clientBillingInfo.userId, client.id)).limit(1);
      const company = await db.select().from(companyBillingInfo).where(eq(companyBillingInfo.isActive, true)).limit(1);

      // Mark stage as paid
      await db.update(paymentStages)
        .set({ 
          status: 'paid', 
          paidAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(paymentStages.id, stageId));

      // Generate Invoice in FacturaSend if enabled
      let sifenData = null;
      if (company[0]?.isSignatureProcessEnabled) {
        try {
          const facturasend = await import('./facturasend');
          const exchangeRateData = await storage.getCurrentExchangeRate();
          const exchangeRate = exchangeRateData ? parseFloat(exchangeRateData.usdToGuarani) : 7300;

          const nextInvoiceNumber = await storage.getNextInvoiceNumber();
          const docFactura = await facturasend.construirDocumentoFacturaSend(
            company[0],
            billingInfo[0] || client,
            stage[0],
            project,
            exchangeRate,
            nextInvoiceNumber
          );

          const resp = await facturasend.enviarFacturaFacturaSend(docFactura);
          sifenData = facturasend.extraerResultadoFacturaSend(resp);
          console.log('✅ FacturaSend response:', sifenData);
        } catch (fsError) {
          console.error('❌ FacturaSend integration error:', fsError);
        }
      }

      // Create internal invoice record
      const [invoice] = await db.insert(invoices).values({
        invoiceNumber: sifenData?.cdc ? `FE-${stageId}` : `INT-${stageId}`,
        projectId: project.id,
        clientId: client.id,
        paymentStageId: stageId,
        amount: stage[0].amount,
        totalAmount: stage[0].amount,
        status: 'paid',
        dueDate: new Date(),
        paidDate: new Date(),
        sifenCDC: sifenData?.cdc,
        sifenQR: sifenData?.qr,
        sifenEstado: sifenData?.estado || 'pending',
        sifenProtocolo: sifenData?.protocoloAutorizacion,
        sifenXML: sifenData?.xml,
        sifenFechaEnvio: new Date(),
        issueDateSnapshot: new Date().toLocaleDateString('es-PY'),
        issueDateTimeSnapshot: new Date().toLocaleString('es-PY'),
        currency: 'USD'
      }).returning();

      res.json({ 
        success: true, 
        message: "Payment approved and invoice generated",
        invoiceId: invoice.id,
        sifenStatus: sifenData?.estado
      });
    } catch (error) {
      console.error("Error approving payment:", error);
      res.status(500).json({ message: "Error approving payment" });
    }
  });

  // WebSocket Server
  const httpServer = createServer(app);
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    perMessageDeflate: false // Disable compression for better performance
  });

  // Heartbeat mechanism to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        console.log("🔌 Terminating inactive WebSocket connection");
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // Check every 30 seconds

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: WebSocket, request) => {
    console.log("✅ New WebSocket connection established");

    // Set up heartbeat for keeping connections alive
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle connection errors
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log("🔌 WebSocket connection closed");
    });

    console.log("New WebSocket connection");
    let userId: number | null = null;

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log("Received WebSocket message:", data);

        // Handle user authentication for WebSocket
        if (data.type === 'auth') {
          console.log('🔐 WebSocket authentication attempt:', {
            userId: data.userId,
            hasToken: !!data.token
          });

          if (data.userId) {
            userId = data.userId;
            registerWSConnection(userId, ws);

            console.log('✅ User registered on WebSocket:', userId);

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "auth_success",
                message: "User authenticated for real-time notifications",
                userId: userId,
                timestamp: new Date().toISOString(),
              }));
            }
          } else {
            console.error('❌ WebSocket authentication failed: No userId');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "auth_error",
                message: "Authentication error",
                timestamp: new Date().toISOString(),
              }));
            }
          }
        }

        // Echo back for other message types
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "echo",
            data: data,
            timestamp: new Date().toISOString(),
          }));
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
    });

    // Send welcome message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "welcome",
        message: "Connected to real-time notification server",
        timestamp: new Date().toISOString(),
      }));
    }
  });

  // Hero Slides endpoints
  app.get("/api/hero-slides", async (_req, res) => {
    try {
      const slides = await db
        .select()
        .from(heroSlides)
        .where(eq(heroSlides.isActive, true))
        .orderBy(asc(heroSlides.displayOrder));
      res.json(slides);
    } catch (error: any) {
      console.error("Error fetching hero slides:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/hero-slides", authenticateToken, requireRole(["admin"]), async (_req: AuthRequest, res) => {
    try {
      const slides = await db
        .select()
        .from(heroSlides)
        .orderBy(asc(heroSlides.displayOrder));
      res.json(slides);
    } catch (error: any) {
      console.error("Error fetching admin hero slides:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/hero-slides", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const [slide] = await db
        .insert(heroSlides)
        .values({
          ...req.body,
          updatedAt: new Date(),
        })
        .returning();
      res.status(201).json(slide);
    } catch (error: any) {
      console.error("Error creating admin hero slide:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/hero-slides/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const slideId = parseInt(req.params.id);
      if (isNaN(slideId)) {
        return res.status(400).json({ message: "Invalid slide ID" });
      }

      const [slide] = await db
        .update(heroSlides)
        .set({
          ...req.body,
          updatedAt: new Date(),
        })
        .where(eq(heroSlides.id, slideId))
        .returning();

      if (!slide) {
        return res.status(404).json({ message: "Hero slide not found" });
      }

      res.json(slide);
    } catch (error: any) {
      console.error("Error updating admin hero slide:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/hero-slides/:id", authenticateToken, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const slideId = parseInt(req.params.id);
      if (isNaN(slideId)) {
        return res.status(400).json({ message: "Invalid slide ID" });
      }

      const result = await db
        .delete(heroSlides)
        .where(eq(heroSlides.id, slideId));

      if (result.count === 0) {
        return res.status(404).json({ message: "Hero slide not found" });
      }

      res.json({ success: true, message: "Hero slide deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting admin hero slide:", error);
      res.status(500).json({ message: error.message });
    }
  });


  return httpServer;
}