import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { SmsMessage, SmsConversation } from "@/lib/types";

export function useSmsConversations() {
  return useQuery({
    queryKey: queryKeys.sms.conversations,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data as SmsConversation[];
    },
  });
}

export function useSmsThread(phoneE164: string | null) {
  return useQuery({
    queryKey: queryKeys.sms.thread(phoneE164 ?? ""),
    queryFn: async () => {
      if (!phoneE164) return [];
      const { data, error } = await supabase
        .from("sms_messages")
        .select(
          "*, customers(*), employees!sms_messages_employee_id_fkey(*), bookings(id, booking_number, status, booking_date, services(name)), sender:employees!sms_messages_sent_by_fkey(*)"
        )
        .eq("phone_e164", phoneE164)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as SmsMessage[];
    },
    enabled: !!phoneE164,
  });
}

export function useSendSms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      to: string;
      body: string;
      reference_type?: string;
      reference_id?: string;
      customer_id?: string;
      employee_id?: string;
      booking_id?: string;
      sent_by?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sms.conversations });
      queryClient.invalidateQueries({ queryKey: ["sms-thread"] });
    },
  });
}

export function useMarkSmsRead(phoneE164: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!phoneE164) return;
      const { error } = await supabase
        .from("sms_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("phone_e164", phoneE164)
        .eq("direction", "inbound")
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sms.conversations });
    },
  });
}

/** Subscribe to realtime inserts on sms_messages for a given phone. */
export function useSmsRealtime(phoneE164: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!phoneE164) return;

    const channel = supabase
      .channel(`sms-${phoneE164}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sms_messages",
          filter: `phone_e164=eq.${phoneE164}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.sms.thread(phoneE164),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.sms.conversations,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [phoneE164, queryClient]);
}
