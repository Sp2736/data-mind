"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center bg-stone-950 text-white p-6">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-500">Application Error</h2>
          <p className="text-sm text-stone-400">
            {error.message || "An unexpected error occurred in the application."}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
