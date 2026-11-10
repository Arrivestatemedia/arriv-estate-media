import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// The visibility email preference page reached from a notice's unsubscribe link. The token identifies
// the address, so no login is needed and no address ever appears in the URL.

export default function NotificationPreferences() {
  const [state, setState] = useState({ loading: true, error: '', data: null, busy: '' });

  const token = typeof window === 'undefined'
    ? ''
    : new URLSearchParams(window.location.search).get('token') || '';

  const run = async (action) => {
    setState((prev) => ({ ...prev, busy: action, error: '' }));
    try {
      const response = await base44.functions.invoke('manageNotificationPreference', { action, token });
      const data = response?.data ?? response;
      if (data?.ok === false) {
        setState((prev) => ({ ...prev, busy: '', error: data.error || 'That could not be completed.' }));
        return;
      }
      setState({ loading: false, busy: '', error: '', data });
    } catch (error) {
      setState((prev) => ({ ...prev, busy: '', error: 'That could not be completed.' }));
    }
  };

  useEffect(() => {
    if (!token) {
      setState({ loading: false, busy: '', error: 'This link is missing its code.', data: null });
      return;
    }
    run('status');
  }, [token]);

  const subscribed = state.data?.subscribed === true;

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-[#1A1A1A]/10 bg-white p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[#B8956A]">Arriv Estate Media</p>
        <h1 className="font-serif text-3xl text-[#1A1A1A] mt-2">Email preferences</h1>

        {state.loading && <p className="text-sm text-[#1A1A1A]/60 mt-4">Loading your preference…</p>}

        {state.error && <p className="text-sm text-red-600 mt-4">{state.error}</p>}

        {!state.loading && state.data && (
          <>
            <p className="text-sm text-[#1A1A1A]/60 mt-4">{state.data.email}</p>
            <p className="text-sm text-[#1A1A1A]/75 mt-3">
              {subscribed
                ? 'You currently receive optional emails such as your monthly performance summary and renewal reminders.'
                : 'You have opted out of optional emails such as the monthly summary and renewal reminders.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {subscribed ? (
                <button
                  onClick={() => run('unsubscribe')}
                  disabled={state.busy === 'unsubscribe'}
                  className="rounded-md bg-[#1A1A1A] px-4 py-2 text-sm font-medium text-[#FFFBF5] hover:bg-[#2A3536] disabled:opacity-60"
                >
                  {state.busy === 'unsubscribe' ? 'Updating…' : 'Unsubscribe from optional emails'}
                </button>
              ) : (
                <button
                  onClick={() => run('subscribe')}
                  disabled={state.busy === 'subscribe'}
                  className="rounded-md border border-[#1A1A1A]/20 px-4 py-2 text-sm font-medium text-[#1A1A1A] hover:bg-[#1A1A1A]/5 disabled:opacity-60"
                >
                  {state.busy === 'subscribe' ? 'Updating…' : 'Subscribe again'}
                </button>
              )}
            </div>

            <p className="text-xs text-[#1A1A1A]/45 mt-6">
              Billing and account notices (payment failed, plan activated or cancelled, seat changes) are part of the
              service and are sent regardless of this setting.
            </p>
          </>
        )}
      </div>
    </div>
  );
}