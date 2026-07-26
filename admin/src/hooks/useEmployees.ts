import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Employee, EmployeeRole, InstallerTier, InstallerCalendar, CalendarWeeklySlot, CalendarOverride, ServicePriority } from "@/lib/types";

export function useEmployees(role?: EmployeeRole) {
  return useQuery({
    queryKey: queryKeys.employees.list(role),
    queryFn: async () => {
      let query = supabase
        .from("employees")
        .select("*, employee_service_priorities(id, employee_id, service_id, priority)")
        .order("created_at", { ascending: false });
      if (role) query = query.contains("roles", [role]);
      const { data, error } = await query;
      if (error) throw error;
      return data as Employee[];
    },
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.employees.detail(id),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_service_priorities(id, employee_id, service_id, priority)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Employee | null;
    },
    enabled: !!id,
  });
}

export function useEmployeeByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.employees.byUserId(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("*, employee_service_priorities(id, employee_id, service_id, priority)")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Employee | null) ?? null;
    },
    enabled: !!userId,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      first_name: string;
      last_name: string;
      email: string;
      phone?: string;
      postal_code?: string;
      roles: EmployeeRole[];
      tier?: InstallerTier;
      salary_cents?: number;
      password?: string;
    }) => {
      const { password, ...employeeData } = input;

      // If password provided, create auth user via edge function
      let userId: string | undefined;
      if (password) {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          "create-admin-user",
          { body: { email: input.email, password } }
        );
        if (fnError) throw fnError;
        userId = fnData?.userId;
      }

      const { data, error } = await supabase
        .from("employees")
        .insert({ ...employeeData, user_id: userId || null })
        .select()
        .single();
      if (error) throw error;
      return data as Employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Employee> & { id: string }) => {
      const { error } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: ["employee"] });
      queryClient.invalidateQueries({ queryKey: ["employee-by-user"] });
    },
  });
}

export function useSetServicePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, serviceId, priority }: {
      employeeId: string;
      serviceId: string;
      priority: ServicePriority;
    }) => {
      const { error } = await supabase
        .from("employee_service_priorities")
        .upsert(
          { employee_id: employeeId, service_id: serviceId, priority },
          { onConflict: "employee_id,service_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: ["employee"] });
      queryClient.invalidateQueries({ queryKey: ["employee-by-user"] });
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string | null }) => {
      // Delete auth user if exists
      if (userId) {
        const { error: fnError } = await supabase.functions.invoke("create-admin-user", {
          body: { userId, action: "delete-user" },
        });
        if (fnError) throw fnError;
      }
      // Remove/nullify all references that would block deletion (RESTRICT or no ON DELETE)
      await supabase.from("booking_employees").delete().eq("employee_id", id);
      await supabase.from("employee_commissions").delete().eq("employee_id", id);
      await supabase.from("manual_commissions").delete().eq("employee_id", id);
      await supabase.from("work_protocols").update({ completed_by: null }).eq("completed_by", id);
      await supabase.from("sms_messages").update({ employee_id: null }).eq("employee_id", id);
      await supabase.from("sms_messages").update({ sent_by: null }).eq("sent_by", id);
      await supabase.from("contracts").update({ sold_by_employee_id: null }).eq("sold_by_employee_id", id);
      await supabase.from("bookings").update({ employee_id: null }).eq("employee_id", id);
      await supabase.from("temp_reservations").delete().eq("employee_id", id);
      // Clear per-employee junctions explicitly (in case FK isn't ON DELETE CASCADE)
      await supabase.from("employee_service_priorities").delete().eq("employee_id", id);
      await supabase.from("employee_services").delete().eq("employee_id", id);
      await supabase.from("employee_addon_exclusions").delete().eq("employee_id", id);
      await supabase.from("employee_team_members").delete().eq("employee_id", id);
      // Delete employee's calendars + their children, then the employee
      const { data: cals } = await supabase.from("installer_calendars").select("id").eq("employee_id", id);
      for (const cal of cals ?? []) {
        await supabase.from("calendar_weekly_slots").delete().eq("calendar_id", cal.id);
        await supabase.from("calendar_overrides").delete().eq("calendar_id", cal.id);
        await supabase.from("calendar_services").delete().eq("calendar_id", cal.id);
        await supabase.from("calendar_service_areas").delete().eq("calendar_id", cal.id);
      }
      await supabase.from("installer_calendars").delete().eq("employee_id", id);
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
      queryClient.invalidateQueries({ queryKey: ["employee"] });
    },
  });
}

// Employee's assigned services
export function useEmployeeServices(employeeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.employees.services(employeeId),
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("employee_services")
        .select("*, services(*)")
        .eq("employee_id", employeeId);
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}

