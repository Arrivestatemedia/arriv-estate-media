import React, { useEffect, useState } from 'react';

// The platform unsubscribe page. It reads the token from the URL fragment (never from the query, so the
// token never reaches a server log) and reports the visitor's choice to the platform, which is what the
// scripts on the page wait for. It stores nothing itself.

const ENDPOINT = '/api/app-emails/unsubscribe';

function isEditorPreview() {
  if (typeof window === 'undefined') return false;
  return window.self !== window.top || /^preview(-sandbox)?--/.test(window.location.hostname);
}

export default function Unsubscribe() {
  const [state, setState] = useState({ status: 'working', message: '' });
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');

    if (!token) {
      if (isEditorPreview()) {
        setPreview(true);
        setState({ status: 'done', message: 'You have been unsubscribed from optional emails.' });
        return;
      }
      setState({ status: 'invalid', message: 'This unsubscribe link is missing its code.' });
      return;
    }

    let cancelled = false;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setState({ status: 'done', message: 'You have been unsubscribed from optional emails.' });
          return;
        }
        if (response.status === 400) {
          setState({ status: 'invalid', message: 'This unsubscribe link is no longer valid.' });
          return;
        }
        setState({ status: 'error', message: 'We could not complete that just now.' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'We could not reach the server.' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) return;
    setState({ status: 'working', message: '' });
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (response.ok) setState({ status: 'done', message: 'You have been unsubscribed from optional emails.' });
        else if (response.status === 400) setState({ status: 'invalid', message: 'This unsubscribe link is no longer valid.' });
        else setState({ status: 'error', message: 'We could not complete that just now.' });
      })
      .catch(() => setState({ status: 'error', message: 'We could not reach the server.' }));
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-[#1A1A1A]/10 bg-white p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Arriv Estate Media</p>
        <h1 className="font-serif text-3xl text-[#1A1A1A] mt-2">Email preferences</h1>

        {state.status === 'working' && (
          <p className="text-sm text-[#1A1A1A]/60 mt-4">Updating your preference…</p>
        )}

        {state.status === 'done' && (
          <>
            <p className="text-sm text-[#1A1A1A]/70 mt-4">{state.message}</p>
            <p className="text-sm text-[#1A1A1A]/55 mt-2">
              Transactional emails such as receipts, invoices and password resets will still arrive.
            </p>
            {preview && (
              <span className="inline-block mt-3 text-[11px] uppercase tracking-wide px-2 py-1 rounded-full bg-[#B8956A]/15 text-[#8C6F45]">
                Preview
              </span>
            )}
          </>
        )}

        {state.status === 'invalid' && (
          <p className="text-sm text-red-600 mt-4">{state.message}</p>
        )}

        {state.status === 'error' && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-red-600">{state.message}</p>
            <button
              onClick={retry}
              className="rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-[#FFFBF5] hover:bg-[#2A3536]"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}