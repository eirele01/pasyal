/**
 * Database types for the `public` schema.
 *
 * Hand-written in M0/M1 to match the migrations in supabase/migrations/
 * (initial schema + M1 trips/members RPCs). After linking the project you
 * can regenerate them with:
 *
 *   supabase gen types typescript --linked > app/types/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type CurrencyCode = string

export interface TripStatus {
  status: 'active' | 'archived'
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          id: string
          name: string
          start_date: string
          end_date: string
          base_currency: CurrencyCode
          owner_id: string
          invite_code: string
          status: 'active' | 'archived'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          start_date: string
          end_date: string
          base_currency?: CurrencyCode
          owner_id: string
          invite_code?: string
          status?: 'active' | 'archived'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          start_date?: string
          end_date?: string
          base_currency?: CurrencyCode
          owner_id?: string
          invite_code?: string
          status?: 'active' | 'archived'
          created_at?: string
        }
        Relationships: []
      }
      trip_members: {
        Row: {
          id: string
          trip_id: string
          user_id: string | null
          display_name: string
          role: 'owner' | 'member' | 'guest'
          sharing_enabled: boolean
          joined_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          user_id?: string | null
          display_name: string
          role?: 'owner' | 'member' | 'guest'
          sharing_enabled?: boolean
          joined_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          user_id?: string | null
          display_name?: string
          role?: 'owner' | 'member' | 'guest'
          sharing_enabled?: boolean
          joined_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          trip_id: string
          title: string
          category: 'lodging' | 'food' | 'transport' | 'activities' | 'shopping' | 'other'
          expense_date: string
          currency: CurrencyCode
          amount_minor: number
          fx_rate: string
          fx_rate_date: string | null
          fx_source: 'auto' | 'manual'
          base_amount_minor: number
          split_type: 'equal' | 'exact' | 'percentage' | 'shares'
          note: string | null
          receipt_path: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          trip_id: string
          title: string
          category?: 'lodging' | 'food' | 'transport' | 'activities' | 'shopping' | 'other'
          expense_date: string
          currency: CurrencyCode
          amount_minor: number
          fx_rate?: string
          fx_rate_date?: string | null
          fx_source?: 'auto' | 'manual'
          base_amount_minor: number
          split_type: 'equal' | 'exact' | 'percentage' | 'shares'
          note?: string | null
          receipt_path?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          trip_id?: string
          title?: string
          category?: 'lodging' | 'food' | 'transport' | 'activities' | 'shopping' | 'other'
          expense_date?: string
          currency?: CurrencyCode
          amount_minor?: number
          fx_rate?: string
          fx_rate_date?: string | null
          fx_source?: 'auto' | 'manual'
          base_amount_minor?: number
          split_type?: 'equal' | 'exact' | 'percentage' | 'shares'
          note?: string | null
          receipt_path?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      expense_payers: {
        Row: {
          id: string
          expense_id: string
          member_id: string
          amount_minor: number
        }
        Insert: {
          id?: string
          expense_id: string
          member_id: string
          amount_minor: number
        }
        Update: {
          id?: string
          expense_id?: string
          member_id?: string
          amount_minor?: number
        }
        // FK expense_id → expenses.id (inline in the M0 migration; Postgres
        // default name). Lets the parser type expenses.select('expense_payers(*)').
        Relationships: [
          {
            foreignKeyName: 'expense_payers_expense_id_fkey',
            columns: ['expense_id'],
            isOneToOne: false,
            referencedRelation: 'expenses',
            referencedColumns: ['id'],
          },
        ]
      }
      expense_splits: {
        Row: {
          id: string
          expense_id: string
          member_id: string
          owed_base_minor: number
          weight_or_percent_or_exact: string | null
        }
        Insert: {
          id?: string
          expense_id: string
          member_id: string
          owed_base_minor: number
          weight_or_percent_or_exact?: string | null
        }
        Update: {
          id?: string
          expense_id?: string
          member_id?: string
          owed_base_minor?: number
          weight_or_percent_or_exact?: string | null
        }
        // FK expense_id → expenses.id (see expense_payers above).
        Relationships: [
          {
            foreignKeyName: 'expense_splits_expense_id_fkey',
            columns: ['expense_id'],
            isOneToOne: false,
            referencedRelation: 'expenses',
            referencedColumns: ['id'],
          },
        ]
      }
      settlements: {
        Row: {
          id: string
          trip_id: string
          from_member_id: string
          to_member_id: string
          amount_base_minor: number
          status: 'recorded' | 'confirmed'
          created_at: string
          confirmed_at: string | null
        }
        Insert: {
          id?: string
          trip_id: string
          from_member_id: string
          to_member_id: string
          amount_base_minor: number
          status?: 'recorded' | 'confirmed'
          created_at?: string
          confirmed_at?: string | null
        }
        Update: {
          id?: string
          trip_id?: string
          from_member_id?: string
          to_member_id?: string
          amount_base_minor?: number
          status?: 'recorded' | 'confirmed'
          created_at?: string
          confirmed_at?: string | null
        }
        Relationships: []
      }
      itinerary_days: {
        Row: {
          id: string
          trip_id: string
          day_index: number
          date: string
          title: string | null
        }
        Insert: {
          id?: string
          trip_id: string
          day_index: number
          date: string
          title?: string | null
        }
        Update: {
          id?: string
          trip_id?: string
          day_index?: number
          date?: string
          title?: string | null
        }
        Relationships: []
      }
      itinerary_items: {
        Row: {
          id: string
          trip_id: string
          day_id: string
          sort_order: number
          title: string
          description: string | null
          start_time: string | null
          end_time: string | null
          place_name: string | null
          address: string | null
          lat: number | null
          lng: number | null
          external_url: string | null
          category: string | null
          created_by: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          day_id: string
          sort_order?: number
          title: string
          description?: string | null
          start_time?: string | null
          end_time?: string | null
          place_name?: string | null
          address?: string | null
          lat?: number | null
          lng?: number | null
          external_url?: string | null
          category?: string | null
          created_by?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          day_id?: string
          sort_order?: number
          title?: string
          description?: string | null
          start_time?: string | null
          end_time?: string | null
          place_name?: string | null
          address?: string | null
          lat?: number | null
          lng?: number | null
          external_url?: string | null
          category?: string | null
          created_by?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        // FK updated_by → profiles.id — the itinerary screen embeds
        // `updated_by_profile:profiles!itinerary_items_updated_by_fkey`
        // for the "edited by" indicator (FR-ITN-06).
        Relationships: [
          {
            foreignKeyName: 'itinerary_items_updated_by_fkey',
            columns: ['updated_by'],
            isOneToOne: false,
            referencedRelation: 'profiles',
            referencedColumns: ['id'],
          },
        ]
      }
      member_locations: {
        Row: {
          trip_id: string
          member_id: string
          lat: number
          lng: number
          accuracy_m: number | null
          heading: number | null
          updated_at: string
        }
        Insert: {
          trip_id: string
          member_id: string
          lat: number
          lng: number
          accuracy_m?: number | null
          heading?: number | null
          updated_at?: string
        }
        Update: {
          trip_id?: string
          member_id?: string
          lat?: number
          lng?: number
          accuracy_m?: number | null
          heading?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          id: string
          rate_date: string
          base: CurrencyCode
          quote: CurrencyCode
          rate: string
          fetched_at: string
        }
        Insert: {
          id?: string
          rate_date: string
          base: CurrencyCode
          quote: CurrencyCode
          rate: string
          fetched_at?: string
        }
        Update: {
          id?: string
          rate_date?: string
          base?: CurrencyCode
          quote?: CurrencyCode
          rate?: string
          fetched_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: CurrencyCode
          name: string
          minor_unit_exponent: number
          enabled_for_trips: boolean
        }
        Insert: {
          code: CurrencyCode
          name: string
          minor_unit_exponent: number
          enabled_for_trips?: boolean
        }
        Update: {
          code?: CurrencyCode
          name?: string
          minor_unit_exponent?: number
          enabled_for_trips?: boolean
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          id: string
          trip_id: string
          actor_member_id: string | null
          action: string
          entity: string
          entity_id: string | null
          summary: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          actor_member_id?: string | null
          action: string
          entity: string
          entity_id?: string | null
          summary: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          actor_member_id?: string | null
          action?: string
          entity?: string
          entity_id?: string | null
          summary?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      // ── M1: trips, invitations, guests and members (SPEC §14.2) ──
      create_trip: {
        Args: { p_name: string; p_start_date: string; p_end_date: string; p_base_currency?: string }
        Returns: string // trip id (uuid)
      }
      get_invite_preview: {
        Args: { p_code: string }
        Returns: InvitePreviewRow[]
      }
      join_trip_by_invite: {
        Args: { p_code: string; p_claim_member_id?: string }
        Returns: string // trip id (uuid)
      }
      regenerate_invite_code: {
        Args: { p_trip_id: string }
        Returns: string // new invite code
      }
      member_balances: {
        Args: { p_trip_id: string }
        Returns: MemberBalanceRow[]
      }
      my_trips_summary: {
        Args: Record<string, never>
        Returns: MyTripSummaryRow[]
      }
      remove_trip_member: {
        Args: { p_member_id: string; p_force?: boolean }
        Returns: undefined
      }
      leave_trip: {
        Args: { p_trip_id: string; p_force?: boolean }
        Returns: undefined
      }
      // ── M2: expenses and settlement core (SPEC §14.2) ──
      save_expense: {
        Args: SaveExpenseArgs
        Returns: string // expense id (uuid)
      }
      delete_expense: {
        Args: { p_expense_id: string }
        Returns: undefined
      }
      confirm_settlement: {
        Args: { p_settlement_id: string }
        Returns: undefined
      }
      // ── M3: itinerary and map (SPEC §14.2) ──
      add_itinerary_day: {
        Args: { p_trip_id: string }
        Returns: string // new day id (uuid)
      }
      reorder_itinerary_items: {
        // NOTE: must stay a Record — an array-typed Args breaks the
        // supabase-js GenericFunction contract and silently collapses the
        // whole schema's typing (found in the M6 hardening typecheck pass).
        Args: { p_trip_id: string; p_items: ReorderItemInput[] }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Trip = Database['public']['Tables']['trips']['Row']
export type TripMember = Database['public']['Tables']['trip_members']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']

/** Row shape returned by the get_invite_preview RPC (FR-MEM-01). */
export interface InvitePreviewRow {
  trip_id: string
  name: string
  start_date: string
  end_date: string
  base_currency: string
  status: 'active' | 'archived'
  owner_name: string
  member_count: number
  /** Unclaimed guest rows offered on the join screen (FR-MEM-04). */
  guests_unclaimed: { member_id: string; display_name: string }[]
  can_join: 'ok' | 'already_member' | 'archived' | 'full' | 'unverified_email'
}

