"use client";
import { useEffect } from "react";
import { FiAlertTriangle } from "react-icons/fi";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

// Wraps the root layout — must include <html> and <body>
export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", padding: "20px",
        }}>
          <div style={{
            maxWidth: 440, width: "100%", background: "#fff",
            borderRadius: 16, border: "1px solid #e2e8f0",
            boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: 40, textAlign: "center",
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <FiAlertTriangle size={28} color="#ef4444" />
              </div>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>
              Application error
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>
              Something went wrong at the application level. Please reload the page.
            </p>
            <button
              onClick={reset}
              style={{
                background: "#2563eb", color: "#fff", border: "none",
                borderRadius: 10, padding: "10px 24px", fontSize: 14,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Reload
            </button>
            {process.env.NODE_ENV === "development" && error.message && (
              <pre style={{
                marginTop: 16, textAlign: "left", fontSize: 11,
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 8, padding: 12, color: "#dc2626",
                overflow: "auto", maxHeight: 120, whiteSpace: "pre-wrap",
              }}>
                {error.message}
              </pre>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
