// Types for the public schema, matching supabase/migrations. Same shape as
// `supabase gen types typescript` output, so it can be regenerated later:
//   npx supabase gen types typescript --project-id <ref> --schema public > lib/database.types.ts
// (then re-add the aliases at the bottom). Update it whenever a migration changes a table.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          owner_id: string;
          place_id: string;
          business_name: string;
          trade: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          phone: string | null;
          website_url: string | null;
          google_maps_url: string | null;
          rating: number | null;
          review_count: number;
          has_website: boolean;
          score_total: number | null;
          score_breakdown: Json | null;
          priority_score: number;
          why_this_lead: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          notes: string | null;
          source_query: string | null;
          first_found_at: string;
          last_refreshed_at: string;
          last_contacted_at: string | null;
          next_follow_up_at: string | null;
          site_status: "none" | "social" | "dead" | "parked" | "blocked" | "ok" | null;
          scored_at: string | null;
          scoring_started_at: string | null;
          score_attempts: number;
          score_error: string | null;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          place_id: string;
          business_name: string;
          trade?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          phone?: string | null;
          website_url?: string | null;
          google_maps_url?: string | null;
          rating?: number | null;
          review_count?: number;
          has_website?: boolean;
          score_total?: number | null;
          score_breakdown?: Json | null;
          priority_score?: number;
          why_this_lead?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          notes?: string | null;
          source_query?: string | null;
          first_found_at?: string;
          last_refreshed_at?: string;
          last_contacted_at?: string | null;
          next_follow_up_at?: string | null;
          site_status?: "none" | "social" | "dead" | "parked" | "blocked" | "ok" | null;
          scored_at?: string | null;
          scoring_started_at?: string | null;
          score_attempts?: number;
          score_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      outreach_log: {
        Row: {
          id: string;
          owner_id: string;
          lead_id: string;
          channel: Database["public"]["Enums"]["outreach_channel"];
          outcome: Database["public"]["Enums"]["outreach_outcome"] | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          lead_id: string;
          channel: Database["public"]["Enums"]["outreach_channel"];
          outcome?: Database["public"]["Enums"]["outreach_outcome"] | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["outreach_log"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "outreach_log_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      search_runs: {
        Row: {
          id: string;
          owner_id: string;
          trade: string;
          city: string;
          state: string;
          radius_m: number;
          results_found: number;
          new_leads_added: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          trade: string;
          city: string;
          state: string;
          radius_m: number;
          results_found?: number;
          new_leads_added?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["search_runs"]["Insert"]>;
        Relationships: [];
      };
      places_usage: {
        Row: {
          owner_id: string;
          day: string;
          request_count: number;
        };
        Insert: {
          owner_id?: string;
          day: string;
          request_count?: number;
        };
        Update: Partial<Database["public"]["Tables"]["places_usage"]["Insert"]>;
        Relationships: [];
      };
      suppression: {
        Row: {
          id: string;
          owner_id: string;
          phone: string | null;
          email: string | null;
          business_name: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          phone?: string | null;
          email?: string | null;
          business_name?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["suppression"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      reserve_places_requests: {
        Args: { requested: number; daily_limit: number };
        Returns: { allowed: boolean; used: number }[];
      };
      set_lead_priorities: {
        Args: { payload: Json };
        Returns: number;
      };
      lead_funnel: {
        Args: { week_start: string };
        Returns: { found_this_week: number; total: number; contacted: number; replied: number; booked: number; won: number }[];
      };
    };
    Enums: {
      lead_status:
        | "new"
        | "queued"
        | "contacted"
        | "replied"
        | "call_booked"
        | "won"
        | "lost"
        | "do_not_contact";
      outreach_channel: "call" | "email" | "text" | "instagram_dm" | "in_person";
      outreach_outcome:
        | "no_answer"
        | "voicemail"
        | "spoke"
        | "interested"
        | "not_interested"
        | "wrong_number"
        | "booked";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// Short aliases used across the app.
type PublicTables = Database["public"]["Tables"];
type PublicEnums = Database["public"]["Enums"];

export type Lead = PublicTables["leads"]["Row"];
export type OutreachLog = PublicTables["outreach_log"]["Row"];
export type SearchRun = PublicTables["search_runs"]["Row"];
export type Suppression = PublicTables["suppression"]["Row"];

export type LeadStatus = PublicEnums["lead_status"];
export type OutreachChannel = PublicEnums["outreach_channel"];
export type OutreachOutcome = PublicEnums["outreach_outcome"];
