/**
 * Centralized query key factory.
 * Prevents typos and ensures consistent cache invalidation.
 */
export const queryKeys = {
  // Bookings
  bookings: {
    all: ["bookings"] as const,
    list: (filters: object) => ["bookings", filters] as const,
    detail: (id: string | undefined) => ["booking", id] as const,
    byNumber: (num: number | undefined) => ["booking-by-number", num] as const,
    statusLog: (bookingId: string | undefined) => ["booking-status-log", bookingId] as const,
    auditLog: (bookingId: string | undefined) => ["booking-audit-log", bookingId] as const,
    notes: (bookingId: string | undefined) => ["booking-notes", bookingId] as const,
  },

  // Customers
  customers: {
    all: ["customers"] as const,
    list: (search?: string) => ["customers", search] as const,
    detail: (id: string | undefined) => ["customer", id] as const,
    bookings: (customerId: string | undefined) => ["customer-bookings", customerId] as const,
    notes: (customerId: string | undefined) => ["customer-notes", customerId] as const,
  },

  // Employees
  employees: {
    all: ["employees"] as const,
    list: (role?: string) => ["employees", role] as const,
    detail: (id: string | undefined) => ["employee", id] as const,
    byUserId: (userId: string | undefined) => ["employee-by-user", userId] as const,
    services: (employeeId: string | undefined) => ["employee-services", employeeId] as const,
  },

  // Heat pumps (EPREL comparison catalog)
  heatPumps: {
    all: ["heat-pumps"] as const,
    list: (filters?: object) => ["heat-pumps", filters] as const,
    detail: (id: string | undefined) => ["heat-pump", id] as const,
    publicList: () => ["heat-pumps", "public"] as const,
  },

  // Employee teams
  teams: {
    all: ["employee-teams"] as const,
    list: () => ["employee-teams", "list"] as const,
    detail: (id: string | undefined) => ["employee-team", id] as const,
    members: (teamId: string | undefined) => ["employee-team-members", teamId] as const,
    myTeam: (employeeId?: string) => ["my-team", employeeId] as const,
  },

  // Calendars
  calendars: {
    all: ["installer-calendars"] as const,
    list: (employeeId?: string) => ["installer-calendars", employeeId] as const,
    weeklySlots: (calendarId: string | undefined) => ["weekly-slots", calendarId] as const,
    overrides: (calendarId: string | undefined) => ["calendar-overrides", calendarId] as const,
  },

  // Services
  services: {
    all: ["services"] as const,
  },

  // Service Variants
  serviceVariants: {
    all: ["service-variants"] as const,
    byService: (serviceId: string | undefined) => ["service-variants", serviceId] as const,
  },

  // Service Areas
  serviceAreas: {
    all: ["service-areas"] as const,
    list: (employeeId?: string) => ["service-areas", employeeId] as const,
  },

  // Contracts
  contracts: {
    all: ["contracts"] as const,
    list: (filters: object) => ["contracts", filters] as const,
    detail: (id: string | undefined) => ["contract", id] as const,
    byNumber: (num: number | undefined) => ["contract-by-number", num] as const,
    customerContracts: (customerId: string | undefined) => ["customer-contracts", customerId] as const,
    visits: (contractId: string | undefined) => ["contract-visits", contractId] as const,
    statusLog: (contractId: string | undefined) => ["contract-status-log", contractId] as const,
    stats: ["contract-stats"] as const,
    templates: {
      all: ["contract-templates"] as const,
      detail: (id: string | undefined) => ["contract-template", id] as const,
    },
  },

  // Dashboard
  dashboard: {
    stats: ["dashboard-stats"] as const,
  },

  // Installer
  installer: {
    bookings: (employeeId: string | undefined) => ["installer-bookings", employeeId] as const,
    dashboardStats: (employeeId: string | undefined) => ["installer-dashboard-stats", employeeId] as const,
    activeShift: (employeeId: string | undefined) => ["installer-active-shift", employeeId] as const,
    shiftHistory: (employeeId: string | undefined, month?: string) => ["installer-shift-history", employeeId, month] as const,
  },

  // Form Submissions
  formSubmissions: {
    all: ["form-submissions"] as const,
    list: (filters?: object) => ["form-submissions", filters] as const,
    count: ["form-submissions-count"] as const,
  },

  // Contact Forms & Automations
  contactForms: {
    all: ["contact-forms"] as const,
    detail: (id: string | undefined) => ["contact-form", id] as const,
  },
  formAutomations: {
    all: ["form-automations"] as const,
    byForm: (formId: string | undefined) => ["form-automations", formId] as const,
    queue: (status?: string) => ["form-automation-queue", status] as const,
    log: (status?: string, page?: number) => ["form-automation-log", status, page] as const,
  },

  // Discount Codes
  discountCodes: {
    all: ["discount-codes"] as const,
    bookings: (codeId: string | null) => ["discount-code-bookings", codeId] as const,
    byEmployee: (employeeId: string | undefined) => ["discount-codes", "by-employee", employeeId] as const,
  },

  // Add-on Services
  addonServices: {
    all: ["addon-services"] as const,
    byService: (serviceId: string | undefined) => ["addon-services", "by-service", serviceId] as const,
  },

  // Product Categories
  productCategories: {
    all: ["product-categories"] as const,
  },

  // Products
  products: {
    all: ["products"] as const,
    list: (categoryId?: string) => ["products", categoryId] as const,
    detail: (id: string | undefined) => ["product", id] as const,
  },

  // Inventory
  inventory: {
    movements: (filters?: object) => ["inventory-movements", filters] as const,
    byProduct: (productId: string | undefined) => ["inventory-movements", productId] as const,
    summary: ["inventory-summary"] as const,
    units: (filters?: object) => ["inventory-units", filters] as const,
    unitsByBooking: (bookingId: string | undefined) => ["inventory-units", "booking", bookingId] as const,
  },

  // Booking Line Items
  bookingLineItems: {
    byBooking: (bookingId: string | undefined) => ["booking-line-items", bookingId] as const,
  },

  // Booking Employees (team members)
  bookingEmployees: {
    all: ["booking-employees"] as const,
    byBooking: (bookingId: string | undefined) => ["booking-employees", bookingId] as const,
    byEmployee: (employeeId: string | undefined) => ["booking-employees", "by-employee", employeeId] as const,
  },

  // Employee Commissions
  employeeCommissions: {
    all: ["employee-commissions"] as const,
    byEmployee: (employeeId: string | undefined) => ["employee-commissions", employeeId] as const,
  },

  // Palkallinen internal costs (admin-only)
  palkallinenInternalCosts: {
    all: ["palkallinen-internal-costs"] as const,
    defaults: ["palkallinen-internal-costs", "defaults"] as const,
    byEmployee: (employeeId: string | undefined) => ["palkallinen-internal-costs", "employee", employeeId] as const,
    bookingSnapshots: (bookingId: string | undefined) => ["palkallinen-internal-costs", "booking", bookingId] as const,
    monthlySummary: (month: string) => ["palkallinen-internal-costs", "monthly", month] as const,
  },

  // Company Settings
  companySettings: ["company-settings"] as const,

  // ─── Projects ──────────────────────────────────────────────────────────────
  projects: {
    all: ["projects"] as const,
    list: (filters?: object) => ["projects", filters] as const,
    detail: (id: string | undefined) => ["project", id] as const,
    members: (projectId: string | undefined) => ["project-members", projectId] as const,
    tasks: (projectId: string | undefined) => ["project-tasks", projectId] as const,
    taskDetail: (taskId: string | undefined) => ["project-task", taskId] as const,
    taskComments: (taskId: string | undefined) => ["project-task-comments", taskId] as const,
    taskChecklist: (taskId: string | undefined) => ["project-task-checklist", taskId] as const,
    notes: (projectId: string | undefined) => ["project-notes", projectId] as const,
    activity: (projectId: string | undefined) => ["project-activity", projectId] as const,
    files: (projectId: string | undefined) => ["project-files", projectId] as const,
    tags: ["project-tags"] as const,
    templates: ["project-templates"] as const,
    standaloneTasks: (filters?: object) => ["standalone-tasks", filters] as const,
  },

  // ─── Customer Service ────────────────────────────────────────────────────────
  customerService: {
    tickets: {
      all: ["cs-tickets"] as const,
      list: (filters?: object) => ["cs-tickets", filters] as const,
      detail: (id: string | undefined) => ["cs-ticket", id] as const,
      events: (ticketId: string | undefined) => ["cs-ticket-events", ticketId] as const,
      count: (status?: string) => ["cs-ticket-count", status] as const,
      watchers: (ticketId: string | undefined) => ["cs-ticket-watchers", ticketId] as const,
    },
    knowledgeBase: {
      all: ["cs-kb-articles"] as const,
      list: (filters?: object) => ["cs-kb-articles", filters] as const,
      detail: (id: string | undefined) => ["cs-kb-article", id] as const,
      bySlug: (slug: string | undefined) => ["cs-kb-article-slug", slug] as const,
      search: (query: string) => ["cs-kb-search", query] as const,
      versions: (articleId: string | undefined) => ["cs-kb-versions", articleId] as const,
    },
    cannedResponses: {
      all: ["cs-canned-responses"] as const,
    },
    categories: {
      all: ["cs-categories"] as const,
    },
    automationRules: {
      all: ["cs-automation-rules"] as const,
    },
    analytics: {
      dashboard: (period?: string) => ["cs-analytics", period] as const,
    },
    notifications: {
      unread: ["cs-notifications-unread"] as const,
    },
  },

  // ─── Sales ───────────────────────────────────────────────────────────────────
  sales: {
    // Leads
    leads: {
      all: ["sales-leads"] as const,
      list: (filters?: object) => ["sales-leads", filters] as const,
      detail: (id: string | undefined) => ["sales-lead", id] as const,
      notes: (leadId: string | undefined) => ["sales-lead-notes", leadId] as const,
      events: (leadId: string | undefined) => ["sales-lead-events", leadId] as const,
    },
    // Call Lists
    callLists: {
      all: ["sales-call-lists"] as const,
    },
    // Lead Stages
    leadStages: {
      all: ["sales-lead-stages"] as const,
    },
    // Call Scripts
    callScripts: {
      all: ["sales-call-scripts"] as const,
    },
    // Tags
    tags: {
      all: ["sales-tags"] as const,
      byType: (tagType?: string) => ["sales-tags", tagType] as const,
    },
    // Opportunities
    opportunities: {
      all: ["sales-opportunities"] as const,
      list: (filters?: object) => ["sales-opportunities", filters] as const,
      detail: (id: string | undefined) => ["sales-opportunity", id] as const,
      notes: (oppId: string | undefined) => ["sales-opportunity-notes", oppId] as const,
      events: (oppId: string | undefined) => ["sales-opportunity-events", oppId] as const,
      files: (oppId: string | undefined) => ["sales-opportunity-files", oppId] as const,
    },
    // Opportunity Stages
    opportunityStages: {
      all: ["sales-opportunity-stages"] as const,
    },
    // Offers
    offers: {
      all: ["sales-offers"] as const,
      byOpportunity: (oppId: string | undefined) => ["sales-offers", oppId] as const,
      detail: (id: string | undefined) => ["sales-offer", id] as const,
      lineItems: (offerId: string | undefined) => ["sales-offer-line-items", offerId] as const,
    },
    // Quote Templates (kind='template') and one-off quotes (kind='one_off')
    quoteTemplates: {
      all: ["sales-quote-templates"] as const,
      byKind: (kind: "template" | "one_off") => ["sales-quote-templates", kind] as const,
      byOpportunity: (oppId: string | undefined) => ["sales-quote-templates", "opportunity", oppId] as const,
      detail: (id: string | undefined) => ["sales-quote-template", id] as const,
    },
    // Assignment
    assignmentSettings: {
      all: ["sales-assignment-settings"] as const,
    },
    // Dashboard
    dashboard: {
      stats: (period?: string) => ["sales-dashboard-stats", period] as const,
    },
    // Commissions
    commissions: {
      all: ["sales-commissions"] as const,
      bySalesperson: (id: string | undefined) => ["sales-commissions", id] as const,
    },
    // Email
    email: {
      threads: (mailbox: string, userEmail?: string, labelId?: string) =>
        ["email-threads", mailbox, userEmail, labelId] as const,
      thread: (threadId?: string) => ["email-thread", threadId] as const,
      byOpportunity: (oppId?: string) => ["emails-by-opportunity", oppId] as const,
      search: (query: string) => ["email-search", query] as const,
      unreadCount: ["email-unread-count"] as const,
      labels: (userEmail?: string) => ["gmail-labels", userEmail] as const,
      signature: (employeeId?: string) => ["email-signature", employeeId] as const,
      templates: (employeeId?: string) => ["email-templates", employeeId] as const,
      companyTemplates: ["email-templates", "company"] as const,
      contactPhotos: (key: string) => ["contact-photos", key] as const,
      attachments: (emailId: string) => ["email-attachments", emailId] as const,
    },
    // Management
    management: {
      sellerPerformance: (dateFrom?: string, dateTo?: string) =>
        ["sales-seller-performance", dateFrom, dateTo] as const,
      lossReasons: (dateFrom?: string, dateTo?: string, salespersonId?: string) =>
        ["sales-loss-reasons", dateFrom, dateTo, salespersonId] as const,
      leadStageDistribution: (dateFrom?: string, dateTo?: string) =>
        ["sales-lead-stage-dist", dateFrom, dateTo] as const,
      oppStageDistribution: (dateFrom?: string, dateTo?: string) =>
        ["sales-opp-stage-dist", dateFrom, dateTo] as const,
      activityFeed: (limit?: number) => ["sales-activity-feed", limit] as const,
      sellerTargets: (salespersonId?: string) => ["sales-seller-targets", salespersonId] as const,
      pipelineOverview: (dateFrom?: string, dateTo?: string, salespersonId?: string) =>
        ["sales-pipeline-overview", dateFrom, dateTo, salespersonId] as const,
    },
    // Seller Ref Tracking
    refStats: (dateFrom?: string, dateTo?: string) =>
      ["sales-ref-stats", dateFrom, dateTo] as const,
    // Brand Order Rules
    brandOrderRules: {
      all: ["brand-order-rules"] as const,
    },
    // Offer Order Emails
    offerOrderEmails: {
      byOffer: (offerId: string | undefined) => ["offer-order-emails", offerId] as const,
    },
    // Device Orders
    deviceOrders: {
      all: ["device-orders"] as const,
      byOpportunity: (opportunityId: string | undefined) => ["device-orders", opportunityId] as const,
    },
  },
  // ─── Logistics ──────────────────────────────────────────────────────────────
  logistics: {
    bookingProductOrders: {
      all: ["booking-product-orders"] as const,
      list: (filters?: object) => ["booking-product-orders", filters] as const,
      byBooking: (bookingId: string | undefined) => ["booking-product-orders", "booking", bookingId] as const,
    },
    manufacturerOrders: {
      all: ["manufacturer-orders"] as const,
      list: (filters?: object) => ["manufacturer-orders", filters] as const,
      detail: (id: string | undefined) => ["manufacturer-order", id] as const,
    },
    autoReorder: {
      alerts: ["auto-reorder-alerts"] as const,
    },
  },

  // ─── Protocols ─────────────────────────────────────────────────────────────
  protocols: {
    templates: ["protocol-templates"] as const,
    byBooking: (bookingId: string | undefined) => ["work-protocol", bookingId] as const,
    photos: (protocolId: string | undefined) => ["protocol-photos", protocolId] as const,
  },

  // ─── Site Analytics ────────────────────────────────────────────────────────
  siteAnalytics: {
    dashboard: (from: string, to: string, conversionType: string) =>
      ["site-analytics", from, to, conversionType] as const,
  },

  // ─── SMS ────────────────────────────────────────────────────────────────────
  sms: {
    conversations: ["sms-conversations"] as const,
    thread: (phone: string) => ["sms-thread", phone] as const,
    unreadCount: ["sms-unread-count"] as const,
  },
} as const;
