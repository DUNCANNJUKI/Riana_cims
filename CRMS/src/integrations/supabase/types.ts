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
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          action_label: string
          created_at: string
          details: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          previous_value: string | null
          request_id: string
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          action_label: string
          created_at?: string
          details?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          previous_value?: string | null
          request_id: string
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          action_label?: string
          created_at?: string
          details?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          previous_value?: string | null
          request_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          approval_comment: string | null
          assigned_developer_id: string | null
          change_description: string
          client_id: string
          commencement_date: string | null
          sales_remarks: string | null
          completion_date: string | null
          created_at: string
          date_requested: string
          department: string
          estimated_completion_date: string
          id: string
          is_chargeable: boolean | null
          modules_affected: string[]
          priority: Database["public"]["Enums"]["priority_level"]
          senior_developer_id: string
          source: Database["public"]["Enums"]["request_source"]
          status: Database["public"]["Enums"]["request_status"]
          ticket_number: string
          updated_at: string
        }
        Insert: {
          approval_comment?: string | null
          assigned_developer_id?: string | null
          change_description: string
          client_id: string
          commencement_date?: string | null
          commercial_remarks?: string | null
          completion_date?: string | null
          created_at?: string
          date_requested?: string
          department: string
          estimated_completion_date: string
          id?: string
          is_chargeable?: boolean | null
          modules_affected?: string[]
          priority?: Database["public"]["Enums"]["priority_level"]
          senior_developer_id: string
          source: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          ticket_number: string
          updated_at?: string
        }
        Update: {
          approval_comment?: string | null
          assigned_developer_id?: string | null
          change_description?: string
          client_id?: string
          commencement_date?: string | null
          commercial_remarks?: string | null
          completion_date?: string | null
          created_at?: string
          date_requested?: string
          department?: string
          estimated_completion_date?: string
          id?: string
          is_chargeable?: boolean | null
          modules_affected?: string[]
          priority?: Database["public"]["Enums"]["priority_level"]
          senior_developer_id?: string
          source?: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_assigned_developer_id_fkey"
            columns: ["assigned_developer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_senior_developer_id_fkey"
            columns: ["senior_developer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          branch: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          branch: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          branch?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          document_type: string
          file_name: string
          file_url: string | null
          generated_at: string
          id: string
          request_id: string
          signed_by_client: boolean | null
          signed_by_developer: boolean | null
          updated_at: string
        }
        Insert: {
          document_type: string
          file_name: string
          file_url?: string | null
          generated_at?: string
          id?: string
          request_id: string
          signed_by_client?: boolean | null
          signed_by_developer?: boolean | null
          updated_at?: string
        }
        Update: {
          document_type?: string
          file_name?: string
          file_url?: string | null
          generated_at?: string
          id?: string
          request_id?: string
          signed_by_client?: boolean | null
          signed_by_developer?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          email_sent: boolean | null
          id: string
          message: string
          read: boolean
          request_id: string | null
          sms_sent: boolean | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          message: string
          read?: boolean
          request_id?: string | null
          sms_sent?: boolean | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          email_sent?: boolean | null
          id?: string
          message?: string
          read?: boolean
          request_id?: string | null
          sms_sent?: boolean | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "senior_developer" | "developer" | "sales"
      audit_action:
      | "created"
      | "updated"
      | "status_changed"
      | "approved"
      | "rejected"
      | "assigned"
      | "started"
      | "completed"
      | "document_uploaded"
      | "comment_added"
      contract_type: "amc" | "lease" | "warranty" | "poc"
      notification_type: "info" | "success" | "warning" | "error"
      priority_level: "low" | "medium" | "high" | "critical"
      request_source: "email" | "phone" | "whatsapp" | "meeting"
      request_status:
      | "pending_approval"
      | "approved"
      | "rejected"
      | "waiting"
      | "assigned"
      | "in_progress"
      | "completed"
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
      app_role: ["admin", "senior_developer", "developer", "sales"],
      audit_action: [
        "created",
        "updated",
        "status_changed",
        "approved",
        "rejected",
        "assigned",
        "started",
        "completed",
        "document_uploaded",
        "comment_added",
      ],
      contract_type: ["amc", "lease", "warranty", "poc"],
      notification_type: ["info", "success", "warning", "error"],
      priority_level: ["low", "medium", "high", "critical"],
      request_source: ["email", "phone", "whatsapp", "meeting"],
      request_status: [
        "pending_approval",
        "approved",
        "rejected",
        "waiting",
        "assigned",
        "in_progress",
        "completed",
      ],
    },
  },
} as const
