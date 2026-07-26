import { useState } from "react";
import { FileText, Activity, MessageSquareText, Inbox } from "lucide-react";
import { FormList } from "@/components/forms/FormList";
import { AutomationLog } from "@/components/forms/AutomationLog";
import { SubmissionList } from "@/components/forms/SubmissionList";

type MainTab = "submissions" | "forms" | "log";

const MAIN_TABS: { value: MainTab; label: string; icon: React.ElementType }[] = [
  { value: "submissions", label: "Vastaukset", icon: Inbox },
  { value: "forms", label: "Lomakkeet & Automaatiot", icon: FileText },
  { value: "log", label: "Automaatioloki", icon: Activity },
];


export default function FormSubmissions() {
  const [mainTab, setMainTab] = useState<MainTab>("submissions");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <MessageSquareText className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Lomakkeet</h1>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 overflow-x-auto mb-6 bg-surface rounded-xl border border-border p-1">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setMainTab(tab.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                mainTab === tab.value
                  ? "bg-brand text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === "submissions" && <SubmissionList />}
      {mainTab === "forms" && <FormList />}
      {mainTab === "log" && <AutomationLog />}
    </div>
  );
}

