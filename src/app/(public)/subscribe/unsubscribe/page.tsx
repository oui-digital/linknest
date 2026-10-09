import type { Metadata } from "next";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Unsubscribe — LinkNest",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const { id, token } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-bold">Unsubscribe</h1>
      {id && token ? (
        <>
          <p className="mt-3 text-sm text-gray-600">Press the button to stop receiving these emails.</p>
          <TokenAction
            endpoint="/api/subscribe/unsubscribe"
            payload={{ id, token }}
            buttonLabel="Unsubscribe"
            doneMessage="You're unsubscribed. You won't get further emails from this list."
          />
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-600">This link is incomplete. Open it again from your email.</p>
      )}
    </main>
  );
}
