import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserRoleProvider } from "@/context/UserRoleContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { ToastProvider } from "@/context/ToastContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Layout } from "@/components/layout/Layout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { InstallerProtectedRoute } from "@/components/layout/InstallerProtectedRoute";
import { InstallerLayout } from "@/components/layout/InstallerLayout";
import { SellerProtectedRoute } from "@/components/layout/SellerProtectedRoute";
import { SellerLayout } from "@/components/layout/SellerLayout";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";

// Lazy-loaded pages
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Bookings = lazy(() => import("@/pages/Bookings"));
const DeviceOrders = lazy(() => import("@/pages/DeviceOrders"));
const BookingDetail = lazy(() => import("@/pages/BookingDetail"));
const CreateBooking = lazy(() => import("@/pages/CreateBooking"));
const FinalizeBooking = lazy(() => import("@/pages/FinalizeBooking"));
const CompletedGig = lazy(() => import("@/pages/CompletedGig"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const Employees = lazy(() => import("@/pages/Employees"));
const EmployeeDetail = lazy(() => import("@/pages/EmployeeDetail"));
const Teams = lazy(() => import("@/pages/Teams"));
const Services = lazy(() => import("@/pages/Services"));
const DiscountCodes = lazy(() => import("@/pages/DiscountCodes"));
const Salaries = lazy(() => import("@/pages/Salaries"));
const FormSubmissions = lazy(() => import("@/pages/FormSubmissions"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const AddonServices = lazy(() => import("@/pages/AddonServices"));
const Products = lazy(() => import("@/pages/Products"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const ProductCategories = lazy(() => import("@/pages/ProductCategories"));
const EmailTemplates = lazy(() => import("@/pages/EmailTemplates"));
const SmsInbox = lazy(() => import("@/pages/SmsInbox"));
// Site analytics
const SiteAnalytics = lazy(() => import("@/pages/analytics/SiteAnalytics"));
// Marketing pages
const MarketingDashboard = lazy(() => import("@/pages/marketing/MarketingDashboard"));
const MarketingCampaigns = lazy(() => import("@/pages/marketing/MarketingCampaigns"));
const AreaProfitability = lazy(() => import("@/pages/marketing/AreaProfitability"));
const CampaignMapping = lazy(() => import("@/pages/marketing/CampaignMapping"));
const SalesCommission = lazy(() => import("@/pages/marketing/SalesCommission"));
// Project pages
const ProjectList = lazy(() => import("@/pages/projects/ProjectList"));
const CreateProject = lazy(() => import("@/pages/projects/CreateProject"));
const ProjectDetail = lazy(() => import("@/pages/projects/ProjectDetail"));
const Tasks = lazy(() => import("@/pages/projects/Tasks"));
// Customer service pages
// const _TicketInbox = lazy(() => import("@/pages/customer-service/TicketInbox"));
// const _TicketDetail = lazy(() => import("@/pages/customer-service/TicketDetail"));
const KnowledgeBase = lazy(() => import("@/pages/customer-service/KnowledgeBase"));
const KnowledgeArticle = lazy(() => import("@/pages/customer-service/KnowledgeArticle"));
const CannedResponses = lazy(() => import("@/pages/customer-service/CannedResponses"));
const CSSettings = lazy(() => import("@/pages/customer-service/CSSettings"));
const CSDashboard = lazy(() => import("@/pages/customer-service/CSDashboard"));
// Sales pages
const SellerPerformance = lazy(() => import("@/pages/sales/SellerPerformance"));
const LeadManagement = lazy(() => import("@/pages/sales/LeadManagement"));
const OutboundLeadDetail = lazy(() => import("@/pages/sales/OutboundLeadDetail"));
const InboundManagement = lazy(() => import("@/pages/sales/InboundManagement"));
const InboundDealDetail = lazy(() => import("@/pages/sales/InboundDealDetail"));
const QuoteBuilder = lazy(() => import("@/pages/sales/QuoteBuilder"));
const QuoteTemplates = lazy(() => import("@/pages/sales/QuoteTemplates"));
const SalesSettings = lazy(() => import("@/pages/sales/SalesSettings"));
const SellerRefStats = lazy(() => import("@/pages/sales/SellerRefStats"));
const BookTimeFlow = lazy(() => import("@/pages/sales/BookTimeFlow"));
const OfferWizard = lazy(() => import("@/pages/sales/OfferWizard"));
const OfferPdfPreview = lazy(() => import("@/pages/sales/OfferPdfPreview"));
const OfferTemplateBuilder = lazy(() => import("@/pages/sales/OfferTemplateBuilder"));

// Seller portal pages
const SellerLogin = lazy(() => import("@/pages/seller/SellerLogin"));
const SellerDashboard = lazy(() => import("@/pages/seller/SellerDashboard"));
const SellerCalendar = lazy(() => import("@/pages/seller/SellerCalendar"));
const SellerOutboundLeads = lazy(() => import("@/pages/seller/SellerOutboundLeads"));
const SellerLeadDetail = lazy(() => import("@/pages/seller/SellerLeadDetail"));
const SellerInbound = lazy(() => import("@/pages/seller/SellerInbound"));
const SellerDealDetail = lazy(() => import("@/pages/seller/SellerDealDetail"));
const SellerOffers = lazy(() => import("@/pages/seller/SellerOffers"));
const SellerQuoteBuilder = lazy(() => import("@/pages/seller/SellerQuoteBuilder"));
const SellerEmail = lazy(() => import("@/pages/seller/SellerEmail"));
const CompanyEmail = lazy(() => import("@/pages/CompanyEmail"));
const SellerBookTimeFlow = lazy(() => import("@/pages/sales/BookTimeFlow"));
const SellerOfferWizard = lazy(() => import("@/pages/sales/OfferWizard"));
const SellerCreateBooking = lazy(() => import("@/pages/seller/SellerCreateBooking"));
const SellerBookingDetail = lazy(() => import("@/pages/seller/SellerBookingDetail"));
const SellerDiscountCodes = lazy(() => import("@/pages/seller/SellerDiscountCodes"));

const InstallerLogin = lazy(() => import("@/pages/installer/InstallerLogin"));
const InstallerDashboard = lazy(() => import("@/pages/installer/InstallerDashboard"));
const InstallerCalendar = lazy(() => import("@/pages/installer/InstallerCalendar"));
const InstallerBookingDetail = lazy(() => import("@/pages/installer/InstallerBookingDetail"));
const InstallerCommissions = lazy(() => import("@/pages/installer/InstallerCommissions"));
const InstallerProfile = lazy(() => import("@/pages/installer/InstallerProfile"));
const InstallerFinalizeBooking = lazy(() => import("@/pages/installer/InstallerFinalizeBooking"));
const InstallerCreateBooking = lazy(() => import("@/pages/installer/InstallerCreateBooking"));
const InstallerCompletedGig = lazy(() => import("@/pages/installer/InstallerCompletedGig"));
const ProtocolPage = lazy(() => import("@/pages/ProtocolPage"));
const InstallerProtocolPage = lazy(() => import("@/pages/installer/InstallerProtocolPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <UserRoleProvider>
          <ConfirmProvider>
          <ToastProvider>
            <ImpersonationBanner />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Admin routes */}
                <Route path="/login" element={<Login />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="varaukset" element={<Bookings />} />
                  <Route path="laitetilaukset" element={<DeviceOrders />} />
                  <Route path="logistiikka" element={<Navigate to="/varasto" replace />} />
                  <Route path="varaukset/uusi" element={<CreateBooking />} />
                  <Route path="varaukset/tehty-keikka" element={<CompletedGig />} />
                  <Route path="varaukset/:bookingNumber/viimeistely" element={<FinalizeBooking />} />
                  <Route path="varaukset/:bookingNumber/poytakirja" element={<ProtocolPage />} />
                  <Route path="varaukset/:bookingNumber" element={<BookingDetail />} />
                  <Route path="kalenteri" element={<Calendar />} />
                  <Route path="asiakkaat" element={<Customers />} />
                  <Route path="asiakkaat/:id" element={<CustomerDetail />} />
                  <Route path="tyontekijat" element={<Employees />} />
                  <Route path="tyontekijat/:id" element={<EmployeeDetail />} />
                  <Route path="tiimit" element={<Teams />} />
                  <Route path="palvelut" element={<Services />} />
                  <Route path="lisapalvelut" element={<AddonServices />} />
                  <Route path="tuotteet" element={<Products />} />
                  <Route path="tuotteet/kategoriat" element={<ProductCategories />} />
                  <Route path="tuotteet/:id" element={<ProductDetail />} />
                  <Route path="varasto" element={<Inventory />} />
                  <Route path="palkat" element={<Salaries />} />
                  <Route path="palautteet" element={<Feedback />} />
                  <Route path="lomakkeet" element={<FormSubmissions />} />
                  <Route path="analytiikka" element={<Analytics />} />
                  <Route path="kulut" element={<Expenses />} />
                  <Route path="analytiikka/sivusto" element={<SiteAnalytics />} />
                  <Route path="analytiikka/markkinointi" element={<MarketingDashboard />} />
                  <Route path="analytiikka/markkinointi/kampanjat" element={<MarketingCampaigns />} />
                  <Route path="analytiikka/markkinointi/aluekannattavuus" element={<AreaProfitability />} />
                  <Route path="analytiikka/markkinointi/kohdistukset" element={<CampaignMapping />} />
                  <Route path="analytiikka/markkinointi/provisio" element={<SalesCommission />} />
                  <Route path="alennuskoodit" element={<DiscountCodes />} />
                  <Route path="asetukset" element={<Settings />} />
                  <Route path="sahkopostipohjat" element={<EmailTemplates />} />
                  <Route path="viestit" element={<SmsInbox />} />

                  {/* Project management routes */}
                  <Route path="projektit" element={<ProjectList />} />
                  <Route path="projektit/uusi" element={<CreateProject />} />
                  <Route path="projektit/:id" element={<ProjectDetail />} />
                  <Route path="tehtavat" element={<Tasks />} />

                  {/* Customer service routes — unified email-driven inbox */}
                  <Route path="asiakaspalvelu" element={<CompanyEmail />} />
                  <Route path="asiakaspalvelu/tietopankki" element={<KnowledgeBase />} />
                  <Route path="asiakaspalvelu/tietopankki/:slug" element={<KnowledgeArticle />} />
                  <Route path="asiakaspalvelu/pikavastaukset" element={<CannedResponses />} />
                  <Route path="asiakaspalvelu/raportointi" element={<CSDashboard />} />
                  <Route path="asiakaspalvelu/asetukset" element={<CSSettings />} />

                  {/* Sales management routes */}
                  <Route path="myynti" element={<SellerPerformance />} />
                  <Route path="myynti/liidit" element={<LeadManagement />} />
                  <Route path="myynti/liidit/:id" element={<OutboundLeadDetail />} />
                  <Route path="myynti/inbound" element={<InboundManagement />} />
                  <Route path="myynti/inbound/:id" element={<InboundDealDetail />} />
                  <Route path="myynti/tarjoukset/:opportunityId" element={<QuoteBuilder />} />
                  <Route path="myynti/tarjous/:opportunityId" element={<OfferWizard />} />
                  <Route path="myynti/tarjous-pdf/:offerId" element={<OfferPdfPreview />} />
                  <Route path="myynti/varaus/:opportunityId" element={<BookTimeFlow />} />
                  <Route path="myynti/tarjousmallit" element={<QuoteTemplates />} />
                  <Route path="myynti/tarjouspohja" element={<OfferTemplateBuilder />} />
                  <Route path="myynti/tarjouspohja/:templateId" element={<OfferTemplateBuilder />} />
                  <Route path="myynti/tarjous-uusi" element={<OfferTemplateBuilder />} />
                  <Route path="myynti/tarjous-uusi/:templateId" element={<OfferTemplateBuilder />} />
                  <Route path="myynti/viitekoodit" element={<SellerRefStats />} />
                  <Route path="myynti/asetukset" element={<SalesSettings />} />
                </Route>

                {/* Seller portal routes */}
                <Route path="/myyja/login" element={<SellerLogin />} />
                <Route
                  path="/myyja"
                  element={
                    <SellerProtectedRoute>
                      <SellerLayout />
                    </SellerProtectedRoute>
                  }
                >
                  <Route index element={<SellerDashboard />} />
                  <Route path="kalenteri" element={<SellerCalendar />} />
                  <Route path="varaukset/:bookingNumber" element={<SellerBookingDetail />} />
                  <Route path="uusi-varaus" element={<SellerCreateBooking />} />
                  <Route path="kylmasoitot" element={<SellerOutboundLeads />} />
                  <Route path="kylmasoitot/:id" element={<SellerLeadDetail />} />
                  <Route path="inbound" element={<SellerInbound />} />
                  <Route path="inbound/:id" element={<SellerDealDetail />} />
                  <Route path="tarjoukset" element={<SellerOffers />} />
                  <Route path="tarjoukset/:opportunityId" element={<SellerQuoteBuilder />} />
                  <Route path="tarjous/:opportunityId" element={<SellerOfferWizard />} />
                  <Route path="tarjous-pdf/:offerId" element={<OfferPdfPreview />} />
                  <Route path="tarjouspohja" element={<OfferTemplateBuilder />} />
                  <Route path="tarjouspohja/:templateId" element={<OfferTemplateBuilder />} />
                  <Route path="tarjous-uusi" element={<OfferTemplateBuilder />} />
                  <Route path="tarjous-uusi/:templateId" element={<OfferTemplateBuilder />} />
                  <Route path="sahkoposti" element={<SellerEmail />} />
                  <Route path="alennuskoodit" element={<SellerDiscountCodes />} />
                  <Route path="varaus/:opportunityId" element={<SellerBookTimeFlow />} />
                </Route>

                {/* Installer routes */}
                <Route path="/tyontekija/login" element={<InstallerLogin />} />
                <Route
                  path="/tyontekija"
                  element={
                    <InstallerProtectedRoute>
                      <InstallerLayout />
                    </InstallerProtectedRoute>
                  }
                >
                  <Route index element={<InstallerDashboard />} />
                  <Route path="provisiot" element={<InstallerCommissions />} />
                  <Route path="kalenteri" element={<InstallerCalendar />} />
                  <Route path="uusi-varaus" element={<InstallerCreateBooking />} />
                  <Route path="tehty-keikka" element={<InstallerCompletedGig />} />
                  <Route path="varaukset/:bookingNumber/viimeistely" element={<InstallerFinalizeBooking />} />
                  <Route path="varaukset/:bookingNumber/poytakirja" element={<InstallerProtocolPage />} />
                  <Route path="varaukset/:bookingNumber" element={<InstallerBookingDetail />} />
                  <Route path="asetukset" element={<InstallerProfile />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
          </ConfirmProvider>
          </UserRoleProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
