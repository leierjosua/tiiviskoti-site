import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useCustomerContext(
  email: string | null,
  customerId: string | null,
  excludeTicketId: string
) {
  const prevTickets = useQuery({
    queryKey: ["cs-customer-tickets", email, excludeTicketId],
    queryFn: async () => {
      if (!email) return [];
      const { data, error } = await supabase
        .from("cs_tickets")
        .select("id, ticket_number, subject, status, created_at")
        .eq("customer_email", email)
        .neq("id", excludeTicketId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!email,
  });

  const bookings = useQuery({
    queryKey: ["cs-customer-bookings", customerId, email],
    queryFn: async () => {
      if (!customerId && !email) return [];
      let query = supabase
        .from("bookings")
        .select(
          "id, booking_number, booking_date, status, customers(first_name, last_name, email)"
        )
        .is("deleted_at", null)
        .order("booking_date", { ascending: false })
        .limit(5);

      if (customerId) {
        query = query.eq("customer_id", customerId);
      } else if (email) {
        query = query.eq("customers.email", email);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(customerId || email),
  });

  const contracts = useQuery({
    queryKey: ["cs-customer-contracts", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_number, status, start_date")
        .eq("customer_id", customerId)
        .order("start_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!customerId,
  });

  const formSubs = useQuery({
    queryKey: ["cs-customer-forms", email],
    queryFn: async () => {
      if (!email) return [];
      const { data, error } = await supabase
        .from("form_submissions")
        .select("id, form_slug, status, created_at, message")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!email,
  });

  return {
    prevTickets: prevTickets.data,
    bookings: bookings.data,
    contracts: contracts.data,
    formSubs: formSubs.data,
    isLoading:
      prevTickets.isLoading ||
      bookings.isLoading ||
      contracts.isLoading ||
      formSubs.isLoading,
  };
}
