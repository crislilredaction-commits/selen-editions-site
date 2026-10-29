import DailyOnboardingModeController from "@/components/daily/DailyOnboardingModeController";
import DailyReminderPreferences from "@/components/daily/DailyReminderPreferences";

export default function DailyOnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DailyOnboardingModeController />
      {children}
      <div style={{ padding: "0 1.5rem 4rem" }}>
        <DailyReminderPreferences />
      </div>
    </>
  );
}
