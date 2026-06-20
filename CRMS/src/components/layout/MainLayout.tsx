import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-[260px] transition-all duration-300">
        <Header />
        <main className="p-6 max-w-[1600px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
