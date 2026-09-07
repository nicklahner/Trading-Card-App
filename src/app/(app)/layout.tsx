import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/db/client';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  const reviewCount = await prisma.item.count({
    where: { status: 'needs_review' },
  });

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b px-6 py-4">
        <nav className="mx-auto flex max-w-5xl items-center gap-6">
          <Link href="/collection" className="text-lg font-semibold">
            Card Tracker
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/collection" className="text-gray-600 hover:text-gray-900">
              Collection
            </Link>
            <Link href="/scan" className="text-gray-600 hover:text-gray-900">
              Scan
            </Link>
            <Link href="/review" className="relative text-gray-600 hover:text-gray-900">
              Review
              {reviewCount > 0 && (
                <span className="absolute -right-5 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-medium text-white">
                  {reviewCount}
                </span>
              )}
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">{children}</main>
    </div>
  );
}
