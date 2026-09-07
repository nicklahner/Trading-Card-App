import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Card Tracker</h1>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
