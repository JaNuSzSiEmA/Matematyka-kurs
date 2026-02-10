import Sidebar from './Sidebar';

/**
 * Layout: renders responsive sidebar (fixed on desktop, collapsible on mobile) and offsets main content.
 */
export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 w-full lg:ml-56">
        {children}
      </main>
    </div>
  );
}