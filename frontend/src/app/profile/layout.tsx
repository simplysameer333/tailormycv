import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AuthGuard />
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-6 py-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
