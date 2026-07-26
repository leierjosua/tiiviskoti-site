import CompletedGig from "@/pages/CompletedGig";

export default function InstallerCompletedGig() {
  return (
    <CompletedGig
      backUrl="/tyontekija/kalenteri"
      successUrlPrefix="/tyontekija/varaukset"
      autoAssignSelf
    />
  );
}
