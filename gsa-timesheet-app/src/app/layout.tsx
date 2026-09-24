import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSA Timesheet",
  description: "Internal timesheet, leads and reporting tool.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full flex flex-col overflow-hidden bg-[#f9f9f7] text-[#0b0b0b] font-sans">
        {children}
      </body>
    </html>
  );
}
