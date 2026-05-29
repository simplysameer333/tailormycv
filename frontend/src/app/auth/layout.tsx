import Logo from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="w-full bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 h-16 flex items-center">
          <Logo />
        </div>
      </nav>
      <main className="flex-1 flex items-start justify-center px-5 sm:px-6 pt-8 pb-12">
        {children}
      </main>
    </div>
  );
}
