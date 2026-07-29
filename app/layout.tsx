import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "GSC + GA4 MCP Server",
  description: "Read-only Google Search Console and GA4 monitoring for ChatGPT.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#071c12",
          color: "#f4fff8",
        }}
      >
        {children}
      </body>
    </html>
  );
}