/** Row shape returned by the member_balances RPC (SPEC §6.4). */
export interface MemberBalanceRow {
  member_id: string
  display_name: string
  role: 'owner' | 'member' | 'guest'
  paid_minor: number
  owed_minor: number
  received_minor: number
  sent_minor: number
  net_minor: number
}

/** Row shape returned by the split computations (internal mirror of the SQL engine). */
export interface SplitShareRow {
  memberId: string
  owedBaseMinor: number
}

/** save_expense payer row (FR-EXP-06). */
export interface ExpensePayerInput {
  member_id: string
  amount_minor: number
}

/** save_expense participant row (§6.2; value semantics per split type). */
export interface ExpenseParticipantInput {
  member_id: string
  value?: number | null
}

// NOTE: must be a type ALIAS, not an interface — supabase-js's
// GenericFunction requires RPC Args to satisfy Record<string, unknown>,
// and interfaces don't get implicit index signatures (interfaces stay
// fine everywhere else).
export type SaveExpenseArgs = {
  p_trip_id: string
  p_expense_id?: string | null
  p_title: string
  p_category?: string
  p_expense_date: string
  p_currency?: string | null
  p_amount_minor: number
  p_note?: string | null
  p_payers: ExpensePayerInput[]
  p_split_type: 'equal' | 'exact' | 'percentage' | 'shares'
  p_participants: ExpenseParticipantInput[]
}

