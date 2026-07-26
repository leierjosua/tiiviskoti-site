export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addon_service_links: {
        Row: {
          addon_service_id: string
          created_at: string
          id: string
          service_id: string
          sort_order: number
        }
        Insert: {
          addon_service_id: string
          created_at?: string
          id?: string
          service_id: string
          sort_order?: number
        }
        Update: {
          addon_service_id?: string
          created_at?: string
          id?: string
          service_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "addon_service_links_addon_service_id_fkey"
            columns: ["addon_service_id"]
            isOneToOne: false
            referencedRelation: "addon_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_service_links_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_services: {
        Row: {
          active: boolean
          commission_alihankkija_cents: number | null
          commission_yrittaja_cents: number | null
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          material_cost_cents: number
          name: string
          price_cents: number
          sales_commission_cents: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          commission_alihankkija_cents?: number | null
          commission_yrittaja_cents?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          material_cost_cents?: number
          name: string
          price_cents?: number
          sales_commission_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          commission_alihankkija_cents?: number | null
          commission_yrittaja_cents?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          material_cost_cents?: number
          name?: string
          price_cents?: number
          sales_commission_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      booking_line_items: {
        Row: {
          addon_service_id: string | null
          booking_id: string
          created_at: string
          duration_minutes: number
          id: string
          line_type: Database["public"]["Enums"]["line_item_type"]
          material_cost_cents: number
          name: string
          notes: string | null
          price_cents: number
          product_id: string | null
          cost_cents: number
          quantity: number
          sort_order: number
        }
        Insert: {
          addon_service_id?: string | null
          booking_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          line_type?: Database["public"]["Enums"]["line_item_type"]
          material_cost_cents?: number
          name: string
          notes?: string | null
          price_cents?: number
          product_id?: string | null
          cost_cents?: number
          quantity?: number
          sort_order?: number
        }
        Update: {
          addon_service_id?: string | null
          booking_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          line_type?: Database["public"]["Enums"]["line_item_type"]
          material_cost_cents?: number
          name?: string
          notes?: string | null
          price_cents?: number
          product_id?: string | null
          cost_cents?: number
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_line_items_addon_service_id_fkey"
            columns: ["addon_service_id"]
            isOneToOne: false
            referencedRelation: "addon_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_log: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["booking_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["booking_status"] | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["booking_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["booking_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address: string | null
          booking_date: string
          booking_number: number | null
          calendar_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          contract_id: string | null
          contract_visit_id: string | null
          created_at: string
          customer_id: string
          customer_satisfaction: string | null
          discount_amount_cents: number
          discount_code_id: string | null
          employee_id: string | null
          finalized_at: string | null
          google_calendar_event_id: string | null
          id: string
          inside_notes: string | null
          lead_source: string | null
          notes: string | null
          page_url: string | null
          payment_status: string
          plan: string | null
          postal_code: string | null
          price_cents: number
          send_receipt: boolean
          service_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          time_slot: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_date: string
          booking_number?: number | null
          calendar_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contract_id?: string | null
          contract_visit_id?: string | null
          created_at?: string
          customer_id: string
          customer_satisfaction?: string | null
          discount_amount_cents?: number
          discount_code_id?: string | null
          employee_id?: string | null
          finalized_at?: string | null
          google_calendar_event_id?: string | null
          id?: string
          inside_notes?: string | null
          lead_source?: string | null
          notes?: string | null
          page_url?: string | null
          payment_status?: string
          plan?: string | null
          postal_code?: string | null
          price_cents: number
          send_receipt?: boolean
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          time_slot: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_date?: string
          booking_number?: number | null
          calendar_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          contract_id?: string | null
          contract_visit_id?: string | null
          created_at?: string
          customer_id?: string
          customer_satisfaction?: string | null
          discount_amount_cents?: number
          discount_code_id?: string | null
          employee_id?: string | null
          finalized_at?: string | null
          google_calendar_event_id?: string | null
          id?: string
          inside_notes?: string | null
          lead_source?: string | null
          notes?: string | null
          page_url?: string | null
          payment_status?: string
          plan?: string | null
          postal_code?: string | null
          price_cents?: number
          send_receipt?: boolean
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          time_slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contract_visit_id_fkey"
            columns: ["contract_visit_id"]
            isOneToOne: false
            referencedRelation: "contract_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_overrides: {
        Row: {
          calendar_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          override_type: string
          reason: string | null
          start_time: string | null
        }
        Insert: {
          calendar_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          override_type: string
          reason?: string | null
          start_time?: string | null
        }
        Update: {
          calendar_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          override_type?: string
          reason?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_overrides_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_service_areas: {
        Row: {
          calendar_id: string
          id: string
          service_area_id: string
        }
        Insert: {
          calendar_id: string
          id?: string
          service_area_id: string
        }
        Update: {
          calendar_id?: string
          id?: string
          service_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_service_areas_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_service_areas_service_area_id_fkey"
            columns: ["service_area_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_services: {
        Row: {
          calendar_id: string
          id: string
          service_id: string
        }
        Insert: {
          calendar_id: string
          id?: string
          service_id: string
        }
        Update: {
          calendar_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_services_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_weekly_slots: {
        Row: {
          calendar_id: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          calendar_id: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          calendar_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_weekly_slots_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          default_transition_minutes: number
          id: string
          optimization_weight_distance: number
          optimization_weight_route: number
          optimization_weight_workload: number
          updated_at: string | null
        }
        Insert: {
          default_transition_minutes?: number
          id?: string
          optimization_weight_distance?: number
          optimization_weight_route?: number
          optimization_weight_workload?: number
          updated_at?: string | null
        }
        Update: {
          default_transition_minutes?: number
          id?: string
          optimization_weight_distance?: number
          optimization_weight_route?: number
          optimization_weight_workload?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      contract_signature_tokens: {
        Row: {
          contract_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          expires_at: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_tokens_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_status_log: {
        Row: {
          changed_by: string | null
          contract_id: string
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["contract_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["contract_status"] | null
        }
        Insert: {
          changed_by?: string | null
          contract_id: string
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["contract_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["contract_status"] | null
        }
        Update: {
          changed_by?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["contract_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["contract_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_status_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          active: boolean
          auto_renew: boolean
          cancellation_notice_days: number
          contract_price_cents: number
          created_at: string
          description: string | null
          duration_months: number
          frequency: string
          id: string
          name: string
          regular_price_cents: number
          service_id: string
          slug: string
          sort_order: number
          terms_text: string
          updated_at: string
          visit_months: number[]
        }
        Insert: {
          active?: boolean
          auto_renew?: boolean
          cancellation_notice_days?: number
          contract_price_cents: number
          created_at?: string
          description?: string | null
          duration_months?: number
          frequency: string
          id?: string
          name: string
          regular_price_cents: number
          service_id: string
          slug: string
          sort_order?: number
          terms_text?: string
          updated_at?: string
          visit_months: number[]
        }
        Update: {
          active?: boolean
          auto_renew?: boolean
          cancellation_notice_days?: number
          contract_price_cents?: number
          created_at?: string
          description?: string | null
          duration_months?: number
          frequency?: string
          id?: string
          name?: string
          regular_price_cents?: number
          service_id?: string
          slug?: string
          sort_order?: number
          terms_text?: string
          updated_at?: string
          visit_months?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_visits: {
        Row: {
          booking_id: string | null
          completed_at: string | null
          contract_id: string
          created_at: string
          id: string
          notes: string | null
          scheduled_month: number
          scheduled_year: number
          updated_at: string
          visit_status: Database["public"]["Enums"]["visit_status"]
        }
        Insert: {
          booking_id?: string | null
          completed_at?: string | null
          contract_id: string
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_month: number
          scheduled_year: number
          updated_at?: string
          visit_status?: Database["public"]["Enums"]["visit_status"]
        }
        Update: {
          booking_id?: string | null
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_month?: number
          scheduled_year?: number
          updated_at?: string
          visit_status?: Database["public"]["Enums"]["visit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contract_visits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_visits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_renew: boolean
          cancellation_notice_days: number
          cancellation_reason: string | null
          cancelled_at: string | null
          contract_number: number
          contract_price_cents: number
          created_at: string
          created_by_employee_id: string | null
          customer_id: string
          end_date: string
          frequency: string
          id: string
          notes: string | null
          pdf_storage_path: string | null
          previous_contract_id: string | null
          renewal_discount_percent: number
          renewal_year: number
          renewed_contract_id: string | null
          service_address: string
          service_id: string
          service_postal_code: string
          signature_data: string | null
          signature_ip: string | null
          signature_method: string | null
          signed_at: string | null
          signed_by_name: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string
          updated_at: string
          visit_months: number[]
        }
        Insert: {
          auto_renew?: boolean
          cancellation_notice_days?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          contract_number?: number
          contract_price_cents: number
          created_at?: string
          created_by_employee_id?: string | null
          customer_id: string
          end_date: string
          frequency: string
          id?: string
          notes?: string | null
          pdf_storage_path?: string | null
          previous_contract_id?: string | null
          renewal_discount_percent?: number
          renewal_year?: number
          renewed_contract_id?: string | null
          service_address: string
          service_id: string
          service_postal_code: string
          signature_data?: string | null
          signature_ip?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          template_id: string
          updated_at?: string
          visit_months: number[]
        }
        Update: {
          auto_renew?: boolean
          cancellation_notice_days?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          contract_number?: number
          contract_price_cents?: number
          created_at?: string
          created_by_employee_id?: string | null
          customer_id?: string
          end_date?: string
          frequency?: string
          id?: string
          notes?: string | null
          pdf_storage_path?: string | null
          previous_contract_id?: string | null
          renewal_discount_percent?: number
          renewal_year?: number
          renewed_contract_id?: string | null
          service_address?: string
          service_id?: string
          service_postal_code?: string
          signature_data?: string | null
          signature_ip?: string | null
          signature_method?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string
          updated_at?: string
          visit_months?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_employee_id_fkey"
            columns: ["created_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_previous_contract_id_fkey"
            columns: ["previous_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_renewed_contract_id_fkey"
            columns: ["renewed_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_id: string | null
          company_name: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          active: boolean
          code: string
          commission_cents: number
          created_at: string
          discount_type: string
          discount_value: number
          employee_id: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          times_used: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          commission_cents?: number
          created_at?: string
          discount_type?: string
          discount_value?: number
          employee_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          commission_cents?: number
          created_at?: string
          discount_type?: string
          discount_value?: number
          employee_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_service_priorities: {
        Row: {
          employee_id: string
          id: string
          priority: string
          service_id: string
        }
        Insert: {
          employee_id: string
          id?: string
          priority?: string
          service_id: string
        }
        Update: {
          employee_id?: string
          id?: string
          priority?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_service_priorities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_service_priorities_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_services: {
        Row: {
          employee_id: string
          id: string
          service_id: string
        }
        Insert: {
          employee_id: string
          id?: string
          service_id: string
        }
        Update: {
          employee_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          email: string
          first_name: string
          google_calendar_id: string | null
          id: string
          last_name: string
          phone: string | null
          postal_code: string | null
          roles: string[]
          salary_cents: number | null
          tier: Database["public"]["Enums"]["installer_tier"] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          first_name: string
          google_calendar_id?: string | null
          id?: string
          last_name: string
          phone?: string | null
          postal_code?: string | null
          roles?: string[]
          salary_cents?: number | null
          tier?: Database["public"]["Enums"]["installer_tier"] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          first_name?: string
          google_calendar_id?: string | null
          id?: string
          last_name?: string
          phone?: string | null
          postal_code?: string | null
          roles?: string[]
          salary_cents?: number | null
          tier?: Database["public"]["Enums"]["installer_tier"] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          created_at: string
          email: string
          form_slug: string
          id: string
          message: string | null
          name: string
          notes: string | null
          page_url: string | null
          phone: string | null
          postal_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          form_slug?: string
          id?: string
          message?: string | null
          name: string
          notes?: string | null
          page_url?: string | null
          phone?: string | null
          postal_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          form_slug?: string
          id?: string
          message?: string | null
          name?: string
          notes?: string | null
          page_url?: string | null
          phone?: string | null
          postal_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_calendar_watches: {
        Row: {
          channel_id: string
          created_at: string
          employee_id: string
          expiration: string
          google_calendar_id: string
          id: string
          resource_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          employee_id: string
          expiration: string
          google_calendar_id: string
          id?: string
          resource_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          employee_id?: string
          expiration?: string
          google_calendar_id?: string
          id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_watches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      google_place_info: {
        Row: {
          id: string
          last_synced_at: string | null
          name: string | null
          place_id: string
          rating: number | null
          user_ratings_total: number | null
        }
        Insert: {
          id?: string
          last_synced_at?: string | null
          name?: string | null
          place_id: string
          rating?: number | null
          user_ratings_total?: number | null
        }
        Update: {
          id?: string
          last_synced_at?: string | null
          name?: string | null
          place_id?: string
          rating?: number | null
          user_ratings_total?: number | null
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          author_name: string
          author_url: string | null
          created_at: string | null
          id: string
          language: string | null
          profile_photo_url: string | null
          rating: number
          relative_time_description: string | null
          review_text: string | null
          review_time: number
          updated_at: string | null
        }
        Insert: {
          author_name: string
          author_url?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          profile_photo_url?: string | null
          rating: number
          relative_time_description?: string | null
          review_text?: string | null
          review_time: number
          updated_at?: string | null
        }
        Update: {
          author_name?: string
          author_url?: string | null
          created_at?: string | null
          id?: string
          language?: string | null
          profile_photo_url?: string | null
          rating?: number
          relative_time_description?: string | null
          review_text?: string | null
          review_time?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      installer_calendars: {
        Row: {
          active: boolean
          created_at: string
          employee_id: string
          id: string
          name: string
          service_priorities: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id: string
          id?: string
          name: string
          service_priorities?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          name?: string
          service_priorities?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installer_calendars_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          spec_schema: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          spec_schema?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          spec_schema?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand: string | null
          category_id: string
          cost_cents: number
          created_at: string
          description: string | null
          id: string
          images: string[]
          model: string | null
          name: string
          price_cents: number
          sku: string | null
          sort_order: number
          specs: Json
          stock_low_threshold: number | null
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand?: string | null
          category_id: string
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          model?: string | null
          name: string
          price_cents?: number
          sku?: string | null
          sort_order?: number
          specs?: Json
          stock_low_threshold?: number | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string | null
          category_id?: string
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          model?: string | null
          name?: string
          price_cents?: number
          sku?: string | null
          sort_order?: number
          specs?: Json
          stock_low_threshold?: number | null
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_areas: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          employee_id: string | null
          id: string
          name: string
          postal_codes: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          employee_id?: string | null
          id?: string
          name: string
          postal_codes?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          postal_codes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_areas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          base_price_cents: number
          commission_alihankkija_cents: number
          commission_yrittaja_cents: number
          created_at: string
          description: string | null
          duration_minutes: number
          extra_duration_per_unit_minutes: number | null
          id: string
          material_cost_cents: number
          max_advance_days: number | null
          min_scheduling_notice_hours: number
          name: string
          sales_commission_cents: number
          transition_minutes: number | null
          updated_at: string
          volume_pricing: Json
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          commission_alihankkija_cents?: number
          commission_yrittaja_cents?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          extra_duration_per_unit_minutes?: number | null
          id?: string
          material_cost_cents?: number
          max_advance_days?: number | null
          min_scheduling_notice_hours?: number
          name: string
          sales_commission_cents?: number
          transition_minutes?: number | null
          updated_at?: string
          volume_pricing?: Json
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          commission_alihankkija_cents?: number
          commission_yrittaja_cents?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          extra_duration_per_unit_minutes?: number | null
          id?: string
          material_cost_cents?: number
          max_advance_days?: number | null
          min_scheduling_notice_hours?: number
          name?: string
          sales_commission_cents?: number
          transition_minutes?: number | null
          updated_at?: string
          volume_pricing?: Json
        }
        Relationships: []
      }
      temp_reservations: {
        Row: {
          booking_date: string
          calendar_id: string
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          service_id: string
          session_token: string
          time_slot: string
        }
        Insert: {
          booking_date: string
          calendar_id: string
          created_at?: string
          employee_id: string
          expires_at: string
          id?: string
          service_id: string
          session_token: string
          time_slot: string
        }
        Update: {
          booking_date?: string
          calendar_id?: string
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          service_id?: string
          session_token?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "temp_reservations_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "installer_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_reservations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temp_reservations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_temp_reservations: { Args: never; Returns: undefined }
      current_employee_id: { Args: never; Returns: string }
      increment_discount_usage: {
        Args: { code_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      booking_status: "pending" | "confirmed" | "completed" | "cancelled"
      contract_status:
        | "draft"
        | "pending_signature"
        | "active"
        | "expiring"
        | "expired"
        | "cancelled"
        | "renewed"
      installer_tier: "yrittaja" | "alihankkija" | "palkallinen"
      line_item_type: "addon_service" | "product" | "custom"
      visit_status:
        | "scheduled"
        | "booking_created"
        | "completed"
        | "skipped"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      contract_status: [
        "draft",
        "pending_signature",
        "active",
        "expiring",
        "expired",
        "cancelled",
        "renewed",
      ],
      installer_tier: ["yrittaja", "alihankkija", "palkallinen"],
      line_item_type: ["addon_service", "product", "custom"],
      visit_status: [
        "scheduled",
        "booking_created",
        "completed",
        "skipped",
        "cancelled",
      ],
    },
  },
} as const
