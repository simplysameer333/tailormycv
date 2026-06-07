import Navbar from "./Navbar";
import Footer from "./Footer";
import BottomNav from "./BottomNav";

export default function AppShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`}>
      <Navbar />
      {/* pb-safe adds 4rem padding-bottom on mobile to clear the fixed BottomNav */}
      <div className="flex-1 flex flex-col sm:pb-0 pb-safe">{children}</div>
      <Footer />
      <BottomNav />
    </div>
  );
}
