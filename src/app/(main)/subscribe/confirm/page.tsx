import type { Metadata } from "next";
import { TokenAction } from "../token-action";

export const metadata: Metadata = {
  title: "Confirm your subscription — LinkNest",
  robots: { index: false, follow: false },
};

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-bold">Confirm your subscription</h1>
      {token ? (
        <>
          <p className="mt-3 text-sm text-gray-600">
            Press the button to join the list. You can unsubscribe at any time from any email.
          </p>
          <TokenAction
            endpoint="/api/subscribe/confirm"
            payload={{ token }}
            buttonLabel="Confirm subscription"
            doneMessage="You're subscribed. Thanks!"
          />
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-600">This link is incomplete. Open it again from your email.</p>
      )}
    </main>
  );
}
