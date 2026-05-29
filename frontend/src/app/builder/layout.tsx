import Navbar from "@/components/Navbar";
import StepBar from "@/components/StepBar";
import SessionGuard from "./SessionGuard";
import AuthGuard from "@/components/AuthGuard";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AuthGuard />
      <SessionGuard />
      <Navbar />
      <StepBar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-6 py-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
