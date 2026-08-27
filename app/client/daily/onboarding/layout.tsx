import DailyOnboardingModeController from "@/components/daily/DailyOnboardingModeController";

export default function DailyOnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DailyOnboardingModeController />
      {children}
    </>
  );
}
