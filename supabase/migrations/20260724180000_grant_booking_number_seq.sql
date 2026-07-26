-- Fix: booking_number_seq (luotu 20260625120001) jäi ilman GRANTeja, joten
-- INSERT bookings-tauluun kaatui "permission denied for sequence booking_number_seq"
-- (nextval laukeaa booking_number-sarakkeen defaultista jokaisella insertillä).
-- Annetaan sekvenssin käyttöoikeus rooleille jotka luovat varauksia.

grant usage, select on sequence public.booking_number_seq to service_role, authenticated;