/** Row shape returned by the my_trips_summary RPC (FR-TRIP-03). */
export interface MyTripSummaryRow {
  trip_id: string
  name: string
  start_date: string
  end_date: string
  status: 'active' | 'archived'
  base_currency: string
  my_role: 'owner' | 'member' | 'guest'
  member_count: number
  my_net_minor: number
}

// ── M2 row types (expenses and settlement core, SPEC §14.2) ──
export type ExpensePayer = Database['public']['Tables']['expense_payers']['Row']
export type ExpenseSplit = Database['public']['Tables']['expense_splits']['Row']
export type Settlement = Database['public']['Tables']['settlements']['Row']
export type ActivityLogRow = Database['public']['Tables']['activity_log']['Row']

/** An expense with its payers and splits as loaded by the list screens. */
export interface ExpenseWithChildren extends Expense {
  expense_payers: ExpensePayer[]
  expense_splits: ExpenseSplit[]
}

// ── M3 row types (itinerary and map, SPEC §14.2) ──
export type ItineraryDay = Database['public']['Tables']['itinerary_days']['Row']
export type ItineraryItem = Database['public']['Tables']['itinerary_items']['Row']

/** reorder_itinerary_items entry: new day + position for one item (FR-ITN-04). */
export interface ReorderItemInput {
  id: string
  day_id: string
  sort_order: number
}

/**
 * An itinerary item with the editor's display name, as loaded by the
 * itinerary screen (FR-ITN-06 "edited by" indicator).
 */
export interface ItemWithEditor extends ItineraryItem {
  updated_by_name: string | null
}

/** Normalized place-search suggestion (FR-MAP-03, provider-agnostic). */
export interface PlaceSuggestion {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}
