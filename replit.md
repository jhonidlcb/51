# Overview

SoftwarePar is a comprehensive project management platform for the Paraguayan software development market. It functions as a multi-role SaaS application, connecting administrators, clients, and partners (affiliates) to manage the entire software development lifecycle. Key features include project creation, budget negotiation, payment tracking, support ticketing, and partner referral management with commission tracking.

The platform is localized for Paraguay, featuring integrated support for electronic invoicing (SIFEN), multi-currency handling (USD/Guaraní), and geo-specific SEO optimization to establish SoftwarePar as a leading technology partner in the region.

# Recent Changes (January 02, 2026)

## Invoicing & SIFEN Integration
- **FacturaSend Logic Fix:** Optimized the background process in `server/routes.ts` (`/api/payment-stages/:id/approve-payment`) to ensure invoices are correctly sent to FacturaSend API during payment approval.
- **CDC & QR Capture:** Improved the extraction and storage of SIFEN data (CDC, Protocol, QR URL) into the `invoices` table.
- **PDF Localization:** Updated `server/routes.ts` (RESIMPLE download endpoint) to translate payment stage descriptions (e.g., "Initial Payment" -> "Pago Inicial") for professional representation in Paraguay.
- **Immutable Snapshots:** Ensured invoice dates and exchange rates are saved as immutable snapshots at the time of payment to maintain fiscal accuracy.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Technology Stack

**Frontend:** React 18 (TypeScript), Vite, Wouter, TanStack Query, Tailwind CSS (shadcn/ui), Framer Motion, WebSocket.
**Backend:** Express.js (TypeScript), Node.js, RESTful API, WebSocket server, JWT authentication (bcrypt).
**Database:** PostgreSQL (Neon serverless), Drizzle ORM, schema-first approach with migrations.

## Core Architectural Decisions

### Authentication & Authorization
JWT token-based authentication with role-based access control (RBAC) for admin, client, and partner roles. Tokens are stored in localStorage with a 7-day expiration.

### Database Design
Relational database using Drizzle ORM with tables for users, projects, partners, referrals, tickets, portfolio, invoices, payment stages, budget negotiations, exchange rates, and legal pages. Features soft deletes, timestamp tracking, and foreign key relationships.

### Real-time Communication
WebSocket connections provide bidirectional real-time updates for user-specific notifications and project messages, ensuring low-latency communication.

### Payment System
A multi-stage, milestone-based payment system supporting configurable stages, multiple payment methods, payment proof uploads, and currency conversion between USD and Guaraní.

### File Management
Server-side file storage using Multer middleware for project files, payment proofs, and portfolio images, with metadata tracked in the database and security measures for file validation.

### Budget Negotiation System
A structured workflow for budget negotiations between clients and administrators, formalizing discussions and maintaining an audit trail through defined states (pending, client_reviewing, accepted, rejected).

## UI/UX Decisions
The platform utilizes Tailwind CSS with shadcn/ui components and Radix UI primitives for accessible and consistent UI/UX. Framer Motion is used for animations, including seamless hero slider transitions (fade-only, `mode="sync"` for smooth cross-fading).

## Feature Specifications
- **Hero Slider Opacity Control:** Administrators can control the background color opacity (0-100%) for hero slides, allowing for fully customizable color overlays or complete transparency.
- **SEO Optimization:** Extensive SEO enhancements for Google AI Overview (Gemini), including improved meta tags, comprehensive Schema.org implementation (Organization, LocalBusiness, FAQPage), and content optimization on the landing page for high visibility in Paraguay-specific searches.
- **Admin Login:** Secure admin login with email `softwarepar.lat@gmail.com` and password `admin123`.

# External Dependencies

## Third-Party Services
- **Neon Database:** Serverless PostgreSQL hosting.
- **Email Service:** Nodemailer for transactional emails (requires GMAIL_USER, GMAIL_PASS).
- **reCAPTCHA v3:** Bot protection for forms.
- **SIFEN (Paraguay Electronic Invoicing):** Integration via `FacturaSend` for XML generation, digital signature, and SET submission.

## Frontend Libraries
- **UI Components:** Radix UI, shadcn/ui, Tailwind CSS.
- **State Management:** TanStack Query, React hooks.
- **Form Handling:** React Hook Form with Zod validation.

## Development Tools
- **Build & Dev Server:** Vite, ESBuild.
- **Code Quality:** TypeScript, Path aliases, ESM modules.

## SEO & Analytics
- **Meta Tags:** Comprehensive meta tags for title, description, keywords, Open Graph, Twitter Cards, and geographic data.
- **Schema.org:** LocalBusiness, Service, and OfferCatalog schemas with Paraguay-focused details.
- **Content Optimization:** Keyword-rich headings and content targeting "desarrollo de software Paraguay," "facturación electrónica SIFEN," etc.
- **Image Optimization:** Descriptive alt tags and lazy loading.
- **Technical SEO:** `robots.txt` and dynamic `sitemap.xml` endpoint.
- **Internationalization Prep:** Framework for multi-language and multi-currency support.
