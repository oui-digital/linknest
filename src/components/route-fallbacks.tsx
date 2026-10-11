import Link from "next/link";

/**
 * The 404 and error screens, shared by every root layout.
 *
 * The app has two root layouts (the site, and the public page with its own
 * <html lang>), plus a global 404 that renders without any layout, so the
 * markup lives here rather than in one route segment.
 */
export function NotFoundView() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-4 text-lg text-gray-500">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Go home
      </Link>
    </div>
  );
}

export function ErrorView({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <h1 className="text-4xl font-bold text-gray-900">Something went wrong</h1>
      <p className="mt-4 text-gray-500">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Try again
      </button>
    </div>
  );
}
