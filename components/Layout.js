import Sidebar from './Sidebar';

/**
 * Layout: renders fixed left sidebar and offsets main content.
 */
export default function Layout({ children }) {
  return (
    <div>
      <Sidebar />
      <main className="min-h-screen ml-56">
        {children}
      </main>
    </div>
  );
}