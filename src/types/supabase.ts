export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          business_name: string;
          category: string | null;
          industry: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          social: string | null;
          rating: number | null;
          review_count: number | null;
          web_exists: boolean | null;
          web_quality: string | null;
          source_link: string | null;
          city: string | null;
          google_maps_url: string | null;
          lead_score: number | null;
          service_tier: "Starter" | "Business" | "Premium" | "Platform" | null;
          price_range: string | null;
          set_price: number | null;
          country: string | null;
          currency: string | null;
          address: string | null;
          assigned_to: string | null;
          claimed_at: string | null;
          status:
            | "uncontacted"
            | "contacted"
            | "demo_sent"
            | "negotiating"
            | "closed"
            | "lost";
          demo_url: string | null;
          deal_amount: number | null;
          commission_rate: number | null;
          commission_amount: number | null;
          loss_reason:
            | "price_too_high"
            | "not_interested"
            | "no_response"
            | "went_with_competitor"
            | "other"
            | null;
          last_verified: string | null;
          created_at: string;
          google_place_id: string | null;
          follow_up_date: string | null;
          follow_up_note: string | null;
          follow_up_set_by: string | null;
          follow_up_set_at: string | null;
          loss_reason_detail: string | null;
          loss_reason_price: number | null;
        };
        Insert: {
          id?: string;
          business_name: string;
          category?: string | null;
          industry?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          social?: string | null;
          rating?: number | null;
          review_count?: number | null;
          web_exists?: boolean | null;
          web_quality?: string | null;
          source_link?: string | null;
          city?: string | null;
          google_maps_url?: string | null;
          lead_score?: number | null;
          service_tier?: "Starter" | "Business" | "Premium" | "Platform" | null;
          price_range?: string | null;
          set_price?: number | null;
          country?: string | null;
          currency?: string | null;
          address?: string | null;
          assigned_to?: string | null;
          claimed_at?: string | null;
          status?:
            | "uncontacted"
            | "contacted"
            | "demo_sent"
            | "negotiating"
            | "closed"
            | "lost";
          demo_url?: string | null;
          deal_amount?: number | null;
          commission_rate?: number | null;
          commission_amount?: number | null;
          loss_reason?:
            | "price_too_high"
            | "not_interested"
            | "no_response"
            | "went_with_competitor"
            | "other"
            | null;
          last_verified?: string | null;
          created_at?: string;
          google_place_id?: string | null;
          follow_up_date?: string | null;
          follow_up_note?: string | null;
          follow_up_set_by?: string | null;
          follow_up_set_at?: string | null;
          loss_reason_detail?: string | null;
          loss_reason_price?: number | null;
        };
        Update: {
          id?: string;
          business_name?: string;
          category?: string | null;
          industry?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          social?: string | null;
          rating?: number | null;
          review_count?: number | null;
          web_exists?: boolean | null;
          web_quality?: string | null;
          source_link?: string | null;
          city?: string | null;
          google_maps_url?: string | null;
          lead_score?: number | null;
          service_tier?: "Starter" | "Business" | "Premium" | "Platform" | null;
          price_range?: string | null;
          set_price?: number | null;
          country?: string | null;
          currency?: string | null;
          address?: string | null;
          assigned_to?: string | null;
          claimed_at?: string | null;
          status?:
            | "uncontacted"
            | "contacted"
            | "demo_sent"
            | "negotiating"
            | "closed"
            | "lost";
          demo_url?: string | null;
          deal_amount?: number | null;
          commission_rate?: number | null;
          commission_amount?: number | null;
          loss_reason?:
            | "price_too_high"
            | "not_interested"
            | "no_response"
            | "went_with_competitor"
            | "other"
            | null;
          last_verified?: string | null;
          created_at?: string;
          google_place_id?: string | null;
          follow_up_date?: string | null;
          follow_up_note?: string | null;
          follow_up_set_by?: string | null;
          follow_up_set_at?: string | null;
          loss_reason_detail?: string | null;
          loss_reason_price?: number | null;
        };
      };
      agents: {
        Row: {
          id: string;
          auth_user_id: string;
          agent_code: string;
          full_name: string;
          email: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          agent_code: string;
          full_name: string;
          email: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          agent_code?: string;
          full_name?: string;
          email?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      deals: {
        Row: {
          id: string;
          lead_id: string;
          agent_id: string;
          deal_amount: number;
          commission_rate: number;
          commission_amount: number;
          closed_at: string;
          payout_month: string;
          payout_status: "pending" | "paid";
          payment_confirmed: boolean;
          payment_confirmed_at: string | null;
          // ── Payment instalment tracking (added via migration) ──────────
          service_tier: string | null;
          payment_60_confirmed: boolean;
          payment_60_confirmed_at: string | null;
          payment_60_link: string | null;
          payment_60_amount: number | null;
          payment_40_confirmed: boolean;
          payment_40_confirmed_at: string | null;
          payment_40_link: string | null;
          payment_40_amount: number | null;
          // ── Bachs checkout tracking ────────────────────────────────
          set_price: number | null;
          payment_60_checkout_id: string | null;
          payment_60_link_created_at: string | null;
          payment_40_checkout_id: string | null;
          payment_40_link_created_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          agent_id: string;
          deal_amount: number;
          commission_rate?: number;
          commission_amount?: number;
          closed_at?: string;
          payout_month?: string;
          payout_status?: "pending" | "paid";
          payment_confirmed?: boolean;
          payment_confirmed_at?: string | null;
          service_tier?: string | null;
          payment_60_confirmed?: boolean;
          payment_60_confirmed_at?: string | null;
          payment_60_link?: string | null;
          payment_60_amount?: number | null;
          payment_40_confirmed?: boolean;
          payment_40_confirmed_at?: string | null;
          payment_40_link?: string | null;
          payment_40_amount?: number | null;
          set_price?: number | null;
          payment_60_checkout_id?: string | null;
          payment_60_link_created_at?: string | null;
          payment_40_checkout_id?: string | null;
          payment_40_link_created_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          agent_id?: string;
          deal_amount?: number;
          commission_rate?: number;
          commission_amount?: number;
          closed_at?: string;
          payout_month?: string;
          payout_status?: "pending" | "paid";
          payment_confirmed?: boolean;
          payment_confirmed_at?: string | null;
          service_tier?: string | null;
          payment_60_confirmed?: boolean;
          payment_60_confirmed_at?: string | null;
          payment_60_link?: string | null;
          payment_60_amount?: number | null;
          payment_40_confirmed?: boolean;
          payment_40_confirmed_at?: string | null;
          payment_40_link?: string | null;
          payment_40_amount?: number | null;
          set_price?: number | null;
          payment_60_checkout_id?: string | null;
          payment_60_link_created_at?: string | null;
          payment_40_checkout_id?: string | null;
          payment_40_link_created_at?: string | null;
          created_at?: string;
        };
      };
      payouts: {
        Row: {
          id: string;
          agent_id: string;
          month: string;
          total_commission: number;
          status: "pending" | "paid";
          paid_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          agent_id: string;
          month: string;
          total_commission: number;
          status?: "pending" | "paid";
          paid_at?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          agent_id?: string;
          month?: string;
          total_commission?: number;
          status?: "pending" | "paid";
          paid_at?: string | null;
          notes?: string | null;
        };
      };
      activity_log: {
        Row: {
          id: string;
          agent_id: string;
          lead_id: string | null;
          action:
            | "claimed"
            | "contacted"
            | "demo_sent"
            | "stage_updated"
            | "closed"
            | "lost"
            | "auto_released"
            | "manually_released";
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          lead_id?: string | null;
          action:
            | "claimed"
            | "contacted"
            | "demo_sent"
            | "stage_updated"
            | "closed"
            | "lost"
            | "auto_released"
            | "manually_released";
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          lead_id?: string | null;
          action?:
            | "claimed"
            | "contacted"
            | "demo_sent"
            | "stage_updated"
            | "closed"
            | "lost"
            | "auto_released"
            | "manually_released";
          metadata?: Json | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          agent_id: string;
          type:
            | "new_lead"
            | "auto_released"
            | "payout_processed"
            | "early_payout_approved"
            | "early_payout_denied"
            | "payment_confirmed"
            | "deal_closed_confirmation";
          title: string;
          message: string;
          is_read: boolean;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          type:
            | "new_lead"
            | "auto_released"
            | "payout_processed"
            | "early_payout_approved"
            | "early_payout_denied"
            | "payment_confirmed"
            | "deal_closed_confirmation";
          title: string;
          message: string;
          is_read?: boolean;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          type?:
            | "new_lead"
            | "auto_released"
            | "payout_processed"
            | "early_payout_approved"
            | "early_payout_denied"
            | "payment_confirmed"
            | "deal_closed_confirmation";
          title?: string;
          message?: string;
          is_read?: boolean;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      contact_inquiries: {
        Row: {
          id: string;
          full_name: string;
          business_name: string;
          phone: string;
          email: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          business_name: string;
          phone: string;
          email: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          business_name?: string;
          phone?: string;
          email?: string;
          message?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_lead: {
        Args: { p_lead_id: string; p_agent_id: string };
        Returns: {
          success: boolean;
          message: string;
          claimed_by: string | null;
        };
      };
      monthly_payout_summary: {
        Args: { p_month: string };
        Returns: Array<{
          agent_id: string;
          agent_code: string;
          full_name: string;
          total_deals: number;
          total_commission: number;
          payout_status: string;
        }>;
      };
      calculate_commission: {
        Args: { p_deal_amount: number; p_set_price: number };
        Returns: number;
      };
      auto_release_leads: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      lead_status:
        | "uncontacted"
        | "contacted"
        | "demo_sent"
        | "negotiating"
        | "closed"
        | "lost";
      service_tier: "Starter" | "Business" | "Premium" | "Platform";
      loss_reason_type:
        | "price_too_high"
        | "not_interested"
        | "no_response"
        | "went_with_competitor"
        | "other";
      payout_status: "pending" | "paid";
      activity_action:
        | "claimed"
        | "contacted"
        | "demo_sent"
        | "stage_updated"
        | "closed"
        | "lost"
        | "auto_released"
        | "manually_released";
      notification_type:
        | "new_lead"
        | "auto_released"
        | "payout_processed"
        | "early_payout_approved"
        | "early_payout_denied"
        | "payment_confirmed"
        | "deal_closed_confirmation";
    };
  };
};

// ── Named aliases (for use throughout the app) ──

export type LeadStatus = Database["public"]["Tables"]["leads"]["Row"]["status"];
export type ServiceTier = NonNullable<
  Database["public"]["Tables"]["leads"]["Row"]["service_tier"]
>;
export type LossReason = NonNullable<
  Database["public"]["Tables"]["leads"]["Row"]["loss_reason"]
>;
export type PayoutStatus =
  Database["public"]["Tables"]["deals"]["Row"]["payout_status"];
export type ActivityAction =
  Database["public"]["Tables"]["activity_log"]["Row"]["action"];
export type NotificationType =
  Database["public"]["Tables"]["notifications"]["Row"]["type"];

// ── Row types ──
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Agent = Database["public"]["Tables"]["agents"]["Row"];
export type Deal = Database["public"]["Tables"]["deals"]["Row"];
export type Payout = Database["public"]["Tables"]["payouts"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_log"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
