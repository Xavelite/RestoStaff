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
          actor_profile_id: string
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          restaurant_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          actor_profile_id: string
          created_at?: string
          employee_id: string
          expires_at: string
          id?: string
          restaurant_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          actor_profile_id?: string
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          restaurant_id?: string
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
          employee_id: string
          is_primary: boolean
          job_function_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          employee_id: string
          is_primary?: boolean
          job_function_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          employee_id?: string
          is_primary?: boolean
          job_function_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
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
      job_functions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          estimated_hourly_cost: number
          id: string
          metadata: Json
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          estimated_hourly_cost?: number
          id?: string
          metadata?: Json
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          estimated_hourly_cost?: number
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
            foreignKeyName: "notification_feed_states_membership_fk"
            columns: ["restaurant_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "restaurant_memberships"
            referencedColumns: ["restaurant_id", "profile_id"]
          },
          {
            foreignKeyName: "notification_feed_states_notification_type_fkey"
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
          code: string
          created_at: string
          id: string
          name: string
          notes: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_employee_invite: {
        Args: {
          p_invitation_token: string
          p_pin: string
          p_restaurant_id: string
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
      badge_photo_status_to_db: {
        Args: { p_photo_url?: string; p_status: string }
        Returns: string
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
      clear_owner_onboarding_draft: { Args: never; Returns: Json }
      create_payroll_export_run: {
        Args: {
          p_columns?: Json
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      crypt: { Args: { password: string; salt: string }; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      employee_invitation_states_for_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      gen_salt:
        | { Args: { type: string }; Returns: string }
        | { Args: { iter_count: number; type: string }; Returns: string }
      generate_four_digit_pin: { Args: never; Returns: string }
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
      get_manager_operations_read_model: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_owner_onboarding_draft: { Args: never; Returns: Json }
      get_payroll_export_run: {
        Args: { p_restaurant_id: string; p_run_id: string }
        Returns: Json
      }
      get_restaurant_read_model: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_team_read_model: { Args: { p_restaurant_id: string }; Returns: Json }
      get_workspace_bootstrap: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_workspace_context: {
        Args: { p_restaurant_id?: string }
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
      is_restaurant_member: {
        Args: { target_restaurant_id: string }
        Returns: boolean
      }
      is_work_week_draft: {
        Args: { p_restaurant_id: string; p_week_start: string }
        Returns: boolean
      }
      list_badge_roster: { Args: { p_restaurant_id: string }; Returns: Json }
      payroll_export_field_label: { Args: { p_key: string }; Returns: string }
      payroll_export_run_summaries: {
        Args: {
          p_from_date: string
          p_restaurant_id: string
          p_to_date: string
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
      require_workspace_read_context: {
        Args: { p_restaurant_id: string }
        Returns: {
          actor_role: string
          employee_id: string
          profile_id: string
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
      save_manager_planning: {
        Args: {
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
      unique_workspace_slug: { Args: { base_name: string }; Returns: string }
      update_own_profile: {
        Args: { p_first_name: string; p_last_name: string }
        Returns: Json
      }
      verify_badge_pin: {
        Args: { p_employee_id: string; p_pin: string; p_restaurant_id: string }
        Returns: Json
      }
      week_start_for_date: { Args: { p_date: string }; Returns: string }
    }
    Enums: {
      actuals_status: "open" | "approved" | "locked"
      availability_submission_status: "draft" | "submitted"
      operational_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      planned_shift_source: "manual" | "copied" | "template"
      planning_status: "draft" | "published"
      service_availability_state: "available" | "partial" | "unavailable"
      time_entry_source: "badge_terminal" | "manager_manual"
      time_entry_status: "open" | "closed" | "adjusted" | "cancelled"
      work_regime: "fixed_schedule" | "weekly_availability" | "manager_only"
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
      operational_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      planned_shift_source: ["manual", "copied", "template"],
      planning_status: ["draft", "published"],
      service_availability_state: ["available", "partial", "unavailable"],
      time_entry_source: ["badge_terminal", "manager_manual"],
      time_entry_status: ["open", "closed", "adjusted", "cancelled"],
      work_regime: ["fixed_schedule", "weekly_availability", "manager_only"],
    },
  },
} as const
