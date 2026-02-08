export default function HomeTitlePage() {
  return (
    <main style={{ minHeight: '100vh', padding: 48 }}>
      <div style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>Welcome to NAZWA</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6 }}>
          This is your title page. You can place introductions, announcements,
          quick links, or onboarding steps here.
        </p>

        <div style={{ marginTop: 24 }}>
          <div style={{ padding: 20, borderRadius: 12, border: '1px solid #e5e7eb', background: '#ffffff' }}>
            <h2 style={{ marginTop: 0 }}>Getting started</h2>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>Introduce the course</li>
              <li>Show what’s new</li>
              <li>Link to dashboard, generator, etc.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}