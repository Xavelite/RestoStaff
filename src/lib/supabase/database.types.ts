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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absence_events: {
        Row: {
          absence_id: string
          actor_employee_id: string | null
          actor_profile_id: string | null
          actor_role: string
          comment: string | null
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
          id: string
          metadata: Json
          restaurant_id: string
          to_status:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
        }
        Insert: {
          absence_id: string
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role: string
          comment?: string | null
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
          id?: string
          metadata?: Json
          restaurant_id: string
          to_status?:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
        }
        Update: {
          absence_id?: string
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role?: string
          comment?: string | null
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
          id?: string
          metadata?: Json
          restaurant_id?: string
          to_status?:
            | Database["public"]["Enums"]["operational_request_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "absence_events_absence_fk"
            columns: ["restaurant_id", "absence_id"]
            isOneToOne: false
            referencedRelation: "absences"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "absence_events_actor_employee_fk"
            columns: ["restaurant_id", "actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "absence_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      absence_types: {
        Row: {
          active: boolean
          affects_payroll: boolean
          affects_planning: boolean
          category: string
          code: string
          color: string
          created_at: string
          id: string
          metadata: Json
          name: string
          paid_policy: string
          payroll_code: string | null
          requires_approval: boolean
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          affects_payroll?: boolean
          affects_planning?: boolean
          category: string
          code: string
          color?: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          paid_policy?: string
          payroll_code?: string | null
          requires_approval?: boolean
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          affects_payroll?: boolean
          affects_planning?: boolean
          category?: string
          code?: string
          color?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          paid_policy?: string
          payroll_code?: string | null
          requires_approval?: boolean
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      absences: {
        Row: {
          absence_type_id: string
          approved_at: string | null
          approved_by_profile_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_profile_id: string | null
          cancelled_by_role: string | null
          created_at: string
          duration_days: number | null
          duration_hours: number | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          manager_comment: string | null
          metadata: Json
          payroll_export_id: string | null
          payroll_export_status: string
          rejected_at: string | null
          rejected_by_profile_id: string | null
          requested_by_profile_id: string | null
          restaurant_id: string
          service_key: string | null
          start_date: string
          status: Database["public"]["Enums"]["operational_request_status"]
          updated_at: string
        }
        Insert: {
          absence_type_id: string
          approved_at?: string | null
          approved_by_profile_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          cancelled_by_role?: string | null
          created_at?: string
          duration_days?: number | null
          duration_hours?: number | null
          employee_comment?: string | null
          employee_id: string
          end_date: string
          id?: string
          manager_comment?: string | null
          metadata?: Json
          payroll_export_id?: string | null
          payroll_export_status?: string
          rejected_at?: string | null
          rejected_by_profile_id?: string | null
          requested_by_profile_id?: string | null
          restaurant_id: string
          service_key?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["operational_request_status"]
          updated_at?: string
        }
        Update: {
          absence_type_id?: string
          approved_at?: string | null
          approved_by_profile_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          cancelled_by_role?: string | null
          created_at?: string
          duration_days?: number | null
          duration_hours?: number | null
          employee_comment?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          manager_comment?: string | null
          metadata?: Json
          payroll_export_id?: string | null
          payroll_export_status?: string
          rejected_at?: string | null
          rejected_by_profile_id?: string | null
          requested_by_profile_id?: string | null
          restaurant_id?: string
          service_key?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["operational_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_cancelled_by_profile_id_fkey"
            columns: ["cancelled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "absences_rejected_by_profile_id_fkey"
            columns: ["rejected_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "absences_type_fk"
            columns: ["restaurant_id", "absence_type_id"]
            isOneToOne: false
            referencedRelation: "absence_types"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      area_service_defaults: {
        Row: {
          area_id: string
          created_at: string
          end_time: string | null
          id: string
          restaurant_id: string
          service_key: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          area_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          restaurant_id: string
          service_key: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          restaurant_id?: string
          service_key?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_service_defaults_area_fk"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "area_service_defaults_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_service_defaults_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      badge_verification_challenges: {
        Row: {
          actor_profile_id: string | null
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          restaurant_id: string
          station_id: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          created_at?: string
          employee_id: string
          expires_at: string
          id?: string
          restaurant_id: string
          station_id?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          restaurant_id?: string
          station_id?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "badge_verification_challenges_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "badge_verification_challenges_employee_fkey"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "badge_verification_challenges_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "restaurant_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_types: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          id: string
          metadata: Json
          name: string
          payroll_code: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          code: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          payroll_code?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          payroll_code?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_types_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_requirements: {
        Row: {
          active: boolean
          area_id: string
          coverage_scope: string
          created_at: string
          id: string
          job_function_id: string
          required_count: number
          restaurant_id: string
          service_key: string
          sort_order: number
          updated_at: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          area_id: string
          coverage_scope?: string
          created_at?: string
          id?: string
          job_function_id: string
          required_count?: number
          restaurant_id: string
          service_key: string
          sort_order?: number
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          area_id?: string
          coverage_scope?: string
          created_at?: string
          id?: string
          job_function_id?: string
          required_count?: number
          restaurant_id?: string
          service_key?: string
          sort_order?: number
          updated_at?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coverage_requirements_area_fk"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "coverage_requirements_job_function_fk"
            columns: ["restaurant_id", "job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "coverage_requirements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coverage_requirements_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      cp302_reference_functions: {
        Row: {
          category: number
          code: string
          created_at: string
          default_worker_status:
            | Database["public"]["Enums"]["worker_status"]
            | null
          department: string | null
          id: string
          legal_source_id: string
          name_en: string | null
          name_fr: string
          name_nl: string
          status: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          category: number
          code: string
          created_at?: string
          default_worker_status?:
            | Database["public"]["Enums"]["worker_status"]
            | null
          department?: string | null
          id?: string
          legal_source_id: string
          name_en?: string | null
          name_fr: string
          name_nl: string
          status?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          category?: number
          code?: string
          created_at?: string
          default_worker_status?:
            | Database["public"]["Enums"]["worker_status"]
            | null
          department?: string | null
          id?: string
          legal_source_id?: string
          name_en?: string | null
          name_fr?: string
          name_nl?: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cp302_reference_functions_legal_source_id_fkey"
            columns: ["legal_source_id"]
            isOneToOne: false
            referencedRelation: "payroll_legal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      cp302_salary_scales: {
        Row: {
          category: number
          created_at: string
          function_years: number
          hourly_rate: number
          id: string
          legal_source_id: string
          monthly_rate_cents: number
          rule_set_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          category: number
          created_at?: string
          function_years: number
          hourly_rate: number
          id?: string
          legal_source_id: string
          monthly_rate_cents: number
          rule_set_id: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          category?: number
          created_at?: string
          function_years?: number
          hourly_rate?: number
          id?: string
          legal_source_id?: string
          monthly_rate_cents?: number
          rule_set_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cp302_salary_scales_legal_source_id_fkey"
            columns: ["legal_source_id"]
            isOneToOne: false
            referencedRelation: "payroll_legal_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp302_salary_scales_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access: {
        Row: {
          access_status: string
          badge_enabled: boolean
          created_at: string
          employee_id: string
          id: string
          profile_id: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          access_status?: string
          badge_enabled?: boolean
          created_at?: string
          employee_id: string
          id?: string
          profile_id?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          access_status?: string
          badge_enabled?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          profile_id?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_access_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_availability_slots: {
        Row: {
          availability_state: Database["public"]["Enums"]["service_availability_state"]
          created_at: string
          employee_id: string
          note: string | null
          restaurant_id: string
          service_key: string
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          availability_state: Database["public"]["Enums"]["service_availability_state"]
          created_at?: string
          employee_id: string
          note?: string | null
          restaurant_id: string
          service_key: string
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          availability_state?: Database["public"]["Enums"]["service_availability_state"]
          created_at?: string
          employee_id?: string
          note?: string | null
          restaurant_id?: string
          service_key?: string
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_slots_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_availability_slots_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_slots_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "employee_availability_slots_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      employee_availability_submissions: {
        Row: {
          created_at: string
          employee_id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["availability_submission_status"]
          submitted_at: string | null
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["availability_submission_status"]
          submitted_at?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["availability_submission_status"]
          submitted_at?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_submissions_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_availability_submissions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_availability_submissions_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      employee_contact_details: {
        Row: {
          address_line1: string | null
          city: string | null
          created_at: string
          email: string | null
          emergency_name: string | null
          emergency_phone: string | null
          emergency_relation: string | null
          employee_id: string
          mobile_phone: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          emergency_name?: string | null
          emergency_phone?: string | null
          emergency_relation?: string | null
          employee_id: string
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          emergency_name?: string | null
          emergency_phone?: string | null
          emergency_relation?: string | null
          employee_id?: string
          mobile_phone?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contact_details_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_contracts: {
        Row: {
          active: boolean
          annual_leave_entitlement_days: number
          contract_days: number
          contract_end: string | null
          contract_start: string | null
          contract_type_id: string | null
          created_at: string
          employee_id: string
          id: string
          is_current: boolean
          restaurant_id: string
          updated_at: string
          weekly_contract_hours: number
          work_regime: Database["public"]["Enums"]["work_regime"]
          worker_status: Database["public"]["Enums"]["worker_status"] | null
        }
        Insert: {
          active?: boolean
          annual_leave_entitlement_days?: number
          contract_days?: number
          contract_end?: string | null
          contract_start?: string | null
          contract_type_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_current?: boolean
          restaurant_id: string
          updated_at?: string
          weekly_contract_hours?: number
          work_regime?: Database["public"]["Enums"]["work_regime"]
          worker_status?: Database["public"]["Enums"]["worker_status"] | null
        }
        Update: {
          active?: boolean
          annual_leave_entitlement_days?: number
          contract_days?: number
          contract_end?: string | null
          contract_start?: string | null
          contract_type_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_current?: boolean
          restaurant_id?: string
          updated_at?: string
          weekly_contract_hours?: number
          work_regime?: Database["public"]["Enums"]["work_regime"]
          worker_status?: Database["public"]["Enums"]["worker_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_contract_type_fk"
            columns: ["restaurant_id", "contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_contracts_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_contracts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_employment_term_validations: {
        Row: {
          blockers: Json
          created_at: string
          employee_id: string
          employment_terms_id: string
          id: string
          restaurant_id: string
          result_status: string
          validated_by_profile_id: string
        }
        Insert: {
          blockers?: Json
          created_at?: string
          employee_id: string
          employment_terms_id: string
          id?: string
          restaurant_id: string
          result_status: string
          validated_by_profile_id: string
        }
        Update: {
          blockers?: Json
          created_at?: string
          employee_id?: string
          employment_terms_id?: string
          id?: string
          restaurant_id?: string
          result_status?: string
          validated_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_term_validatio_validated_by_profile_id_fkey"
            columns: ["validated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_term_validations_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_employment_term_validations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_term_validations_terms_fk"
            columns: ["restaurant_id", "employment_terms_id"]
            isOneToOne: false
            referencedRelation: "employee_employment_terms"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_employment_terms: {
        Row: {
          active: boolean
          annual_leave_entitlement_days: number
          company_seniority_date: string | null
          contract_duration_kind: Database["public"]["Enums"]["contract_duration_kind"]
          contract_id: string | null
          contract_weekly_minutes: number
          contractual_hourly_rate: number | null
          contractual_monthly_salary_cents: number | null
          cp302_category: number | null
          cp302_reference_function_code: string | null
          created_at: string
          created_by_profile_id: string | null
          employee_id: string
          employment_regime: Database["public"]["Enums"]["employment_payroll_regime"]
          employment_type_code: string | null
          employment_volume: Database["public"]["Enums"]["employment_volume"]
          function_seniority_date: string | null
          id: string
          legal_schedule_type: Database["public"]["Enums"]["legal_schedule_type"]
          reference_full_time_weekly_minutes: number
          reference_period_weeks: number
          restaurant_id: string
          salary_basis: Database["public"]["Enums"]["salary_basis"] | null
          scheduling_policy: Database["public"]["Enums"]["work_regime"]
          service_percentage_basis_points: number | null
          source_notes: string | null
          source_status: string
          superseded_at: string | null
          supersedes_id: string | null
          valid_from: string
          valid_to: string | null
          validation_blockers: Json
          version_number: number
          weekly_hours_regime: Database["public"]["Enums"]["weekly_hours_regime"]
          worker_status: Database["public"]["Enums"]["worker_status"] | null
          worker_status_override_reason: string | null
          working_days_per_week: number | null
        }
        Insert: {
          active?: boolean
          annual_leave_entitlement_days?: number
          company_seniority_date?: string | null
          contract_duration_kind: Database["public"]["Enums"]["contract_duration_kind"]
          contract_id?: string | null
          contract_weekly_minutes: number
          contractual_hourly_rate?: number | null
          contractual_monthly_salary_cents?: number | null
          cp302_category?: number | null
          cp302_reference_function_code?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          employee_id: string
          employment_regime: Database["public"]["Enums"]["employment_payroll_regime"]
          employment_type_code?: string | null
          employment_volume: Database["public"]["Enums"]["employment_volume"]
          function_seniority_date?: string | null
          id?: string
          legal_schedule_type: Database["public"]["Enums"]["legal_schedule_type"]
          reference_full_time_weekly_minutes?: number
          reference_period_weeks?: number
          restaurant_id: string
          salary_basis?: Database["public"]["Enums"]["salary_basis"] | null
          scheduling_policy: Database["public"]["Enums"]["work_regime"]
          service_percentage_basis_points?: number | null
          source_notes?: string | null
          source_status?: string
          superseded_at?: string | null
          supersedes_id?: string | null
          valid_from: string
          valid_to?: string | null
          validation_blockers?: Json
          version_number: number
          weekly_hours_regime: Database["public"]["Enums"]["weekly_hours_regime"]
          worker_status?: Database["public"]["Enums"]["worker_status"] | null
          worker_status_override_reason?: string | null
          working_days_per_week?: number | null
        }
        Update: {
          active?: boolean
          annual_leave_entitlement_days?: number
          company_seniority_date?: string | null
          contract_duration_kind?: Database["public"]["Enums"]["contract_duration_kind"]
          contract_id?: string | null
          contract_weekly_minutes?: number
          contractual_hourly_rate?: number | null
          contractual_monthly_salary_cents?: number | null
          cp302_category?: number | null
          cp302_reference_function_code?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          employee_id?: string
          employment_regime?: Database["public"]["Enums"]["employment_payroll_regime"]
          employment_type_code?: string | null
          employment_volume?: Database["public"]["Enums"]["employment_volume"]
          function_seniority_date?: string | null
          id?: string
          legal_schedule_type?: Database["public"]["Enums"]["legal_schedule_type"]
          reference_full_time_weekly_minutes?: number
          reference_period_weeks?: number
          restaurant_id?: string
          salary_basis?: Database["public"]["Enums"]["salary_basis"] | null
          scheduling_policy?: Database["public"]["Enums"]["work_regime"]
          service_percentage_basis_points?: number | null
          source_notes?: string | null
          source_status?: string
          superseded_at?: string | null
          supersedes_id?: string | null
          valid_from?: string
          valid_to?: string | null
          validation_blockers?: Json
          version_number?: number
          weekly_hours_regime?: Database["public"]["Enums"]["weekly_hours_regime"]
          worker_status?: Database["public"]["Enums"]["worker_status"] | null
          worker_status_override_reason?: string | null
          working_days_per_week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_terms_actor_fk"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_terms_contract_employee_fk"
            columns: ["restaurant_id", "employee_id", "contract_id"]
            isOneToOne: false
            referencedRelation: "employee_contracts"
            referencedColumns: ["restaurant_id", "employee_id", "id"]
          },
          {
            foreignKeyName: "employee_employment_terms_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_employment_terms_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_terms_supersedes_fk"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "employee_employment_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          email: string
          employee_id: string
          expires_at: string
          id: string
          invited_by_profile_id: string | null
          invited_role: string
          restaurant_id: string
          revoked_at: string | null
          revoked_by_profile_id: string | null
          revoked_reason: string | null
          sent_at: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email: string
          employee_id: string
          expires_at: string
          id?: string
          invited_by_profile_id?: string | null
          invited_role: string
          restaurant_id: string
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          revoked_reason?: string | null
          sent_at?: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email?: string
          employee_id?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string | null
          invited_role?: string
          restaurant_id?: string
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          revoked_reason?: string | null
          sent_at?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_revoked_by_profile_id_fkey"
            columns: ["revoked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_job_functions: {
        Row: {
          active: boolean
          created_at: string
          default_area_id: string | null
          employee_id: string
          is_primary: boolean
          job_function_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_area_id?: string | null
          employee_id: string
          is_primary?: boolean
          job_function_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_area_id?: string | null
          employee_id?: string
          is_primary?: boolean
          job_function_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_job_functions_default_area_fk"
            columns: ["restaurant_id", "default_area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_job_functions_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_job_functions_job_function_fk"
            columns: ["restaurant_id", "job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "employee_job_functions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_legal_profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          employee_id: string
          language: string | null
          metadata: Json
          national_registry_number: string | null
          nationality: string | null
          restaurant_id: string
          sex: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          employee_id: string
          language?: string | null
          metadata?: Json
          national_registry_number?: string | null
          nationality?: string | null
          restaurant_id: string
          sex?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          employee_id?: string
          language?: string | null
          metadata?: Json
          national_registry_number?: string | null
          nationality?: string | null
          restaurant_id?: string
          sex?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_legal_profiles_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_payroll_adjustments: {
        Row: {
          amount_cents: number
          component_code: string
          created_at: string
          created_by_profile_id: string
          effective_date: string
          employee_id: string
          employer_cost_impact_cents: number
          evidence_reference: string | null
          id: string
          net_impact_cents: number
          reason: string
          restaurant_id: string
          social_security_base_cents: number
          taxable_amount_cents: number
        }
        Insert: {
          amount_cents: number
          component_code: string
          created_at?: string
          created_by_profile_id: string
          effective_date: string
          employee_id: string
          employer_cost_impact_cents?: number
          evidence_reference?: string | null
          id?: string
          net_impact_cents?: number
          reason: string
          restaurant_id: string
          social_security_base_cents?: number
          taxable_amount_cents?: number
        }
        Update: {
          amount_cents?: number
          component_code?: string
          created_at?: string
          created_by_profile_id?: string
          effective_date?: string
          employee_id?: string
          employer_cost_impact_cents?: number
          evidence_reference?: string | null
          id?: string
          net_impact_cents?: number
          reason?: string
          restaurant_id?: string
          social_security_base_cents?: number
          taxable_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_adjustments_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "payroll_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "employee_payroll_adjustments_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_adjustments_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_payroll_benefits: {
        Row: {
          active: boolean
          amount_cents: number | null
          component_code: string
          created_at: string
          created_by_profile_id: string
          employee_id: string
          employee_share_cents: number | null
          employer_share_cents: number | null
          evidence_status: string
          id: string
          notes: string | null
          quantity: number | null
          restaurant_id: string
          social_security: boolean
          taxable: boolean
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          amount_cents?: number | null
          component_code: string
          created_at?: string
          created_by_profile_id: string
          employee_id: string
          employee_share_cents?: number | null
          employer_share_cents?: number | null
          evidence_status?: string
          id?: string
          notes?: string | null
          quantity?: number | null
          restaurant_id: string
          social_security: boolean
          taxable: boolean
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          amount_cents?: number | null
          component_code?: string
          created_at?: string
          created_by_profile_id?: string
          employee_id?: string
          employee_share_cents?: number | null
          employer_share_cents?: number | null
          evidence_status?: string
          id?: string
          notes?: string | null
          quantity?: number | null
          restaurant_id?: string
          social_security?: boolean
          taxable?: boolean
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_benefits_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "payroll_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "employee_payroll_benefits_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_benefits_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_payroll_profiles: {
        Row: {
          bic: string | null
          company_cost_formula: string | null
          created_at: string
          employee_id: string
          estimated_hourly_cost: number
          external_employee_id: string | null
          hourly_wage_rate: number
          iban: string | null
          payroll_employee_id: string | null
          payroll_notes: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          bic?: string | null
          company_cost_formula?: string | null
          created_at?: string
          employee_id: string
          estimated_hourly_cost?: number
          external_employee_id?: string | null
          hourly_wage_rate?: number
          iban?: string | null
          payroll_employee_id?: string | null
          payroll_notes?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          bic?: string | null
          company_cost_formula?: string | null
          created_at?: string
          employee_id?: string
          estimated_hourly_cost?: number
          external_employee_id?: string | null
          hourly_wage_rate?: number
          iban?: string | null
          payroll_employee_id?: string | null
          payroll_notes?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_profiles_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_pin_credentials: {
        Row: {
          created_at: string
          employee_id: string
          failed_attempts: number
          last_rotated_at: string | null
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string
          pin_status: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          failed_attempts?: number
          last_rotated_at?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash: string
          pin_status?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          failed_attempts?: number
          last_rotated_at?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          pin_status?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pin_credentials_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_regime_evidence: {
        Row: {
          created_at: string
          created_by_profile_id: string
          employee_id: string
          evidence_type: string
          id: string
          metadata: Json
          quota_minutes: number | null
          reference: string | null
          restaurant_id: string
          status: string
          used_minutes: number
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          employee_id: string
          evidence_type: string
          id?: string
          metadata?: Json
          quota_minutes?: number | null
          reference?: string | null
          restaurant_id: string
          status: string
          used_minutes?: number
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          employee_id?: string
          evidence_type?: string
          id?: string
          metadata?: Json
          quota_minutes?: number | null
          reference?: string | null
          restaurant_id?: string
          status?: string
          used_minutes?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_regime_evidence_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_regime_evidence_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employee_tax_profiles: {
        Row: {
          active: boolean
          civil_status: string | null
          created_at: string
          created_by_profile_id: string
          dependent_children: number
          disability_status: string | null
          employee_id: string
          evidence_status: string
          id: string
          manual_withholding_basis_points: number | null
          other_dependants: number
          partner_income_category: string | null
          resident_status: string | null
          restaurant_id: string
          valid_from: string
          valid_to: string | null
          version_number: number
          withholding_treatment: string | null
        }
        Insert: {
          active?: boolean
          civil_status?: string | null
          created_at?: string
          created_by_profile_id: string
          dependent_children?: number
          disability_status?: string | null
          employee_id: string
          evidence_status?: string
          id?: string
          manual_withholding_basis_points?: number | null
          other_dependants?: number
          partner_income_category?: string | null
          resident_status?: string | null
          restaurant_id: string
          valid_from: string
          valid_to?: string | null
          version_number: number
          withholding_treatment?: string | null
        }
        Update: {
          active?: boolean
          civil_status?: string | null
          created_at?: string
          created_by_profile_id?: string
          dependent_children?: number
          disability_status?: string | null
          employee_id?: string
          evidence_status?: string
          id?: string
          manual_withholding_basis_points?: number | null
          other_dependants?: number
          partner_income_category?: string | null
          resident_status?: string | null
          restaurant_id?: string
          valid_from?: string
          valid_to?: string | null
          version_number?: number
          withholding_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_tax_profiles_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tax_profiles_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          last_name: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_function_areas: {
        Row: {
          active: boolean
          area_id: string
          created_at: string
          is_primary: boolean
          job_function_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          area_id: string
          created_at?: string
          is_primary?: boolean
          job_function_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          area_id?: string
          created_at?: string
          is_primary?: boolean
          job_function_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_function_areas_area_fk"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "job_function_areas_job_function_fk"
            columns: ["restaurant_id", "job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      job_functions: {
        Row: {
          active: boolean
          catalogue_key: string | null
          code: string
          created_at: string
          estimated_hourly_cost: number
          icon_key: string | null
          id: string
          metadata: Json
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalogue_key?: string | null
          code: string
          created_at?: string
          estimated_hourly_cost?: number
          icon_key?: string | null
          id?: string
          metadata?: Json
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalogue_key?: string | null
          code?: string
          created_at?: string
          estimated_hourly_cost?: number
          icon_key?: string | null
          id?: string
          metadata?: Json
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_functions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          in_app_enabled: boolean
          notification_type: string
          profile_id: string
          push_enabled: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          in_app_enabled: boolean
          notification_type: string
          profile_id: string
          push_enabled?: boolean
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          in_app_enabled?: boolean
          notification_type?: string
          profile_id?: string
          push_enabled?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_membership_fk"
            columns: ["restaurant_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "restaurant_memberships"
            referencedColumns: ["restaurant_id", "profile_id"]
          },
          {
            foreignKeyName: "notification_preferences_notification_type_fkey"
            columns: ["notification_type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
        ]
      }
      notification_receipts: {
        Row: {
          created_at: string
          dismissed_at: string | null
          id: string
          notification_key: string
          notification_type: string
          profile_id: string
          read_at: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          notification_key: string
          notification_type: string
          profile_id: string
          read_at?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          id?: string
          notification_key?: string
          notification_type?: string
          profile_id?: string
          read_at?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_receipts_membership_fk"
            columns: ["restaurant_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "restaurant_memberships"
            referencedColumns: ["restaurant_id", "profile_id"]
          },
          {
            foreignKeyName: "notification_receipts_notification_type_fkey"
            columns: ["notification_type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
        ]
      }
      notification_types: {
        Row: {
          active: boolean
          audience: string
          code: string
          created_at: string
          default_action: string
          default_in_app_enabled: boolean
          default_push_enabled: boolean
          default_target_module: string
          description: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience: string
          code: string
          created_at?: string
          default_action?: string
          default_in_app_enabled?: boolean
          default_push_enabled?: boolean
          default_target_module: string
          description?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          code?: string
          created_at?: string
          default_action?: string
          default_in_app_enabled?: boolean
          default_push_enabled?: boolean
          default_target_module?: string
          description?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          is_open: boolean
          opens_at: string | null
          restaurant_id: string
          service_key: string
          updated_at: string
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          opens_at?: string | null
          restaurant_id: string
          service_key: string
          updated_at?: string
          weekday: number
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          opens_at?: string | null
          restaurant_id?: string
          service_key?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "opening_hours_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_hours_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      operational_message_recipients: {
        Row: {
          acknowledged_at: string | null
          employee_id: string
          message_id: string
          read_at: string | null
          restaurant_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          employee_id: string
          message_id: string
          read_at?: string | null
          restaurant_id: string
        }
        Update: {
          acknowledged_at?: string | null
          employee_id?: string
          message_id?: string
          read_at?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_message_recipients_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "operational_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "operational_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_message_recipients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_messages: {
        Row: {
          acknowledgement_required: boolean
          body: string
          created_at: string
          expires_at: string | null
          id: string
          priority: string
          restaurant_id: string
          sender_profile_id: string | null
        }
        Insert: {
          acknowledgement_required?: boolean
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          priority?: string
          restaurant_id: string
          sender_profile_id?: string | null
        }
        Update: {
          acknowledgement_required?: boolean
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          priority?: string
          restaurant_id?: string
          sender_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_messages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_onboarding_drafts: {
        Row: {
          auth_user_id: string
          created_at: string
          draft: Json
          step: number
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          draft?: Json
          step?: number
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          draft?: Json
          step?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_component_lines: {
        Row: {
          component_code: string
          contribution_treatment: string | null
          created_at: string
          employee_contribution_cents: number
          employee_id: string
          employer_contribution_cents: number
          employer_cost_impact_cents: number
          employment_terms_id: string | null
          explanation: string
          gross_amount_cents: number
          id: string
          multiplier_basis_points: number | null
          net_impact_cents: number
          payroll_employee_result_id: string | null
          payroll_run_id: string
          professional_withholding_cents: number
          quantity: number
          rate: number | null
          restaurant_id: string
          rounding_method: string
          rule_id: string | null
          social_security_base_cents: number
          source_hash: string
          taxable_amount_cents: number
          unit: string
        }
        Insert: {
          component_code: string
          contribution_treatment?: string | null
          created_at?: string
          employee_contribution_cents?: number
          employee_id: string
          employer_contribution_cents?: number
          employer_cost_impact_cents?: number
          employment_terms_id?: string | null
          explanation: string
          gross_amount_cents?: number
          id?: string
          multiplier_basis_points?: number | null
          net_impact_cents?: number
          payroll_employee_result_id?: string | null
          payroll_run_id: string
          professional_withholding_cents?: number
          quantity: number
          rate?: number | null
          restaurant_id: string
          rounding_method?: string
          rule_id?: string | null
          social_security_base_cents?: number
          source_hash: string
          taxable_amount_cents?: number
          unit: string
        }
        Update: {
          component_code?: string
          contribution_treatment?: string | null
          created_at?: string
          employee_contribution_cents?: number
          employee_id?: string
          employer_contribution_cents?: number
          employer_cost_impact_cents?: number
          employment_terms_id?: string | null
          explanation?: string
          gross_amount_cents?: number
          id?: string
          multiplier_basis_points?: number | null
          net_impact_cents?: number
          payroll_employee_result_id?: string | null
          payroll_run_id?: string
          professional_withholding_cents?: number
          quantity?: number
          rate?: number | null
          restaurant_id?: string
          rounding_method?: string
          rule_id?: string | null
          social_security_base_cents?: number
          source_hash?: string
          taxable_amount_cents?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_component_lines_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "payroll_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_component_lines_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_component_lines_employment_terms_id_fkey"
            columns: ["employment_terms_id"]
            isOneToOne: false
            referencedRelation: "employee_employment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_component_lines_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_component_lines_result_fk"
            columns: ["payroll_employee_result_id"]
            isOneToOne: false
            referencedRelation: "payroll_employee_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_component_lines_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "payroll_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_component_sources: {
        Row: {
          created_at: string
          id: string
          payroll_component_line_id: string
          source_date: string | null
          source_id: string
          source_revision: number | null
          source_snapshot: Json
          source_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payroll_component_line_id: string
          source_date?: string | null
          source_id: string
          source_revision?: number | null
          source_snapshot: Json
          source_type: string
        }
        Update: {
          created_at?: string
          id?: string
          payroll_component_line_id?: string
          source_date?: string | null
          source_id?: string
          source_revision?: number | null
          source_snapshot?: Json
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_component_sources_payroll_component_line_id_fkey"
            columns: ["payroll_component_line_id"]
            isOneToOne: false
            referencedRelation: "payroll_component_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_components: {
        Row: {
          code: string
          created_at: string
          employer_cost_default: boolean
          label: string
          section: string
          social_security_default: boolean
          taxable_default: boolean
          unit: string
        }
        Insert: {
          code: string
          created_at?: string
          employer_cost_default: boolean
          label: string
          section: string
          social_security_default: boolean
          taxable_default: boolean
          unit: string
        }
        Update: {
          code?: string
          created_at?: string
          employer_cost_default?: boolean
          label?: string
          section?: string
          social_security_default?: boolean
          taxable_default?: boolean
          unit?: string
        }
        Relationships: []
      }
      payroll_employee_results: {
        Row: {
          calculation_quality: string
          created_at: string
          employee_contributions_cents: number
          employee_id: string
          employer_contributions_cents: number
          employer_cost_cents: number
          estimated_net_cents: number
          gross_cents: number
          id: string
          other_employee_deductions_cents: number
          payable_minutes: number
          payroll_run_id: string
          professional_withholding_cents: number
          restaurant_id: string
          social_security_base_cents: number
          taxable_cents: number
          warnings: Json
        }
        Insert: {
          calculation_quality: string
          created_at?: string
          employee_contributions_cents: number
          employee_id: string
          employer_contributions_cents: number
          employer_cost_cents: number
          estimated_net_cents: number
          gross_cents: number
          id?: string
          other_employee_deductions_cents?: number
          payable_minutes: number
          payroll_run_id: string
          professional_withholding_cents: number
          restaurant_id: string
          social_security_base_cents: number
          taxable_cents: number
          warnings?: Json
        }
        Update: {
          calculation_quality?: string
          created_at?: string
          employee_contributions_cents?: number
          employee_id?: string
          employer_contributions_cents?: number
          employer_cost_cents?: number
          estimated_net_cents?: number
          gross_cents?: number
          id?: string
          other_employee_deductions_cents?: number
          payable_minutes?: number
          payroll_run_id?: string
          professional_withholding_cents?: number
          restaurant_id?: string
          social_security_base_cents?: number
          taxable_cents?: number
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_results_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_employee_results_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_export_runs: {
        Row: {
          created_at: string
          created_by_profile_id: string
          filename: string
          format: string
          id: string
          payload: Json
          payload_sha256: string
          period_end: string
          period_start: string
          restaurant_id: string
          row_count: number
          schema_version: number
          source_revisions: Json
          total_net_minutes: number
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          filename: string
          format?: string
          id?: string
          payload: Json
          payload_sha256: string
          period_end: string
          period_start: string
          restaurant_id: string
          row_count: number
          schema_version?: number
          source_revisions: Json
          total_net_minutes: number
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          filename?: string
          format?: string
          id?: string
          payload?: Json
          payload_sha256?: string
          period_end?: string
          period_start?: string
          restaurant_id?: string
          row_count?: number
          schema_version?: number
          source_revisions?: Json
          total_net_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_export_runs_actor_fk"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_export_runs_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_legal_sources: {
        Row: {
          authority: string
          code: string
          content_hash: string | null
          created_at: string
          id: string
          published_on: string | null
          retrieved_on: string
          title: string
          url: string
          verification_notes: string | null
        }
        Insert: {
          authority: string
          code: string
          content_hash?: string | null
          created_at?: string
          id?: string
          published_on?: string | null
          retrieved_on: string
          title: string
          url: string
          verification_notes?: string | null
        }
        Update: {
          authority?: string
          code?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          published_on?: string | null
          retrieved_on?: string
          title?: string
          url?: string
          verification_notes?: string | null
        }
        Relationships: []
      }
      payroll_periods: {
        Row: {
          created_at: string
          created_by_profile_id: string
          id: string
          period_end: string
          period_start: string
          restaurant_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          id?: string
          period_end: string
          period_start: string
          restaurant_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          id?: string
          period_end?: string
          period_start?: string
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_provider_components: {
        Row: {
          active: boolean
          component_code: string
          created_at: string
          id: string
          provider_code: string
          provider_id: string
          provider_label: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          component_code: string
          created_at?: string
          id?: string
          provider_code: string
          provider_id: string
          provider_label: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          component_code?: string
          created_at?: string
          id?: string
          provider_code?: string
          provider_id?: string
          provider_label?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_provider_components_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "payroll_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_provider_components_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_provider_employee_mappings: {
        Row: {
          active: boolean
          created_at: string
          created_by_profile_id: string
          employee_id: string
          external_employee_id: string
          id: string
          provider_id: string
          restaurant_id: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by_profile_id: string
          employee_id: string
          external_employee_id: string
          id?: string
          provider_id: string
          restaurant_id: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by_profile_id?: string
          employee_id?: string
          external_employee_id?: string
          id?: string
          provider_id?: string
          restaurant_id?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_provider_employee_mappings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_employee_mappings_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_provider_employee_mappings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_provider_exports: {
        Row: {
          created_at: string
          created_by_profile_id: string
          id: string
          payload: Json
          payload_sha256: string
          payroll_run_id: string
          provider_id: string
          restaurant_id: string
          schema_version: number
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          id?: string
          payload: Json
          payload_sha256: string
          payroll_run_id: string
          provider_id: string
          restaurant_id: string
          schema_version?: number
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          id?: string
          payload?: Json
          payload_sha256?: string
          payroll_run_id?: string
          provider_id?: string
          restaurant_id?: string
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_provider_exports_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_exports_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_exports_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_exports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_provider_return_files: {
        Row: {
          id: string
          imported_at: string
          imported_by_profile_id: string
          original_filename: string
          payload: Json
          payload_sha256: string
          payroll_run_id: string
          provider_id: string
          restaurant_id: string
        }
        Insert: {
          id?: string
          imported_at?: string
          imported_by_profile_id: string
          original_filename: string
          payload: Json
          payload_sha256: string
          payroll_run_id: string
          provider_id: string
          restaurant_id: string
        }
        Update: {
          id?: string
          imported_at?: string
          imported_by_profile_id?: string
          original_filename?: string
          payload?: Json
          payload_sha256?: string
          payroll_run_id?: string
          provider_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_provider_return_files_imported_by_profile_id_fkey"
            columns: ["imported_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_return_files_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_return_files_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_provider_return_files_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_providers: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payroll_quota_movements: {
        Row: {
          created_at: string
          employee_id: string
          evidence_id: string | null
          id: string
          movement_minutes: number
          payroll_run_id: string
          quota_type: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          evidence_id?: string | null
          id?: string
          movement_minutes: number
          payroll_run_id: string
          quota_type: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          evidence_id?: string | null
          id?: string
          movement_minutes?: number
          payroll_run_id?: string
          quota_type?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_quota_movements_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_quota_movements_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "employee_regime_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_quota_movements_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_readiness_acceptances: {
        Row: {
          accepted_at: string
          accepted_by_profile_id: string
          employee_id: string | null
          id: string
          period_end: string
          period_start: string
          reason: string
          restaurant_id: string
          warning_code: string
        }
        Insert: {
          accepted_at?: string
          accepted_by_profile_id: string
          employee_id?: string | null
          id?: string
          period_end: string
          period_start: string
          reason: string
          restaurant_id: string
          warning_code: string
        }
        Update: {
          accepted_at?: string
          accepted_by_profile_id?: string
          employee_id?: string | null
          id?: string
          period_end?: string
          period_start?: string
          reason?: string
          restaurant_id?: string
          warning_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_readiness_acceptances_actor_fk"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_readiness_acceptances_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_readiness_acceptances_restaurant_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_reconciliations: {
        Row: {
          component_code: string
          created_at: string
          employee_id: string
          explanation: string | null
          id: string
          payroll_provider_return_file_id: string
          payroll_run_id: string
          provider_amount_cents: number
          resolved_at: string | null
          resolved_by_profile_id: string | null
          restaurant_id: string
          restogogo_amount_cents: number
          status: string
          variance_cents: number
        }
        Insert: {
          component_code: string
          created_at?: string
          employee_id: string
          explanation?: string | null
          id?: string
          payroll_provider_return_file_id: string
          payroll_run_id: string
          provider_amount_cents: number
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          restaurant_id: string
          restogogo_amount_cents: number
          status?: string
          variance_cents: number
        }
        Update: {
          component_code?: string
          created_at?: string
          employee_id?: string
          explanation?: string | null
          id?: string
          payroll_provider_return_file_id?: string
          payroll_run_id?: string
          provider_amount_cents?: number
          resolved_at?: string | null
          resolved_by_profile_id?: string | null
          restaurant_id?: string
          restogogo_amount_cents?: number
          status?: string
          variance_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_reconciliations_component_code_fkey"
            columns: ["component_code"]
            isOneToOne: false
            referencedRelation: "payroll_components"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payroll_reconciliations_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "payroll_reconciliations_payroll_provider_return_file_id_fkey"
            columns: ["payroll_provider_return_file_id"]
            isOneToOne: false
            referencedRelation: "payroll_provider_return_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_reconciliations_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_reconciliations_resolved_by_profile_id_fkey"
            columns: ["resolved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rule_sets: {
        Row: {
          approved_by_profile_id: string | null
          created_at: string
          id: string
          jurisdiction: string
          published_at: string | null
          sector_code: string
          source_hash: string | null
          status: string
          valid_from: string
          valid_to: string | null
          version: string
        }
        Insert: {
          approved_by_profile_id?: string | null
          created_at?: string
          id?: string
          jurisdiction: string
          published_at?: string | null
          sector_code: string
          source_hash?: string | null
          status: string
          valid_from: string
          valid_to?: string | null
          version: string
        }
        Update: {
          approved_by_profile_id?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string
          published_at?: string | null
          sector_code?: string
          source_hash?: string | null
          status?: string
          valid_from?: string
          valid_to?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rule_sets_approver_fk"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rules: {
        Row: {
          code: string
          conditions_json: Json
          created_at: string
          cumulation_group: string | null
          effective_from: string
          effective_to: string | null
          handler_type: string
          id: string
          legal_source_id: string
          parameters_json: Json
          priority: number
          rule_set_id: string
          status: string
          verification_notes: string | null
        }
        Insert: {
          code: string
          conditions_json?: Json
          created_at?: string
          cumulation_group?: string | null
          effective_from: string
          effective_to?: string | null
          handler_type: string
          id?: string
          legal_source_id: string
          parameters_json?: Json
          priority?: number
          rule_set_id: string
          status: string
          verification_notes?: string | null
        }
        Update: {
          code?: string
          conditions_json?: Json
          created_at?: string
          cumulation_group?: string | null
          effective_from?: string
          effective_to?: string | null
          handler_type?: string
          id?: string
          legal_source_id?: string
          parameters_json?: Json
          priority?: number
          rule_set_id?: string
          status?: string
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rules_legal_source_id_fkey"
            columns: ["legal_source_id"]
            isOneToOne: false
            referencedRelation: "payroll_legal_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_rules_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          calculated_at: string | null
          calculation_quality: string
          configuration_id: string
          created_at: string
          created_by_profile_id: string
          finalized_at: string | null
          finalized_by_profile_id: string | null
          id: string
          input_sha256: string
          input_snapshot: Json
          payroll_period_id: string
          reconciled_at: string | null
          reconciled_by_profile_id: string | null
          restaurant_id: string
          reviewed_at: string | null
          reviewed_by_profile_id: string | null
          rule_set_id: string
          status: string
          total_employee_deductions_cents: number
          total_employer_contributions_cents: number
          total_employer_cost_cents: number
          total_estimated_net_cents: number
          total_gross_cents: number
          total_payable_minutes: number
          version_number: number
          warning_count: number
        }
        Insert: {
          calculated_at?: string | null
          calculation_quality?: string
          configuration_id: string
          created_at?: string
          created_by_profile_id: string
          finalized_at?: string | null
          finalized_by_profile_id?: string | null
          id?: string
          input_sha256: string
          input_snapshot: Json
          payroll_period_id: string
          reconciled_at?: string | null
          reconciled_by_profile_id?: string | null
          restaurant_id: string
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          rule_set_id: string
          status?: string
          total_employee_deductions_cents?: number
          total_employer_contributions_cents?: number
          total_employer_cost_cents?: number
          total_estimated_net_cents?: number
          total_gross_cents?: number
          total_payable_minutes?: number
          version_number: number
          warning_count?: number
        }
        Update: {
          calculated_at?: string | null
          calculation_quality?: string
          configuration_id?: string
          created_at?: string
          created_by_profile_id?: string
          finalized_at?: string | null
          finalized_by_profile_id?: string | null
          id?: string
          input_sha256?: string
          input_snapshot?: Json
          payroll_period_id?: string
          reconciled_at?: string | null
          reconciled_by_profile_id?: string | null
          restaurant_id?: string
          reviewed_at?: string | null
          reviewed_by_profile_id?: string | null
          rule_set_id?: string
          status?: string
          total_employee_deductions_cents?: number
          total_employer_contributions_cents?: number
          total_employer_cost_cents?: number
          total_estimated_net_cents?: number
          total_gross_cents?: number
          total_payable_minutes?: number
          version_number?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "restaurant_payroll_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_finalized_by_profile_id_fkey"
            columns: ["finalized_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_reconciled_by_profile_id_fkey"
            columns: ["reconciled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_reviewed_by_profile_id_fkey"
            columns: ["reviewed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_feedback: {
        Row: {
          actor_role: string | null
          admin_note: string
          app_release: string
          category: string
          created_at: string
          id: string
          locale: string
          message: string
          page_path: string
          reporter_profile_id: string | null
          resolved_at: string | null
          restaurant_id: string | null
          status: string
          updated_at: string
          user_agent: string
          viewport: string
        }
        Insert: {
          actor_role?: string | null
          admin_note?: string
          app_release: string
          category: string
          created_at?: string
          id?: string
          locale?: string
          message: string
          page_path: string
          reporter_profile_id?: string | null
          resolved_at?: string | null
          restaurant_id?: string | null
          status?: string
          updated_at?: string
          user_agent?: string
          viewport?: string
        }
        Update: {
          actor_role?: string | null
          admin_note?: string
          app_release?: string
          category?: string
          created_at?: string
          id?: string
          locale?: string
          message?: string
          page_path?: string
          reporter_profile_id?: string | null
          resolved_at?: string | null
          restaurant_id?: string | null
          status?: string
          updated_at?: string
          user_agent?: string
          viewport?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_feedback_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_feedback_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_shifts: {
        Row: {
          area_id: string | null
          created_at: string
          employee_id: string
          ends_at: string | null
          id: string
          job_function_id: string | null
          restaurant_id: string
          service_key: string
          source: Database["public"]["Enums"]["planned_shift_source"]
          starts_at: string | null
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          employee_id: string
          ends_at?: string | null
          id?: string
          job_function_id?: string | null
          restaurant_id: string
          service_key: string
          source?: Database["public"]["Enums"]["planned_shift_source"]
          starts_at?: string | null
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          area_id?: string | null
          created_at?: string
          employee_id?: string
          ends_at?: string | null
          id?: string
          job_function_id?: string | null
          restaurant_id?: string
          service_key?: string
          source?: Database["public"]["Enums"]["planned_shift_source"]
          starts_at?: string | null
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "planned_shifts_area_fk"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planned_shifts_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planned_shifts_job_function_fk"
            columns: ["restaurant_id", "job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planned_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_shifts_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "planned_shifts_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      planning_draft_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          restaurant_id: string
          service_key: string
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          restaurant_id: string
          service_key: string
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          restaurant_id?: string
          service_key?: string
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_draft_notes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_draft_notes_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "planning_draft_notes_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      planning_draft_shifts: {
        Row: {
          area_id: string | null
          created_at: string
          employee_id: string
          ends_at: string | null
          id: string
          job_function_id: string | null
          restaurant_id: string
          service_key: string
          source: Database["public"]["Enums"]["planned_shift_source"]
          starts_at: string | null
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          employee_id: string
          ends_at?: string | null
          id?: string
          job_function_id?: string | null
          restaurant_id: string
          service_key: string
          source?: Database["public"]["Enums"]["planned_shift_source"]
          starts_at?: string | null
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          area_id?: string | null
          created_at?: string
          employee_id?: string
          ends_at?: string | null
          id?: string
          job_function_id?: string | null
          restaurant_id?: string
          service_key?: string
          source?: Database["public"]["Enums"]["planned_shift_source"]
          starts_at?: string | null
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_draft_shifts_area_fk"
            columns: ["restaurant_id", "area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planning_draft_shifts_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planning_draft_shifts_job_function_fk"
            columns: ["restaurant_id", "job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "planning_draft_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_draft_shifts_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "planning_draft_shifts_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      platform_admin_events: {
        Row: {
          action: string
          admin_profile_id: string | null
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_profile_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_profile_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_events_admin_profile_id_fkey"
            columns: ["admin_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_notification_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          id: string
          last_attempt_at: string
          notification_key: string
          notification_type: string
          restaurant_id: string
          sent_at: string | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string
          notification_key: string
          notification_type: string
          restaurant_id: string
          sent_at?: string | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          id?: string
          last_attempt_at?: string
          notification_key?: string
          notification_type?: string
          restaurant_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_notification_type_fkey"
            columns: ["notification_type"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "push_notification_deliveries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          active: boolean
          auth_key: string
          created_at: string
          device_name: string | null
          enabled_at: string
          endpoint: string
          id: string
          last_seen_at: string
          locale: string
          p256dh: string
          profile_id: string
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          active?: boolean
          auth_key: string
          created_at?: string
          device_name?: string | null
          enabled_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          locale?: string
          p256dh: string
          profile_id: string
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          active?: boolean
          auth_key?: string
          created_at?: string
          device_name?: string | null
          enabled_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          locale?: string
          p256dh?: string
          profile_id?: string
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_schedule_slots: {
        Row: {
          active: boolean
          created_at: string
          employee_id: string
          ends_at: string | null
          id: string
          restaurant_id: string
          service_key: string
          starts_at: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id: string
          ends_at?: string | null
          id?: string
          restaurant_id: string
          service_key: string
          starts_at?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string
          ends_at?: string | null
          id?: string
          restaurant_id?: string
          service_key?: string
          starts_at?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_schedule_slots_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "recurring_schedule_slots_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_schedule_slots_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      reservation_configuration_revisions: {
        Row: {
          restaurant_id: string
          setup_revision: number
          updated_at: string
          venue_revision: number
        }
        Insert: {
          restaurant_id: string
          setup_revision?: number
          updated_at?: string
          venue_revision?: number
        }
        Update: {
          restaurant_id?: string
          setup_revision?: number
          updated_at?: string
          venue_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_configuration_revisions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_events: {
        Row: {
          actor_profile_id: string | null
          details: Json
          event_type: string
          from_status: string | null
          id: string
          occurred_at: string
          reservation_id: string
          restaurant_id: string
          to_status: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          details?: Json
          event_type: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reservation_id: string
          restaurant_id: string
          to_status?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          details?: Json
          event_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reservation_id?: string
          restaurant_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_events_restaurant_id_reservation_id_fkey"
            columns: ["restaurant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_floors: {
        Row: {
          active: boolean
          canvas_height: number
          canvas_width: number
          created_at: string
          id: string
          level: number
          metadata: Json
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          id?: string
          level?: number
          metadata?: Json
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          id?: string
          level?: number
          metadata?: Json
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_floors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_guests: {
        Row: {
          allergies: string | null
          anonymized_at: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          internal_notes: string | null
          language_code: string
          marketing_email_consent: boolean
          marketing_sms_consent: boolean
          metadata: Json
          normalized_email: string | null
          normalized_phone: string | null
          phone: string | null
          preferences: string | null
          preferred_room_id: string | null
          preferred_table_id: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          anonymized_at?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          language_code?: string
          marketing_email_consent?: boolean
          marketing_sms_consent?: boolean
          metadata?: Json
          normalized_email?: string | null
          normalized_phone?: string | null
          phone?: string | null
          preferences?: string | null
          preferred_room_id?: string | null
          preferred_table_id?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          anonymized_at?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          internal_notes?: string | null
          language_code?: string
          marketing_email_consent?: boolean
          marketing_sms_consent?: boolean
          metadata?: Json
          normalized_email?: string | null
          normalized_phone?: string | null
          phone?: string | null
          preferences?: string | null
          preferred_room_id?: string | null
          preferred_table_id?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_guests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_guests_restaurant_id_preferred_room_id_fkey"
            columns: ["restaurant_id", "preferred_room_id"]
            isOneToOne: false
            referencedRelation: "reservation_rooms"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_guests_restaurant_id_preferred_table_id_fkey"
            columns: ["restaurant_id", "preferred_table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_public_channels: {
        Row: {
          allowed_origins: string[]
          created_at: string
          enabled: boolean
          id: string
          name: string
          public_key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          allowed_origins: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          public_key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          allowed_origins?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          public_key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_public_channels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_public_hold_tables: {
        Row: {
          created_at: string
          hold_id: string
          restaurant_id: string
          sort_order: number
          table_id: string
        }
        Insert: {
          created_at?: string
          hold_id: string
          restaurant_id: string
          sort_order?: number
          table_id: string
        }
        Update: {
          created_at?: string
          hold_id?: string
          restaurant_id?: string
          sort_order?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_public_hold_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_public_hold_tables_restaurant_id_hold_id_fkey"
            columns: ["restaurant_id", "hold_id"]
            isOneToOne: false
            referencedRelation: "reservation_public_holds"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_hold_tables_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_public_holds: {
        Row: {
          business_date: string
          channel_id: string
          consumed_at: string | null
          created_at: string
          ends_at: string
          expires_at: string
          hold_token_hash: string
          id: string
          party_size: number
          released_at: string | null
          reservation_id: string | null
          restaurant_id: string
          room_id: string | null
          service_key: string
          starts_at: string
          token_prefix: string
        }
        Insert: {
          business_date: string
          channel_id: string
          consumed_at?: string | null
          created_at?: string
          ends_at: string
          expires_at: string
          hold_token_hash: string
          id?: string
          party_size: number
          released_at?: string | null
          reservation_id?: string | null
          restaurant_id: string
          room_id?: string | null
          service_key: string
          starts_at: string
          token_prefix: string
        }
        Update: {
          business_date?: string
          channel_id?: string
          consumed_at?: string | null
          created_at?: string
          ends_at?: string
          expires_at?: string
          hold_token_hash?: string
          id?: string
          party_size?: number
          released_at?: string | null
          reservation_id?: string | null
          restaurant_id?: string
          room_id?: string | null
          service_key?: string
          starts_at?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_public_holds_restaurant_id_channel_id_fkey"
            columns: ["restaurant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "reservation_public_channels"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_holds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_public_holds_restaurant_id_reservation_id_fkey"
            columns: ["restaurant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_holds_restaurant_id_room_id_fkey"
            columns: ["restaurant_id", "room_id"]
            isOneToOne: false
            referencedRelation: "reservation_rooms"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_holds_restaurant_id_service_key_fkey"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      reservation_public_idempotency: {
        Row: {
          channel_id: string
          created_at: string
          expires_at: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
          restaurant_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          expires_at: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
          restaurant_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          expires_at?: string
          idempotency_key?: string
          operation?: string
          request_hash?: string
          response?: Json
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_public_idempotency_restaurant_id_channel_id_fkey"
            columns: ["restaurant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "reservation_public_channels"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_idempotency_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_public_rate_limits: {
        Row: {
          bucket: string
          channel_id: string
          client_hash: string
          request_count: number
          restaurant_id: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          bucket: string
          channel_id: string
          client_hash: string
          request_count?: number
          restaurant_id: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          bucket?: string
          channel_id?: string
          client_hash?: string
          request_count?: number
          restaurant_id?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_public_rate_limits_restaurant_id_channel_id_fkey"
            columns: ["restaurant_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "reservation_public_channels"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_public_rate_limits_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_rooms: {
        Row: {
          active: boolean
          created_at: string
          floor_id: string | null
          height: number
          id: string
          metadata: Json
          position_x: number
          position_y: number
          restaurant_id: string
          sort_order: number
          updated_at: string
          width: number
          work_area_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          floor_id?: string | null
          height?: number
          id?: string
          metadata?: Json
          position_x?: number
          position_y?: number
          restaurant_id: string
          sort_order?: number
          updated_at?: string
          width?: number
          work_area_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          floor_id?: string | null
          height?: number
          id?: string
          metadata?: Json
          position_x?: number
          position_y?: number
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
          width?: number
          work_area_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_rooms_floor_fk"
            columns: ["restaurant_id", "floor_id"]
            isOneToOne: false
            referencedRelation: "reservation_floors"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_rooms_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_rooms_restaurant_id_work_area_id_fkey"
            columns: ["restaurant_id", "work_area_id"]
            isOneToOne: true
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_service_exceptions: {
        Row: {
          availability: string
          business_date: string
          closes_at: string | null
          created_at: string
          created_by_profile_id: string | null
          id: string
          opens_at: string | null
          reason: string | null
          restaurant_id: string
          service_key: string
          updated_at: string
        }
        Insert: {
          availability: string
          business_date: string
          closes_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          opens_at?: string | null
          reason?: string | null
          restaurant_id: string
          service_key: string
          updated_at?: string
        }
        Update: {
          availability?: string
          business_date?: string
          closes_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          opens_at?: string | null
          reason?: string | null
          restaurant_id?: string
          service_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_service_exceptions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_service_exceptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_service_exceptions_restaurant_id_service_key_fkey"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      reservation_service_settings: {
        Row: {
          advance_booking_days: number
          automatic_confirmation: boolean
          booking_cutoff_minutes: number
          booking_enabled: boolean
          created_at: string
          default_duration_minutes: number
          maximum_covers: number | null
          maximum_party_size: number
          metadata: Json
          minimum_party_size: number
          restaurant_id: string
          service_key: string
          slot_interval_minutes: number
          turn_time_minutes: number
          updated_at: string
        }
        Insert: {
          advance_booking_days?: number
          automatic_confirmation?: boolean
          booking_cutoff_minutes?: number
          booking_enabled?: boolean
          created_at?: string
          default_duration_minutes?: number
          maximum_covers?: number | null
          maximum_party_size?: number
          metadata?: Json
          minimum_party_size?: number
          restaurant_id: string
          service_key: string
          slot_interval_minutes?: number
          turn_time_minutes?: number
          updated_at?: string
        }
        Update: {
          advance_booking_days?: number
          automatic_confirmation?: boolean
          booking_cutoff_minutes?: number
          booking_enabled?: boolean
          created_at?: string
          default_duration_minutes?: number
          maximum_covers?: number | null
          maximum_party_size?: number
          metadata?: Json
          minimum_party_size?: number
          restaurant_id?: string
          service_key?: string
          slot_interval_minutes?: number
          turn_time_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_service_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_service_settings_restaurant_id_service_key_fkey"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      reservation_table_assignments: {
        Row: {
          assigned_at: string
          assigned_by_profile_id: string | null
          assignment_group_id: string
          explanation: string | null
          id: string
          metadata: Json
          occupied_at: unknown
          reservation_id: string
          restaurant_id: string
          table_id: string
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by_profile_id?: string | null
          assignment_group_id?: string
          explanation?: string | null
          id?: string
          metadata?: Json
          occupied_at: unknown
          reservation_id: string
          restaurant_id: string
          table_id: string
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by_profile_id?: string | null
          assignment_group_id?: string
          explanation?: string | null
          id?: string
          metadata?: Json
          occupied_at?: unknown
          reservation_id?: string
          restaurant_id?: string
          table_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_table_assignments_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_table_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_table_assignments_restaurant_id_reservation_id_fkey"
            columns: ["restaurant_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_table_assignments_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_table_combination_members: {
        Row: {
          combination_id: string
          created_at: string
          restaurant_id: string
          sort_order: number
          table_id: string
        }
        Insert: {
          combination_id: string
          created_at?: string
          restaurant_id: string
          sort_order?: number
          table_id: string
        }
        Update: {
          combination_id?: string
          created_at?: string
          restaurant_id?: string
          sort_order?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_table_combination_membe_restaurant_id_table_id_fkey"
            columns: ["restaurant_id", "table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservation_table_combination_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_table_combination_restaurant_id_combination_id_fkey"
            columns: ["restaurant_id", "combination_id"]
            isOneToOne: false
            referencedRelation: "reservation_table_combinations"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_table_combinations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          maximum_capacity: number
          metadata: Json
          minimum_capacity: number
          name: string
          restaurant_id: string
          room_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          maximum_capacity: number
          metadata?: Json
          minimum_capacity: number
          name: string
          restaurant_id: string
          room_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          maximum_capacity?: number
          metadata?: Json
          minimum_capacity?: number
          name?: string
          restaurant_id?: string
          room_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_table_combinations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_table_combinations_restaurant_id_room_id_fkey"
            columns: ["restaurant_id", "room_id"]
            isOneToOne: false
            referencedRelation: "reservation_rooms"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservation_tables: {
        Row: {
          active: boolean
          blocked: boolean
          created_at: string
          height: number
          id: string
          label: string
          maximum_capacity: number
          metadata: Json
          minimum_capacity: number
          position_x: number
          position_y: number
          restaurant_id: string
          room_id: string
          rotation_degrees: number
          shape: string
          sort_order: number
          updated_at: string
          width: number
        }
        Insert: {
          active?: boolean
          blocked?: boolean
          created_at?: string
          height?: number
          id?: string
          label: string
          maximum_capacity?: number
          metadata?: Json
          minimum_capacity?: number
          position_x?: number
          position_y?: number
          restaurant_id: string
          room_id: string
          rotation_degrees?: number
          shape?: string
          sort_order?: number
          updated_at?: string
          width?: number
        }
        Update: {
          active?: boolean
          blocked?: boolean
          created_at?: string
          height?: number
          id?: string
          label?: string
          maximum_capacity?: number
          metadata?: Json
          minimum_capacity?: number
          position_x?: number
          position_y?: number
          restaurant_id?: string
          room_id?: string
          rotation_degrees?: number
          shape?: string
          sort_order?: number
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_tables_restaurant_id_room_id_fkey"
            columns: ["restaurant_id", "room_id"]
            isOneToOne: false
            referencedRelation: "reservation_rooms"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      reservations: {
        Row: {
          assignment_locked: boolean
          business_date: string
          created_at: string
          created_by_profile_id: string | null
          ends_at: string
          guest_comment: string | null
          guest_id: string
          id: string
          internal_notes: string | null
          metadata: Json
          party_size: number
          preferred_table_id: string | null
          restaurant_id: string
          revision: number
          room_preference_id: string | null
          service_key: string
          source: string
          starts_at: string
          status: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          assignment_locked?: boolean
          business_date: string
          created_at?: string
          created_by_profile_id?: string | null
          ends_at: string
          guest_comment?: string | null
          guest_id: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          party_size: number
          preferred_table_id?: string | null
          restaurant_id: string
          revision?: number
          room_preference_id?: string | null
          service_key: string
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          assignment_locked?: boolean
          business_date?: string
          created_at?: string
          created_by_profile_id?: string | null
          ends_at?: string
          guest_comment?: string | null
          guest_id?: string
          id?: string
          internal_notes?: string | null
          metadata?: Json
          party_size?: number
          preferred_table_id?: string | null
          restaurant_id?: string
          revision?: number
          room_preference_id?: string | null
          service_key?: string
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_guest_id_fkey"
            columns: ["restaurant_id", "guest_id"]
            isOneToOne: false
            referencedRelation: "reservation_guests"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_preferred_table_id_fkey"
            columns: ["restaurant_id", "preferred_table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_room_preference_id_fkey"
            columns: ["restaurant_id", "room_preference_id"]
            isOneToOne: false
            referencedRelation: "reservation_rooms"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_service_key_fkey"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "reservations_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_document_events: {
        Row: {
          actor_profile_id: string | null
          details: Json
          document_id: string
          event_type: string
          id: string
          occurred_at: string
          restaurant_id: string
        }
        Insert: {
          actor_profile_id?: string | null
          details?: Json
          document_id: string
          event_type: string
          id?: string
          occurred_at?: string
          restaurant_id: string
        }
        Update: {
          actor_profile_id?: string | null
          details?: Json
          document_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_document_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_document_events_restaurant_id_document_id_fkey"
            columns: ["restaurant_id", "document_id"]
            isOneToOne: false
            referencedRelation: "restaurant_documents"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "restaurant_document_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_document_storage_settings: {
        Row: {
          created_at: string
          max_file_bytes: number
          plan_code: string
          restaurant_id: string
          total_limit_bytes: number
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          created_at?: string
          max_file_bytes?: number
          plan_code?: string
          restaurant_id: string
          total_limit_bytes?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          created_at?: string
          max_file_bytes?: number
          plan_code?: string
          restaurant_id?: string
          total_limit_bytes?: number
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_document_storage_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_document_storage_settings_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_documents: {
        Row: {
          access_scope: string
          archived_at: string | null
          category: string
          created_at: string
          created_by_profile_id: string | null
          document_date: string | null
          employee_id: string | null
          expires_on: string | null
          id: string
          mime_type: string
          note: string | null
          object_path: string
          original_filename: string
          restaurant_id: string
          size_bytes: number
          status: string
          title: string
          updated_at: string
          updated_by_profile_id: string | null
        }
        Insert: {
          access_scope?: string
          archived_at?: string | null
          category: string
          created_at?: string
          created_by_profile_id?: string | null
          document_date?: string | null
          employee_id?: string | null
          expires_on?: string | null
          id?: string
          mime_type: string
          note?: string | null
          object_path: string
          original_filename: string
          restaurant_id: string
          size_bytes: number
          status?: string
          title: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Update: {
          access_scope?: string
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by_profile_id?: string | null
          document_date?: string | null
          employee_id?: string | null
          expires_on?: string | null
          id?: string
          mime_type?: string
          note?: string | null
          object_path?: string
          original_filename?: string
          restaurant_id?: string
          size_bytes?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_documents_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_documents_restaurant_id_employee_id_fkey"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "restaurant_documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_documents_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_employment_settings: {
        Row: {
          created_at: string
          dimona_submission_mode: string
          establishment_unit_number: string | null
          external_employer_id: string | null
          joint_committee_code: string
          metadata: Json
          onss_employer_number: string | null
          restaurant_id: string
          social_secretariat_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dimona_submission_mode?: string
          establishment_unit_number?: string | null
          external_employer_id?: string | null
          joint_committee_code?: string
          metadata?: Json
          onss_employer_number?: string | null
          restaurant_id: string
          social_secretariat_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dimona_submission_mode?: string
          establishment_unit_number?: string | null
          external_employer_id?: string | null
          joint_committee_code?: string
          metadata?: Json
          onss_employer_number?: string | null
          restaurant_id?: string
          social_secretariat_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_employment_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_memberships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          restaurant_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          restaurant_id: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          restaurant_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_memberships_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_onboarding_state: {
        Row: {
          created_at: string
          entered_workspace_at: string | null
          last_step: string
          restaurant_id: string
          started_at: string
          state: string
          updated_at: string
          workspace_created_at: string | null
        }
        Insert: {
          created_at?: string
          entered_workspace_at?: string | null
          last_step?: string
          restaurant_id: string
          started_at?: string
          state?: string
          updated_at?: string
          workspace_created_at?: string | null
        }
        Update: {
          created_at?: string
          entered_workspace_at?: string | null
          last_step?: string
          restaurant_id?: string
          started_at?: string
          state?: string
          updated_at?: string
          workspace_created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_onboarding_state_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payroll_configuration_validations: {
        Row: {
          blockers: Json
          configuration_id: string
          created_at: string
          id: string
          restaurant_id: string
          result_status: string
          validated_by_profile_id: string
        }
        Insert: {
          blockers?: Json
          configuration_id: string
          created_at?: string
          id?: string
          restaurant_id: string
          result_status: string
          validated_by_profile_id: string
        }
        Update: {
          blockers?: Json
          configuration_id?: string
          created_at?: string
          id?: string
          restaurant_id?: string
          result_status?: string
          validated_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payroll_configuration_v_validated_by_profile_id_fkey"
            columns: ["validated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payroll_configuration_validati_configuration_id_fkey"
            columns: ["configuration_id"]
            isOneToOne: false
            referencedRelation: "restaurant_payroll_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payroll_configuration_validations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payroll_configurations: {
        Row: {
          active: boolean
          cost_assumptions: Json
          created_at: string
          created_by_profile_id: string
          default_provider_id: string | null
          employer_category_code: string | null
          gks_registered: boolean | null
          id: string
          ordinary_daily_limit_minutes: number | null
          reference_full_time_weekly_minutes: number
          reference_period_weeks: number
          restaurant_id: string
          rule_set_id: string
          status: string
          valid_from: string
          valid_to: string | null
          version_number: number
          withholding_mode: string
        }
        Insert: {
          active?: boolean
          cost_assumptions?: Json
          created_at?: string
          created_by_profile_id: string
          default_provider_id?: string | null
          employer_category_code?: string | null
          gks_registered?: boolean | null
          id?: string
          ordinary_daily_limit_minutes?: number | null
          reference_full_time_weekly_minutes?: number
          reference_period_weeks?: number
          restaurant_id: string
          rule_set_id: string
          status?: string
          valid_from: string
          valid_to?: string | null
          version_number: number
          withholding_mode?: string
        }
        Update: {
          active?: boolean
          cost_assumptions?: Json
          created_at?: string
          created_by_profile_id?: string
          default_provider_id?: string | null
          employer_category_code?: string | null
          gks_registered?: boolean | null
          id?: string
          ordinary_daily_limit_minutes?: number | null
          reference_full_time_weekly_minutes?: number
          reference_period_weeks?: number
          restaurant_id?: string
          rule_set_id?: string
          status?: string
          valid_from?: string
          valid_to?: string | null
          version_number?: number
          withholding_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payroll_configurations_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payroll_configurations_provider_fk"
            columns: ["default_provider_id"]
            isOneToOne: false
            referencedRelation: "payroll_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payroll_configurations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_payroll_configurations_rule_set_id_fkey"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          active_week_start: string | null
          created_at: string
          currency_code: string
          locale: string
          payroll_export_columns: Json | null
          payroll_settings: Json
          restaurant_id: string
          settings: Json
          timezone: string
          updated_at: string
          week_start_weekday: number
        }
        Insert: {
          active_week_start?: string | null
          created_at?: string
          currency_code?: string
          locale?: string
          payroll_export_columns?: Json | null
          payroll_settings?: Json
          restaurant_id: string
          settings?: Json
          timezone?: string
          updated_at?: string
          week_start_weekday?: number
        }
        Update: {
          active_week_start?: string | null
          created_at?: string
          currency_code?: string
          locale?: string
          payroll_export_columns?: Json | null
          payroll_settings?: Json
          restaurant_id?: string
          settings?: Json
          timezone?: string
          updated_at?: string
          week_start_weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_stations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          last_used_at: string | null
          restaurant_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          restaurant_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          restaurant_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_stations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_stations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          active: boolean
          address_line1: string | null
          city: string | null
          company_number: string | null
          country_code: string
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          owner_profile_id: string
          phone: string | null
          postal_code: string | null
          updated_at: string
          workspace_slug: string
        }
        Insert: {
          active?: boolean
          address_line1?: string | null
          city?: string | null
          company_number?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          owner_profile_id: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          workspace_slug: string
        }
        Update: {
          active?: boolean
          address_line1?: string | null
          city?: string | null
          company_number?: string | null
          country_code?: string
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          owner_profile_id?: string
          phone?: string | null
          postal_code?: string | null
          updated_at?: string
          workspace_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          id: string
          metadata: Json
          name: string
          restaurant_id: string
          service_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          restaurant_id: string
          service_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          restaurant_id?: string
          service_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          actual_area_id: string | null
          actual_assignment_source: string
          actual_job_function_id: string | null
          adjusted_at: string | null
          adjusted_by_profile_id: string | null
          adjustment_reason: string | null
          break_minutes: number
          business_date: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_profile_id: string | null
          clock_in_at: string | null
          clock_in_photo_captured_at: string | null
          clock_in_photo_status: string | null
          clock_in_photo_url: string | null
          clock_out_at: string | null
          clock_out_photo_captured_at: string | null
          clock_out_photo_status: string | null
          clock_out_photo_url: string | null
          created_at: string
          employee_id: string
          id: string
          planned_shift_id: string | null
          restaurant_id: string
          revision: number
          service_key: string
          source: Database["public"]["Enums"]["time_entry_source"]
          status: Database["public"]["Enums"]["time_entry_status"]
          updated_at: string
        }
        Insert: {
          actual_area_id?: string | null
          actual_assignment_source?: string
          actual_job_function_id?: string | null
          adjusted_at?: string | null
          adjusted_by_profile_id?: string | null
          adjustment_reason?: string | null
          break_minutes?: number
          business_date: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          clock_in_at?: string | null
          clock_in_photo_captured_at?: string | null
          clock_in_photo_status?: string | null
          clock_in_photo_url?: string | null
          clock_out_at?: string | null
          clock_out_photo_captured_at?: string | null
          clock_out_photo_status?: string | null
          clock_out_photo_url?: string | null
          created_at?: string
          employee_id: string
          id?: string
          planned_shift_id?: string | null
          restaurant_id: string
          revision?: number
          service_key: string
          source?: Database["public"]["Enums"]["time_entry_source"]
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
        }
        Update: {
          actual_area_id?: string | null
          actual_assignment_source?: string
          actual_job_function_id?: string | null
          adjusted_at?: string | null
          adjusted_by_profile_id?: string | null
          adjustment_reason?: string | null
          break_minutes?: number
          business_date?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          clock_in_at?: string | null
          clock_in_photo_captured_at?: string | null
          clock_in_photo_status?: string | null
          clock_in_photo_url?: string | null
          clock_out_at?: string | null
          clock_out_photo_captured_at?: string | null
          clock_out_photo_status?: string | null
          clock_out_photo_url?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          planned_shift_id?: string | null
          restaurant_id?: string
          revision?: number
          service_key?: string
          source?: Database["public"]["Enums"]["time_entry_source"]
          status?: Database["public"]["Enums"]["time_entry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_actual_area_fk"
            columns: ["restaurant_id", "actual_area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entries_actual_job_function_fk"
            columns: ["restaurant_id", "actual_job_function_id"]
            isOneToOne: false
            referencedRelation: "job_functions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entries_adjusted_by_profile_id_fkey"
            columns: ["adjusted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_cancelled_by_profile_id_fkey"
            columns: ["cancelled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entries_planned_shift_fk"
            columns: ["restaurant_id", "planned_shift_id"]
            isOneToOne: false
            referencedRelation: "planned_shifts"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      time_entry_adjustments: {
        Row: {
          action: string
          actor_employee_id: string | null
          actor_profile_id: string | null
          actor_role: string
          business_date: string
          created_at: string
          employee_id: string | null
          id: string
          new_values: Json
          previous_values: Json
          reason: string
          restaurant_id: string
          service_key: string
          time_entry_id: string | null
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role: string
          business_date: string
          created_at?: string
          employee_id?: string | null
          id?: string
          new_values?: Json
          previous_values?: Json
          reason: string
          restaurant_id: string
          service_key: string
          time_entry_id?: string | null
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role?: string
          business_date?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          new_values?: Json
          previous_values?: Json
          reason?: string
          restaurant_id?: string
          service_key?: string
          time_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_adjustments_actor_employee_fk"
            columns: ["restaurant_id", "actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entry_adjustments_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_adjustments_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "time_entry_adjustments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_adjustments_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "time_entry_adjustments_time_entry_fk"
            columns: ["restaurant_id", "time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      time_entry_break_intervals: {
        Row: {
          active: boolean
          break_ended_at: string | null
          break_started_at: string | null
          created_at: string
          created_by_profile_id: string | null
          duration_seconds: number
          entry_revision: number
          evidence_kind: string
          id: string
          restaurant_id: string
          source: string
          superseded_at: string | null
          time_entry_id: string
        }
        Insert: {
          active?: boolean
          break_ended_at?: string | null
          break_started_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          duration_seconds: number
          entry_revision: number
          evidence_kind: string
          id?: string
          restaurant_id: string
          source: string
          superseded_at?: string | null
          time_entry_id: string
        }
        Update: {
          active?: boolean
          break_ended_at?: string | null
          break_started_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          duration_seconds?: number
          entry_revision?: number
          evidence_kind?: string
          id?: string
          restaurant_id?: string
          source?: string
          superseded_at?: string | null
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_break_intervals_actor_fk"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_break_intervals_entry_fk"
            columns: ["restaurant_id", "time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      weekly_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          restaurant_id: string
          service_key: string
          updated_at: string
          week_start: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          restaurant_id: string
          service_key: string
          updated_at?: string
          week_start: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          restaurant_id?: string
          service_key?: string
          updated_at?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_notes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_notes_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
          {
            foreignKeyName: "weekly_notes_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      work_areas: {
        Row: {
          active: boolean
          catalogue_key: string | null
          code: string
          color: string | null
          created_at: string
          floor_level: number | null
          icon_key: string | null
          id: string
          instance_number: number
          metadata: Json
          name: string
          notes: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalogue_key?: string | null
          code: string
          color?: string | null
          created_at?: string
          floor_level?: number | null
          icon_key?: string | null
          id?: string
          instance_number: number
          metadata?: Json
          name: string
          notes?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalogue_key?: string | null
          code?: string
          color?: string | null
          created_at?: string
          floor_level?: number | null
          icon_key?: string | null
          id?: string
          instance_number?: number
          metadata?: Json
          name?: string
          notes?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_areas_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_pattern_exception_events: {
        Row: {
          actor_employee_id: string | null
          actor_profile_id: string | null
          actor_role: string
          created_at: string
          employee_id: string
          event_type: string
          id: string
          new_values: Json
          previous_values: Json
          reason: string
          restaurant_id: string
          work_pattern_exception_id: string
        }
        Insert: {
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role: string
          created_at?: string
          employee_id: string
          event_type: string
          id?: string
          new_values?: Json
          previous_values?: Json
          reason: string
          restaurant_id: string
          work_pattern_exception_id: string
        }
        Update: {
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role?: string
          created_at?: string
          employee_id?: string
          event_type?: string
          id?: string
          new_values?: Json
          previous_values?: Json
          reason?: string
          restaurant_id?: string
          work_pattern_exception_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_pattern_exception_events_actor_employee_fk"
            columns: ["restaurant_id", "actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "work_pattern_exception_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pattern_exception_events_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "work_pattern_exception_events_exception_fk"
            columns: ["restaurant_id", "work_pattern_exception_id"]
            isOneToOne: false
            referencedRelation: "work_pattern_exceptions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "work_pattern_exception_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_pattern_exceptions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_profile_id: string | null
          created_at: string
          decided_at: string | null
          decided_by_profile_id: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          manager_comment: string | null
          reason: string
          requested_by_profile_id: string | null
          restaurant_id: string
          service_key: string | null
          start_date: string
          status: Database["public"]["Enums"]["operational_request_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_profile_id?: string | null
          employee_comment?: string | null
          employee_id: string
          end_date: string
          id?: string
          manager_comment?: string | null
          reason: string
          requested_by_profile_id?: string | null
          restaurant_id: string
          service_key?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["operational_request_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_profile_id?: string | null
          employee_comment?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          manager_comment?: string | null
          reason?: string
          requested_by_profile_id?: string | null
          restaurant_id?: string
          service_key?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["operational_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_pattern_exceptions_cancelled_by_profile_id_fkey"
            columns: ["cancelled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pattern_exceptions_decided_by_profile_id_fkey"
            columns: ["decided_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pattern_exceptions_employee_fk"
            columns: ["restaurant_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "work_pattern_exceptions_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pattern_exceptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_pattern_exceptions_service_fk"
            columns: ["restaurant_id", "service_key"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["restaurant_id", "service_key"]
          },
        ]
      }
      work_week_events: {
        Row: {
          actor_employee_id: string | null
          actor_profile_id: string | null
          actor_role: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          new_values: Json
          previous_values: Json
          reason: string
          restaurant_id: string
          week_start: string
        }
        Insert: {
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          new_values?: Json
          previous_values?: Json
          reason: string
          restaurant_id: string
          week_start: string
        }
        Update: {
          actor_employee_id?: string | null
          actor_profile_id?: string | null
          actor_role?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_values?: Json
          previous_values?: Json
          reason?: string
          restaurant_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_week_events_actor_employee_fk"
            columns: ["restaurant_id", "actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "work_week_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_week_events_week_fk"
            columns: ["restaurant_id", "week_start"]
            isOneToOne: false
            referencedRelation: "work_weeks"
            referencedColumns: ["restaurant_id", "week_start"]
          },
        ]
      }
      work_weeks: {
        Row: {
          actuals_approved_at: string | null
          actuals_approved_by_profile_id: string | null
          actuals_locked_at: string | null
          actuals_locked_by_profile_id: string | null
          actuals_reopened_at: string | null
          actuals_reopened_by_profile_id: string | null
          actuals_revision: number
          actuals_status: Database["public"]["Enums"]["actuals_status"]
          created_at: string
          planning_draft_updated_at: string | null
          planning_draft_updated_by_profile_id: string | null
          planning_has_unpublished_changes: boolean
          planning_revision: number
          planning_status: Database["public"]["Enums"]["planning_status"]
          published_at: string | null
          published_by_profile_id: string | null
          restaurant_id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          actuals_approved_at?: string | null
          actuals_approved_by_profile_id?: string | null
          actuals_locked_at?: string | null
          actuals_locked_by_profile_id?: string | null
          actuals_reopened_at?: string | null
          actuals_reopened_by_profile_id?: string | null
          actuals_revision?: number
          actuals_status?: Database["public"]["Enums"]["actuals_status"]
          created_at?: string
          planning_draft_updated_at?: string | null
          planning_draft_updated_by_profile_id?: string | null
          planning_has_unpublished_changes?: boolean
          planning_revision?: number
          planning_status?: Database["public"]["Enums"]["planning_status"]
          published_at?: string | null
          published_by_profile_id?: string | null
          restaurant_id: string
          updated_at?: string
          week_start: string
        }
        Update: {
          actuals_approved_at?: string | null
          actuals_approved_by_profile_id?: string | null
          actuals_locked_at?: string | null
          actuals_locked_by_profile_id?: string | null
          actuals_reopened_at?: string | null
          actuals_reopened_by_profile_id?: string | null
          actuals_revision?: number
          actuals_status?: Database["public"]["Enums"]["actuals_status"]
          created_at?: string
          planning_draft_updated_at?: string | null
          planning_draft_updated_by_profile_id?: string | null
          planning_has_unpublished_changes?: boolean
          planning_revision?: number
          planning_status?: Database["public"]["Enums"]["planning_status"]
          published_at?: string | null
          published_by_profile_id?: string | null
          restaurant_id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_weeks_actuals_approved_by_profile_id_fkey"
            columns: ["actuals_approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_weeks_actuals_locked_by_profile_id_fkey"
            columns: ["actuals_locked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_weeks_actuals_reopened_by_profile_id_fkey"
            columns: ["actuals_reopened_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_weeks_planning_draft_updated_by_profile_id_fkey"
            columns: ["planning_draft_updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_weeks_published_by_profile_id_fkey"
            columns: ["published_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_weeks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_realtime_events: {
        Row: {
          event: string
          restaurant_id: string
          sequence: number
          source: string
          updated_at: string
        }
        Insert: {
          event: string
          restaurant_id: string
          sequence?: number
          source: string
          updated_at?: string
        }
        Update: {
          event?: string
          restaurant_id?: string
          sequence?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_realtime_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _badge_record_core: {
        Args: {
          p_actor_profile_id: string
          p_badge_token: string
          p_employee_id: string
          p_photo_status: string
          p_photo_url: string
          p_restaurant_id: string
          p_service_key: string
          p_station_id: string
        }
        Returns: Json
      }
      _badge_roster_core: { Args: { p_restaurant_id: string }; Returns: Json }
      _badge_verify_core: {
        Args: {
          p_actor_profile_id: string
          p_employee_id: string
          p_pin: string
          p_restaurant_id: string
          p_station_id: string
        }
        Returns: Json
      }
      accept_employee_invite: {
        Args: {
          p_invitation_token: string
          p_pin: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      accept_payroll_readiness_warning: {
        Args: {
          p_employee_id: string
          p_period_end: string
          p_period_start: string
          p_reason: string
          p_restaurant_id: string
          p_warning_code: string
        }
        Returns: Json
      }
      active_membership_role: {
        Args: { p_profile_id: string; p_restaurant_id: string }
        Returns: string
      }
      actuals_snapshot_for_week: {
        Args: { p_restaurant_id: string; p_week_start: string }
        Returns: Json
      }
      admin_dashboard: { Args: never; Returns: Json }
      admin_delete_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      admin_delete_user: { Args: { p_profile_id: string }; Returns: Json }
      admin_set_restaurant_active: {
        Args: { p_active: boolean; p_restaurant_id: string }
        Returns: Json
      }
      admin_set_user_suspended: {
        Args: { p_profile_id: string; p_suspended: boolean }
        Returns: Json
      }
      admin_update_feedback: {
        Args: { p_admin_note?: string; p_feedback_id: string; p_status: string }
        Returns: Json
      }
      am_i_platform_admin: { Args: never; Returns: boolean }
      archive_restaurant_document: {
        Args: { p_document_id: string; p_restaurant_id: string }
        Returns: undefined
      }
      badge_photo_status_to_db: {
        Args: { p_photo_url?: string; p_status: string }
        Returns: string
      }
      begin_restaurant_document_upload: {
        Args: {
          p_access_scope?: string
          p_category: string
          p_document_date?: string
          p_employee_id?: string
          p_expires_on?: string
          p_mime_type: string
          p_note?: string
          p_original_filename: string
          p_restaurant_id: string
          p_size_bytes: number
          p_title: string
        }
        Returns: Json
      }
      build_communications_read_model: {
        Args: { p_employee_id: string; p_restaurant_id: string; p_role: string }
        Returns: Json
      }
      build_employee_operations_read_model: {
        Args: {
          p_employee_id: string
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      build_manager_operations_read_model: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_role: string
          p_to_date: string
        }
        Returns: Json
      }
      build_restaurant_read_model: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      build_team_read_model: {
        Args: { p_restaurant_id: string; p_role: string }
        Returns: Json
      }
      build_workspace_bootstrap_read_model: {
        Args: { p_employee_id: string; p_restaurant_id: string }
        Returns: Json
      }
      calculate_payroll_run: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      cancel_restaurant_document_upload: {
        Args: { p_document_id: string; p_restaurant_id: string }
        Returns: undefined
      }
      check_reservation_availability: {
        Args: {
          p_business_date: string
          p_exclude_reservation_id?: string
          p_local_time: string
          p_party_size: number
          p_preferred_table_id?: string
          p_restaurant_id: string
          p_room_id?: string
          p_service_key: string
        }
        Returns: Json
      }
      clear_owner_onboarding_draft: { Args: never; Returns: Json }
      consume_reservation_public_rate_limit: {
        Args: {
          p_bucket: string
          p_client_hash: string
          p_limit: number
          p_origin: string
          p_public_key: string
          p_window_seconds: number
        }
        Returns: Json
      }
      create_payroll_export_run: {
        Args: {
          p_columns?: Json
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      create_payroll_provider_export: {
        Args: {
          p_payroll_run_id: string
          p_provider_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      create_restaurant_station: {
        Args: { p_label: string; p_restaurant_id: string }
        Returns: Json
      }
      crypt: { Args: { password: string; salt: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      derive_employee_employment_terms: {
        Args: { p_employee_id: string; p_facts: Json; p_restaurant_id: string }
        Returns: Json
      }
      discard_manager_planning_draft: {
        Args: {
          p_expected_revision: number
          p_restaurant_id: string
          p_week_start: string
        }
        Returns: Json
      }
      document_storage_object_access: {
        Args: {
          p_mime_type?: string
          p_object_path: string
          p_operation: string
          p_size_bytes?: number
        }
        Returns: boolean
      }
      employee_invitation_states_for_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      ensure_reservation_public_channel: {
        Args: { p_default_origin: string; p_restaurant_id: string }
        Returns: Json
      }
      finalize_restaurant_document_upload: {
        Args: { p_document_id: string; p_restaurant_id: string }
        Returns: Json
      }
      gen_salt:
        | { Args: { type: string }; Returns: string }
        | { Args: { iter_count: number; type: string }; Returns: string }
      generate_four_digit_pin: { Args: never; Returns: string }
      get_admin_feedback: { Args: never; Returns: Json }
      get_communications_read_model: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_current_memberships: {
        Args: never
        Returns: {
          employee_id: string
          restaurant_id: string
          restaurant_name: string
          role: string
          status: string
          workspace_slug: string
        }[]
      }
      get_employee_employment_terms: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_employee_invitation_context: {
        Args: { p_invitation_token: string; p_restaurant_id: string }
        Returns: Json
      }
      get_employee_operations_read_model: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_insights_cost_rates: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_manager_operations_read_model: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_owner_onboarding_draft: { Args: never; Returns: Json }
      get_payroll_catalogue: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_payroll_export_run: {
        Args: { p_restaurant_id: string; p_run_id: string }
        Returns: Json
      }
      get_payroll_workspace: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_preview_bootstrap: {
        Args: {
          p_employee_id?: string
          p_restaurant_id: string
          p_role: string
        }
        Returns: Json
      }
      get_preview_module: {
        Args: {
          p_employee_id: string
          p_module: string
          p_restaurant_id: string
          p_role: string
        }
        Returns: Json
      }
      get_preview_operations: {
        Args: {
          p_employee_id: string
          p_from_date: string
          p_restaurant_id: string
          p_role: string
          p_to_date: string
        }
        Returns: Json
      }
      get_preview_personas: { Args: { p_restaurant_id: string }; Returns: Json }
      get_push_dispatch_context: {
        Args: {
          p_from_date: string
          p_profile_id: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_reservation_demand: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: {
          business_date: string
          expected_covers: number
          first_arrival: string
          last_arrival: string
          reservation_count: number
          service_key: string
        }[]
      }
      get_reservation_floor_plans: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_reservation_public_channel: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_reservation_setup: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_reservation_workspace: {
        Args: { p_business_date: string; p_restaurant_id: string }
        Returns: Json
      }
      get_restaurant_documents: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_restaurant_read_model: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_team_read_model: { Args: { p_restaurant_id: string }; Returns: Json }
      get_time_entry_payroll_evidence: {
        Args: { p_restaurant_id: string; p_time_entry_id: string }
        Returns: Json
      }
      get_workspace_bootstrap: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_workspace_context: {
        Args: { p_restaurant_id?: string }
        Returns: Json
      }
      import_payroll_provider_return: {
        Args: {
          p_filename: string
          p_payload: Json
          p_payroll_run_id: string
          p_provider_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      is_own_employee: {
        Args: { target_employee_id: string; target_restaurant_id: string }
        Returns: boolean
      }
      is_owner: { Args: { target_restaurant_id: string }; Returns: boolean }
      is_owner_or_manager: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { p_profile_id: string }; Returns: boolean }
      is_restaurant_member: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      is_valid_belgian_niss: { Args: { value: string }; Returns: boolean }
      is_work_week_draft: {
        Args: { p_restaurant_id: string; p_week_start: string }
        Returns: boolean
      }
      list_badge_roster: { Args: { p_restaurant_id: string }; Returns: Json }
      list_badge_roster_station: { Args: { p_token: string }; Returns: Json }
      list_restaurant_stations: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      mark_operational_message: {
        Args: {
          p_acknowledge?: boolean
          p_message_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      normalize_reservation_public_origin: {
        Args: { p_origin: string }
        Returns: string
      }
      payroll_export_field_label: { Args: { p_key: string }; Returns: string }
      payroll_export_run_summaries: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      payroll_money_cents: { Args: { p_amount: number }; Returns: number }
      payroll_readiness_report: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      planning_publish_issues: {
        Args: {
          p_planned_shifts: Json
          p_restaurant_id: string
          p_week_start: string
        }
        Returns: Json
      }
      planning_snapshot_for_week: {
        Args: { p_restaurant_id: string; p_week_start: string }
        Returns: Json
      }
      preview_payroll_export: {
        Args: {
          p_columns?: Json
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      publish_workspace_realtime_event: {
        Args: { p_event: string; p_restaurant_id: string; p_source: string }
        Returns: number
      }
      record_badge_entry: {
        Args: {
          p_badge_token: string
          p_employee_id: string
          p_photo_status?: string
          p_photo_url?: string
          p_restaurant_id: string
          p_service_key?: string
        }
        Returns: Json
      }
      record_badge_entry_station: {
        Args: {
          p_badge_token: string
          p_employee_id: string
          p_photo_status?: string
          p_photo_url?: string
          p_token: string
        }
        Returns: Json
      }
      record_employee_regime_evidence: {
        Args: {
          p_employee_id: string
          p_evidence: Json
          p_restaurant_id: string
        }
        Returns: Json
      }
      record_restaurant_document_download: {
        Args: { p_document_id: string; p_restaurant_id: string }
        Returns: undefined
      }
      register_employee_invitation: {
        Args: {
          p_email: string
          p_employee_id: string
          p_expires_at: string
          p_invited_by_profile_id: string
          p_restaurant_id: string
          p_role: string
          p_token: string
        }
        Returns: Json
      }
      register_push_subscription: {
        Args: {
          p_auth_key: string
          p_device_name?: string
          p_endpoint: string
          p_locale?: string
          p_p256dh: string
          p_restaurant_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      release_expired_reservation_public_holds: {
        Args: { p_restaurant_id: string }
        Returns: number
      }
      require_communications_context: {
        Args: { p_restaurant_id: string }
        Returns: {
          actor_role: string
          employee_id: string
          profile_id: string
        }[]
      }
      require_owner_context: {
        Args: { p_restaurant_id: string }
        Returns: {
          employee_id: string
          profile_id: string
        }[]
      }
      require_owner_or_manager_context: {
        Args: { p_restaurant_id: string }
        Returns: {
          employee_id: string
          profile_id: string
        }[]
      }
      require_platform_admin: { Args: never; Returns: string }
      require_preview_access: {
        Args: { p_employee_id: string; p_restaurant_id: string; p_role: string }
        Returns: undefined
      }
      require_restaurant_manager: {
        Args: { p_restaurant_id: string }
        Returns: {
          actor_role: string
          profile_id: string
        }[]
      }
      require_workspace_read_context: {
        Args: { p_restaurant_id: string }
        Returns: {
          actor_role: string
          employee_id: string
          profile_id: string
        }[]
      }
      reservation_area_instance_label: {
        Args: { p_area_id: string; p_floor_id: string; p_restaurant_id: string }
        Returns: string
      }
      reservation_assignment_candidate: {
        Args: {
          p_ends_at: string
          p_exclude_reservation_id?: string
          p_party_size: number
          p_restaurant_id: string
          p_room_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      reservation_availability_internal: {
        Args: {
          p_business_date: string
          p_exclude_reservation_id?: string
          p_local_time: string
          p_party_size: number
          p_restaurant_id: string
          p_room_id?: string
          p_service_key: string
        }
        Returns: Json
      }
      reservation_exact_table_candidate: {
        Args: {
          p_ends_at: string
          p_exclude_reservation_id: string
          p_party_size: number
          p_preferred_table_id: string
          p_restaurant_id: string
          p_room_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      reservation_local_timestamp: {
        Args: {
          p_business_date: string
          p_local_time: string
          p_restaurant_id: string
        }
        Returns: string
      }
      reservation_operator_availability_internal: {
        Args: {
          p_business_date: string
          p_exclude_reservation_id: string
          p_local_time: string
          p_party_size: number
          p_preferred_table_id: string
          p_restaurant_id: string
          p_room_id: string
          p_service_key: string
        }
        Returns: Json
      }
      reservation_public_area_instance_letter: {
        Args: { p_number: number }
        Returns: string
      }
      reservation_public_channel_context: {
        Args: { p_origin: string; p_public_key: string }
        Returns: {
          channel_id: string
          restaurant_id: string
        }[]
      }
      reservation_public_confirm: {
        Args: {
          p_guest: Json
          p_hold_token: string
          p_idempotency_key: string
          p_origin: string
          p_public_key: string
        }
        Returns: Json
      }
      reservation_public_context: {
        Args: { p_origin: string; p_public_key: string }
        Returns: Json
      }
      reservation_public_create_hold: {
        Args: {
          p_idempotency_key: string
          p_origin: string
          p_public_key: string
          p_request: Json
        }
        Returns: Json
      }
      reservation_public_normalize_origins: {
        Args: { p_origins: string[] }
        Returns: string[]
      }
      reservation_public_release_hold: {
        Args: { p_hold_token: string; p_origin: string; p_public_key: string }
        Returns: Json
      }
      reservation_public_search_availability: {
        Args: {
          p_business_date: string
          p_origin: string
          p_party_size: number
          p_public_key: string
          p_room_id?: string
          p_service_key: string
        }
        Returns: Json
      }
      reservation_public_slot_availability: {
        Args: {
          p_business_date: string
          p_local_time: string
          p_party_size: number
          p_restaurant_id: string
          p_room_id?: string
          p_service_key: string
        }
        Returns: Json
      }
      resolve_operator_reservation_guest: {
        Args: {
          p_guest_id: string
          p_normalized_email: string
          p_normalized_phone: string
          p_restaurant_id: string
        }
        Returns: string
      }
      resolve_payroll_reconciliation: {
        Args: {
          p_explanation: string
          p_reconciliation_id: string
          p_restaurant_id: string
          p_status: string
        }
        Returns: Json
      }
      resolve_station_token: {
        Args: { p_token: string }
        Returns: {
          restaurant_id: string
          station_id: string
        }[]
      }
      revoke_employee_invitation: {
        Args: {
          p_employee_id: string
          p_reason?: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      revoke_employee_invitation_delivery: {
        Args: { p_invitation_id: string; p_reason: string }
        Returns: Json
      }
      revoke_restaurant_station: {
        Args: { p_restaurant_id: string; p_station_id: string }
        Returns: Json
      }
      rotate_reservation_public_channel: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      save_absence_lifecycle: {
        Args: {
          p_absence_id?: string
          p_action?: string
          p_employee_id: string
          p_payload?: Json
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_actuals_lifecycle: {
        Args: { p_action: string; p_payload?: Json; p_restaurant_id: string }
        Returns: Json
      }
      save_employee_availability: {
        Args: {
          p_availability?: Json
          p_employee_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_employee_employment_terms: {
        Args: { p_employee_id: string; p_restaurant_id: string; p_terms: Json }
        Returns: Json
      }
      save_employee_payroll_benefit: {
        Args: {
          p_benefit: Json
          p_employee_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_employee_tax_profile: {
        Args: {
          p_employee_id: string
          p_profile: Json
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_manager_planning: {
        Args: {
          p_allow_conflicts?: boolean
          p_allow_coverage_gaps?: boolean
          p_expected_revision?: number
          p_planned_shifts?: Json
          p_planning_status?: string
          p_reason?: string
          p_restaurant_id: string
          p_week_start: string
          p_weekly_notes?: Json
        }
        Returns: Json
      }
      save_owner_onboarding_draft: {
        Args: { p_draft: Json; p_step: number }
        Returns: Json
      }
      save_payroll_provider_mapping: {
        Args: {
          p_mapping_type: string
          p_payload: Json
          p_provider_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_reservation: {
        Args: { p_reservation: Json; p_restaurant_id: string }
        Returns: Json
      }
      save_reservation_floor_plans: {
        Args: {
          p_combinations?: Json
          p_expected_revision?: number
          p_floors: Json
          p_restaurant_id: string
          p_rooms: Json
          p_tables: Json
        }
        Returns: Json
      }
      save_reservation_public_channel: {
        Args: {
          p_allowed_origins: string[]
          p_enabled: boolean
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_reservation_setup: {
        Args: {
          p_combinations?: Json
          p_exceptions?: Json
          p_expected_revision?: number
          p_restaurant_id: string
          p_rooms: Json
          p_services: Json
          p_tables: Json
        }
        Returns: Json
      }
      save_restaurant_model: {
        Args: {
          p_area_service_defaults?: Json
          p_areas?: Json
          p_coverage_requirements?: Json
          p_job_functions?: Json
          p_opening_hours?: Json
          p_restaurant?: Json
          p_restaurant_id: string
          p_settings?: Json
        }
        Returns: Json
      }
      save_restaurant_payroll_configuration: {
        Args: { p_configuration: Json; p_restaurant_id: string }
        Returns: Json
      }
      save_team_model: {
        Args: {
          p_access?: Json
          p_contacts?: Json
          p_contracts?: Json
          p_employee_job_functions?: Json
          p_employees?: Json
          p_legal_profiles?: Json
          p_payroll_profiles?: Json
          p_recurring_schedule_slots?: Json
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_team_workspace: {
        Args: {
          p_access?: Json
          p_contacts?: Json
          p_contracts?: Json
          p_employee_job_functions?: Json
          p_employees?: Json
          p_employment_terms?: Json
          p_legal_profiles?: Json
          p_payroll_profiles?: Json
          p_recurring_schedule_slots?: Json
          p_restaurant_id: string
        }
        Returns: Json
      }
      save_time_entry_payroll_evidence: {
        Args: {
          p_actual_area_id: string
          p_actual_job_function_id: string
          p_break_intervals: Json
          p_reason: string
          p_restaurant_id: string
          p_time_entry_id: string
        }
        Returns: Json
      }
      save_venue_model: {
        Args: {
          p_area_service_defaults: Json
          p_areas: Json
          p_combinations?: Json
          p_coverage_requirements: Json
          p_expected_revision?: number
          p_floors: Json
          p_job_functions: Json
          p_opening_hours: Json
          p_restaurant: Json
          p_restaurant_id: string
          p_rooms: Json
          p_settings: Json
          p_tables: Json
        }
        Returns: Json
      }
      save_work_pattern_exception_lifecycle: {
        Args: {
          p_action?: string
          p_employee_id: string
          p_payload?: Json
          p_restaurant_id: string
          p_work_pattern_exception_id?: string
        }
        Returns: Json
      }
      send_operational_message: {
        Args: {
          p_acknowledgement_required?: boolean
          p_body: string
          p_employee_ids?: string[]
          p_priority?: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      service_key_from_display: { Args: { value: string }; Returns: string }
      set_employee_access_state: {
        Args: {
          p_action: string
          p_employee_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      set_own_pin: {
        Args: { p_new_pin: string; p_restaurant_id?: string }
        Returns: Json
      }
      set_payroll_export_columns: {
        Args: { p_columns: Json; p_restaurant_id: string }
        Returns: Json
      }
      set_payroll_run_status: {
        Args: {
          p_payroll_run_id: string
          p_restaurant_id: string
          p_status: string
        }
        Returns: Json
      }
      set_reservation_status: {
        Args: {
          p_comment?: string
          p_expected_revision?: number
          p_reservation_id: string
          p_restaurant_id: string
          p_status: string
        }
        Returns: Json
      }
      set_restaurant_logo: {
        Args: { p_logo_path: string; p_restaurant_id: string }
        Returns: Json
      }
      setup_owner_workspace: {
        Args: {
          p_areas?: Json
          p_city?: string
          p_coverage?: Json
          p_employees?: Json
          p_job_functions?: Json
          p_opening_hours?: Json
          p_owner_email: string
          p_owner_first_name: string
          p_owner_last_name: string
          p_restaurant_name: string
        }
        Returns: Json
      }
      slugify_workspace: { Args: { input: string }; Returns: string }
      submit_pilot_feedback: {
        Args: {
          p_actor_role: string
          p_app_release: string
          p_category: string
          p_locale: string
          p_message: string
          p_page_path: string
          p_restaurant_id: string
          p_user_agent: string
          p_viewport: string
        }
        Returns: Json
      }
      unique_workspace_slug: { Args: { base_name: string }; Returns: string }
      unregister_push_subscription: {
        Args: { p_endpoint: string }
        Returns: Json
      }
      update_own_profile: {
        Args: { p_first_name: string; p_last_name: string }
        Returns: Json
      }
      update_restaurant_document: {
        Args: {
          p_access_scope?: string
          p_category: string
          p_document_date?: string
          p_document_id: string
          p_employee_id?: string
          p_expires_on?: string
          p_note?: string
          p_restaurant_id: string
          p_title: string
        }
        Returns: undefined
      }
      validate_employee_employment_terms: {
        Args: {
          p_employee_id: string
          p_employment_terms_id: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      validate_restaurant_payroll_configuration: {
        Args: { p_configuration_id: string; p_restaurant_id: string }
        Returns: Json
      }
      verify_badge_pin: {
        Args: { p_employee_id: string; p_pin: string; p_restaurant_id: string }
        Returns: Json
      }
      verify_badge_pin_station: {
        Args: { p_employee_id: string; p_pin: string; p_token: string }
        Returns: Json
      }
      week_start_for_date: { Args: { p_date: string }; Returns: string }
    }
    Enums: {
      actuals_status: "open" | "approved" | "locked"
      availability_submission_status: "draft" | "submitted"
      contract_duration_kind:
        | "indefinite"
        | "fixed_term"
        | "defined_work"
        | "replacement"
      employment_payroll_regime:
        | "ordinary"
        | "flexi"
        | "student"
        | "student_reduced"
        | "student_ordinary"
        | "horeca_occasional"
        | "interim"
        | "self_employed"
      employment_volume: "full_time" | "part_time"
      legal_schedule_type: "fixed" | "variable"
      operational_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      planned_shift_source: "manual" | "copied" | "template"
      planning_status: "draft" | "published"
      salary_basis:
        | "hourly"
        | "monthly"
        | "service_percentage"
        | "tip_or_service_forfait"
      service_availability_state: "available" | "partial" | "unavailable"
      time_entry_source: "badge_terminal" | "manager_manual"
      time_entry_status: "open" | "closed" | "adjusted" | "cancelled"
      weekly_hours_regime: "fixed" | "variable_average"
      work_regime: "fixed_schedule" | "weekly_availability" | "manager_only"
      worker_status: "blue_collar" | "white_collar"
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
      actuals_status: ["open", "approved", "locked"],
      availability_submission_status: ["draft", "submitted"],
      contract_duration_kind: [
        "indefinite",
        "fixed_term",
        "defined_work",
        "replacement",
      ],
      employment_payroll_regime: [
        "ordinary",
        "flexi",
        "student",
        "student_reduced",
        "student_ordinary",
        "horeca_occasional",
        "interim",
        "self_employed",
      ],
      employment_volume: ["full_time", "part_time"],
      legal_schedule_type: ["fixed", "variable"],
      operational_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      planned_shift_source: ["manual", "copied", "template"],
      planning_status: ["draft", "published"],
      salary_basis: [
        "hourly",
        "monthly",
        "service_percentage",
        "tip_or_service_forfait",
      ],
      service_availability_state: ["available", "partial", "unavailable"],
      time_entry_source: ["badge_terminal", "manager_manual"],
      time_entry_status: ["open", "closed", "adjusted", "cancelled"],
      weekly_hours_regime: ["fixed", "variable_average"],
      work_regime: ["fixed_schedule", "weekly_availability", "manager_only"],
      worker_status: ["blue_collar", "white_collar"],
    },
  },
} as const
