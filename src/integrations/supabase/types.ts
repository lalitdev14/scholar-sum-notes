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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      class_summaries: {
        Row: {
          class_id: string
          key_points: Json
          notes_count: number
          review_note: string
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          summary: string
          updated_at: string
        }
        Insert: {
          class_id: string
          key_points?: Json
          notes_count?: number
          review_note?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          key_points?: Json
          notes_count?: number
          review_note?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_summaries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          professor: string
          subject: string
          term: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          professor: string
          subject: string
          term?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          professor?: string
          subject?: string
          term?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_requests: {
        Row: {
          admin_note: string
          created_at: string
          department: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          university_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string
          created_at?: string
          department?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string
          created_at?: string
          department?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          university_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_requests_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      handwriting_pages: {
        Row: {
          class_id: string
          created_at: string
          id: string
          image_path: string
          transcript: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          image_path: string
          transcript?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          image_path?: string
          transcript?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handwriting_pages_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          class_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          university_id: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          university_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          accent_color: string
          created_at: string
          email_domain: string
          id: string
          name: string
          primary_color: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          email_domain: string
          id?: string
          name: string
          primary_color?: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          email_domain?: string
          id?: string
          name?: string
          primary_color?: string
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
      is_classmate: { Args: { target_class_id: string }; Returns: boolean }
      is_reviewer: { Args: { _user_id: string }; Returns: boolean }
      shares_class_with: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "student" | "faculty"
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
      app_role: ["admin", "student", "faculty"],
    },
  },
} as const
