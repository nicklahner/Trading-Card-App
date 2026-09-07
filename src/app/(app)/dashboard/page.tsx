import { auth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div>
      <h2 className="text-xl font-semibold">Dashboard &mdash; Coming in M4</h2>
      <p className="mt-2 text-sm text-muted-foreground">Signed in as {session?.user?.email}</p>
    </div>
  );
}