export function useSetEmployeeServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, serviceIds }: { employeeId: string; serviceIds: string[] }) => {
      // Delete existing
      await supabase.from("employee_services").delete().eq("employee_id", employeeId);
      // Insert new
      if (serviceIds.length > 0) {
        const { error } = await supabase
          .from("employee_services")
          .insert(serviceIds.map((sid) => ({ employee_id: employeeId, service_id: sid })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-services"] });
    },
  });
}

// Installer calendars
export function useInstallerCalendars(employeeId?: string) {
  return useQuery({
    queryKey: queryKeys.calendars.list(employeeId),
    queryFn: async () => {
      let query = supabase
        .from("installer_calendars")
        .select("*, calendar_services(id, calendar_id, service_id), calendar_service_areas(id, calendar_id, service_area_id)")
        .order("created_at", { ascending: false });
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return data as InstallerCalendar[];
    },
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      service_ids: string[];
      service_area_ids: string[];
      name: string;
    }) => {
      const { service_ids, service_area_ids, ...calendarData } = input;
      const { data, error } = await supabase
        .from("installer_calendars")
        .insert(calendarData)
        .select("*")
        .single();
      if (error) throw error;

      // Insert junction rows
      if (service_ids.length > 0) {
        await supabase.from("calendar_services").insert(
          service_ids.map((sid) => ({ calendar_id: data.id, service_id: sid }))
        );
      }
      if (service_area_ids.length > 0) {
        await supabase.from("calendar_service_areas").insert(
          service_area_ids.map((aid) => ({ calendar_id: data.id, service_area_id: aid }))
        );
      }

      return data as InstallerCalendar;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all });
    },
  });
}

export function useUpdateCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      service_ids?: string[];
      service_area_ids?: string[];
      name?: string;
    }) => {
      const { id, service_ids, service_area_ids, ...updates } = input;

      // Update calendar record (only non-junction fields)
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("installer_calendars")
          .update(updates)
          .eq("id", id);
        if (error) throw error;
      }

      // Sync junction tables (delete + re-insert)
      if (service_ids !== undefined) {
        await supabase.from("calendar_services").delete().eq("calendar_id", id);
        if (service_ids.length > 0) {
          await supabase.from("calendar_services").insert(
            service_ids.map((sid) => ({ calendar_id: id, service_id: sid }))
          );
        }
      }

      if (service_area_ids !== undefined) {
        await supabase.from("calendar_service_areas").delete().eq("calendar_id", id);
        if (service_area_ids.length > 0) {
          await supabase.from("calendar_service_areas").insert(
            service_area_ids.map((aid) => ({ calendar_id: id, service_area_id: aid }))
          );
        }
      }

      // Fetch updated record with joins
      const { data, error: fetchError } = await supabase
        .from("installer_calendars")
        .select("*, calendar_services(id, calendar_id, service_id), calendar_service_areas(id, calendar_id, service_area_id)")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;
      return data as InstallerCalendar;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all });
    },
  });
}

export function useDeleteCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installer_calendars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all });
    },
  });
}

// Weekly slots for a calendar
export function useWeeklySlots(calendarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.calendars.weeklySlots(calendarId),
    queryFn: async () => {
      if (!calendarId) return [];
      const { data, error } = await supabase
        .from("calendar_weekly_slots")
        .select("*")
        .eq("calendar_id", calendarId)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data as CalendarWeeklySlot[];
    },
    enabled: !!calendarId,
  });
}

export function useSetWeeklySlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ calendarId, slots }: {
      calendarId: string;
      slots: { day_of_week: number; start_time: string; end_time: string }[];
    }) => {
      await supabase.from("calendar_weekly_slots").delete().eq("calendar_id", calendarId);
      if (slots.length > 0) {
        const { error } = await supabase
          .from("calendar_weekly_slots")
          .insert(slots.map((s) => ({ calendar_id: calendarId, ...s })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-slots"] });
    },
  });
}

// Calendar overrides
export function useCalendarOverrides(calendarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.calendars.overrides(calendarId),
    queryFn: async () => {
      if (!calendarId) return [];
      const { data, error } = await supabase
        .from("calendar_overrides")
        .select("*")
        .eq("calendar_id", calendarId)
        .order("date");
      if (error) throw error;
      return data as CalendarOverride[];
    },
    enabled: !!calendarId,
  });
}

export function useCreateOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      calendar_id: string;
      date: string;
      start_time: string | null;
      end_time: string | null;
      override_type: "available" | "blocked";
      reason?: string;
    }) => {
      const { error } = await supabase.from("calendar_overrides").insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-overrides"] });
    },
  });
}

export function useDeleteOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calendar_overrides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-overrides"] });
    },
  });
}
