/**
 * TwiML builders for the Arriv call center.
 *
 * Every value that reaches the XML is escaped, so a customer name or a stored
 * phone number can never break the response. The spoken brand name is always
 * written "Arrive", which is how the company name is pronounced.
 */

import { dialable } from './phoneNumber.ts';

export const VOICE = 'Polly.Joanna';

export function escapeXml(value: any): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function twiml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

export function say(text: string, voice: string = VOICE): string {
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
}

export function pause(seconds = 1): string {
  return `<Pause length="${Math.max(1, Math.round(seconds))}"/>`;
}

export function redirect(url: string): string {
  return `<Redirect method="POST">${escapeXml(url)}</Redirect>`;
}

export function hangup(): string {
  return '<Hangup/>';
}

/** Keypad menu. `actionOnEmptyResult` keeps a silent caller from falling off the XML. */
export function gatherDigits(opts: {
  action: string;
  text: string;
  numDigits?: number;
  timeout?: number;
}): string {
  const action = escapeXml(opts.action);
  return `<Gather input="dtmf" numDigits="${opts.numDigits || 1}" action="${action}" method="POST" timeout="${
    opts.timeout || 8
  }" finishOnKey="" actionOnEmptyResult="true">${say(opts.text)}</Gather>`;
}

/**
 * Spoken menu with a keypad fallback.
 * Twilio collects either a spoken request or a digit, and the handler reads both.
 */
export function gatherSpeech(opts: {
  action: string;
  text: string;
  hints?: string;
  timeout?: number;
  attempt?: number;
}): string {
  const action = escapeXml(opts.action);
  const hints = opts.hints ? ` hints="${escapeXml(opts.hints)}"` : '';
  return `<Gather input="speech dtmf" language="en-US" speechTimeout="auto" speechModel="phone_call"${hints} numDigits="1" action="${action}" method="POST" timeout="${
    opts.timeout || 6
  }" actionOnEmptyResult="true">${say(opts.text)}</Gather>`;
}

/**
 * Simultaneous ring across every number in one stage.
 * Twilio cancels the remaining legs the moment one is answered, so there is no
 * race for a second connection. `action` receives DialCallStatus for the stage.
 */
export function dialSimultaneous(opts: {
  numbers: string[];
  callerId: string;
  timeout?: number;
  action?: string;
  record?: boolean;
}): string {
  const numbers = [...new Set((opts.numbers || []).map(dialable).filter(Boolean))];
  if (!numbers.length) return '';
  const action = opts.action ? ` action="${escapeXml(opts.action)}" method="POST"` : '';
  const record = opts.record ? ' record="record-from-answer-dual"' : '';
  const legs = numbers.map((n) => `<Number>${escapeXml(n)}</Number>`).join('');
  return `<Dial callerId="${escapeXml(opts.callerId)}" answerOnBridge="true" timeout="${opts.timeout || 20}"${action}${record}>${legs}</Dial>`;
}

/** Single transfer, used when the destination is one known person. */
export function dialOne(opts: {
  number: string;
  callerId: string;
  timeout?: number;
  action?: string;
}): string {
  const number = dialable(opts.number);
  if (!number) return '';
  const action = opts.action ? ` action="${escapeXml(opts.action)}" method="POST"` : '';
  return `<Dial callerId="${escapeXml(opts.callerId)}" answerOnBridge="true" timeout="${opts.timeout || 30}"${action}><Number>${escapeXml(number)}</Number></Dial>`;
}

/** Voicemail capture. The action URL fires on completion and stores the recording. */
export function recordVoicemail(opts: {
  action: string;
  maxLength?: number;
  text?: string;
  timeout?: number;
}): string {
  const action = escapeXml(opts.action);
  const prompt = opts.text ? say(opts.text) : '';
  return `<Record action="${action}" method="POST" maxLength="${opts.maxLength || 120}" timeout="${
    opts.timeout || 5
  }" playBeep="true" trim="trim-silence">${prompt}</Record>`;
}

/** Absolute URL for a function, used by every Gather action and Dial callback. */
export function functionUrl(functionName: string, query?: Record<string, string | number | undefined>): string {
  const domain = Deno.env.get('BASE44_APP_DOMAIN') || '';
  if (!domain) return '';
  const base = `${domain.replace(/\/$/, '')}/functions/${functionName}`;
  const pairs = Object.entries(query || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `${base}?${pairs.join('&')}` : base;
}

/** The company number used as caller ID on every transfer, including to the owner. */
export function companyCallerId(configured?: string): string {
  return (
    dialable(configured) ||
    dialable(Deno.env.get('TWILIO_CALLING_PHONE_NUMBER')) ||
    dialable(Deno.env.get('TWILIO_PHONE_NUMBER')) ||
    ''
  );
}