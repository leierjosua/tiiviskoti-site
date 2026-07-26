import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import heic2any from "heic2any";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { ProtocolTemplate, WorkProtocol, ProtocolPhoto } from "@/lib/types";

async function convertToJpegIfNeeded(file: File): Promise<File> {
  const isHeic = file.type === "image/heic" || file.type === "image/heif"
    || /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
  if (!isHeic) return file;

  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 }) as Blob;
  return new File([blob], file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg"), { type: "image/jpeg" });
}

// ─── Templates ───

export function useProtocolTemplates() {
  return useQuery({
    queryKey: queryKeys.protocols.templates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("protocol_templates")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as ProtocolTemplate[];
    },
  });
}

// ─── Protocols by Booking (1:N) ───

export function useProtocolsByBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.protocols.byBooking(bookingId),
    queryFn: async () => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("work_protocols")
        .select("*, protocol_templates(*), protocol_photos(*)")
        .eq("booking_id", bookingId)
        .is("deleted_at", null)
        .order("sequence_number");

      if (error) throw error;
      return (data ?? []) as WorkProtocol[];
    },
    enabled: !!bookingId,
  });
}

// ─── Create Protocol ───

export function useCreateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      booking_id: string;
      template_id: string;
      sequence_number?: number;
      field_data?: Record<string, string | number | boolean>;
    }) => {
      const { data, error } = await supabase
        .from("work_protocols")
        .insert(input)
        .select("*, protocol_templates(*), protocol_photos(*)")
        .single();
      if (error) throw error;
      return data as WorkProtocol;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.protocols.byBooking(data.booking_id) });
    },
  });
}

// ─── Update Protocol ───

export function useUpdateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<WorkProtocol> & { id: string; booking_id: string }) => {
      // Only send actual column fields, not joined relations
      const updates: Record<string, unknown> = {};
      const allowedKeys = [
        "field_data", "notes", "signature_data", "signed_by",
        "customer_signature_data", "customer_signed_by",
        "show_technician",
        "status", "pdf_storage_path", "completed_at", "completed_by",
      ];
      for (const key of allowedKeys) {
        if (key in input) {
          updates[key] = (input as Record<string, unknown>)[key];
        }
      }
      const { error } = await supabase
        .from("work_protocols")
        .update(updates)
        .eq("id", input.id);
      if (error) throw error;
      return { booking_id: input.booking_id };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.protocols.byBooking(result.booking_id) });
    },
  });
}

// ─── Delete (soft) Protocol ───

export function useDeleteProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bookingId }: { id: string; bookingId: string }) => {
      const { error } = await supabase
        .from("work_protocols")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { bookingId };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.protocols.byBooking(result.bookingId) });
    },
  });
}

// ─── Photos ───

export function useProtocolPhotos(protocolId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.protocols.photos(protocolId),
    queryFn: async () => {
      if (!protocolId) return [];
      const { data, error } = await supabase
        .from("protocol_photos")
        .select("*")
        .eq("protocol_id", protocolId)
        .order("sort_order");
      if (error) throw error;
      return data as ProtocolPhoto[];
    },
    enabled: !!protocolId,
  });
}

export function useUploadProtocolPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      protocolId,
      label,
      file,
      sortOrder,
    }: {
      protocolId: string;
      label: string;
      file: File;
      sortOrder: number;
    }) => {
      const converted = await convertToJpegIfNeeded(file);
      const ext = converted.name.split(".").pop() || "jpg";
      const storagePath = `photos/${protocolId}/${Date.now()}_${label.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

      // Remove any existing photo(s) with the same label — re-uploads replace, not duplicate
      const { data: existing } = await supabase
        .from("protocol_photos")
        .select("id, storage_path")
        .eq("protocol_id", protocolId)
        .eq("label", label);
      if (existing && existing.length > 0) {
        await supabase.storage
          .from("protocol-files")
          .remove(existing.map((e) => e.storage_path));
        await supabase
          .from("protocol_photos")
          .delete()
          .in("id", existing.map((e) => e.id));
      }

      const { error: uploadError } = await supabase.storage
        .from("protocol-files")
        .upload(storagePath, converted, { upsert: true });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("protocol_photos")
        .insert({
          protocol_id: protocolId,
          label,
          storage_path: storagePath,
          sort_order: sortOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProtocolPhoto;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.protocols.photos(vars.protocolId) });
      qc.invalidateQueries({ queryKey: ["work-protocol"] });
    },
  });
}

export function useDeleteProtocolPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, storagePath, protocolId }: { id: string; storagePath: string; protocolId: string }) => {
      await supabase.storage.from("protocol-files").remove([storagePath]);
      const { error } = await supabase
        .from("protocol_photos")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { protocolId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.protocols.photos(vars.protocolId) });
      qc.invalidateQueries({ queryKey: ["work-protocol"] });
    },
  });
}
