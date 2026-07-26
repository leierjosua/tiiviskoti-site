import CreateBooking from "@/pages/CreateBooking";

export default function InstallerCreateBooking() {
  return (
    <CreateBooking
      backUrl="/tyontekija/kalenteri"
      successUrlPrefix="/tyontekija/varaukset"
      skipPathSelection
    />
  );
}
