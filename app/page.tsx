export default function Home() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "72px 24px",
        lineHeight: 1.6,
      }}
    >
      <p style={{ color: "#4ade80", fontWeight: 700, letterSpacing: 1 }}>
        MCP SERVER
      </p>
      <h1 style={{ fontSize: 44, lineHeight: 1.1, marginBottom: 20 }}>
        GSC + GA4 Account Monitor
      </h1>
      <p style={{ color: "#c8e6d3", fontSize: 18 }}>
        This read-only MCP server detects search, analytics, conversion, and
        tracking issues across configured client accounts.
      </p>
      <section
        style={{
          marginTop: 36,
          padding: 24,
          border: "1px solid #235c3b",
          borderRadius: 16,
          background: "#0b291a",
        }}
      >
        <strong>MCP endpoint</strong>
        <code
          style={{
            display: "block",
            marginTop: 10,
            color: "#86efac",
            wordBreak: "break-all",
          }}
        >
          /mcp
        </code>
      </section>
    </main>
  );
}
