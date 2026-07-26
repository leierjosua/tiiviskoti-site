import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

export function usePushNotifications(userId: string | undefined) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform() || registeredRef.current) return;

    let cleanup = false;

    async function register() {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted" || cleanup) return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
        if (cleanup) return;

        // Look up employee_id for this user
        const { data: emp } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        await supabase.from("device_tokens").upsert(
          {
            user_id: userId,
            token: token.value,
            platform: "ios",
            active: true,
            employee_id: emp?.id ?? null,
          },
          { onConflict: "user_id,token" },
        );

        registeredRef.current = true;
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration failed:", err);
      });

      // Foreground notification – could show in-app toast
      PushNotifications.addListener("pushNotificationReceived", (_notification) => {
        // Handled by ToastContext or similar if needed
      });

      // User tapped notification – navigate
      PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = action.notification.data;
        if (data?.booking_number) {
          window.location.href = `/varaukset/${data.booking_number}`;
        } else if (data?.opportunity_id) {
          window.location.href = `/myynti/inbound/${data.opportunity_id}`;
        }
      });
    }

    register();

    return () => {
      cleanup = true;
      PushNotifications.removeAllListeners();
    };
  }, [userId]);
}

/** Call on logout to deactivate all tokens for this user */
export async function deactivatePushTokens(userId: string) {
  if (!Capacitor.isNativePlatform()) return;
  await supabase
    .from("device_tokens")
    .update({ active: false })
    .eq("user_id", userId);
}
