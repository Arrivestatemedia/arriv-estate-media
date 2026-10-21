import React from "react";
import { Check, CheckCheck, Clock, AlertTriangle, ExternalLink, Reply } from "lucide-react";

const time = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Delivery state of an outgoing message. Delivered is only ever shown after Twilio confirms it. */
function DeliveryMark({ status }) {
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1">
        <CheckCheck className="w-3.5 h-3.5" /> Delivered
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1">
        <Check className="w-3.5 h-3.5" /> Sent
      </span>
    );
  }
  if (status === "failed" || status === "undelivered") {
    return (
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" />
        {status === "failed" ? "Failed to send" : "Not delivered"}
      </span>
    );
  }
  if (status === "queued" || status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 opacity-80">
        <Clock className="w-3.5 h-3.5" /> Sending
      </span>
    );
  }
  return null;
}

/** Engagement indicators: kept visually separate from delivery and from replies. */
function MessageFlags({ message }) {
  const engagement = message.link_engagement || {};
  const human = engagement.human_click_count || 0;
  const previews = engagement.preview_count || 0;

  return (
    <div className="mt-1 space-y-0.5 text-right">
      {(message.status === "failed" || message.status === "undelivered") && (
        <p className="text-xs" style={{ color: "#b91c1c" }}>
          {message.twilio_error_message || "This message was not delivered."}
        </p>
      )}
      {human > 0 && (
        <p className="text-xs inline-flex items-center gap-1" style={{ color: "#8a6a3b" }}>
          <ExternalLink className="w-3 h-3" />
          Link opened {time(engagement.last_click_at)}
          {engagement.last_destination_label ? ` · ${engagement.last_destination_label}` : ""}
        </p>
      )}
      {human === 0 && previews > 0 && (
        <p className="text-xs inline-flex items-center gap-1" style={{ color: "rgba(26,26,26,0.45)" }}>
          <ExternalLink className="w-3 h-3" /> Link preview detected (automated)
        </p>
      )}
      {message.replied_at && (
        <p className="text-xs inline-flex items-center gap-1" style={{ color: "#2a3536" }}>
          <Reply className="w-3 h-3" /> Replied {time(message.replied_at)}
        </p>
      )}
    </div>
  );
}

/** One message in a thread: bubble, delivery mark, then engagement indicators. */
export default function MessageBubble({ message }) {
  const outbound = message.direction === "outbound";

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2 text-sm"
        style={
          outbound
            ? { backgroundColor: "#B8956A", color: "#fff" }
            : { backgroundColor: "#f3f4f6", color: "#1A1A1A" }
        }
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div className={`text-xs mt-1 opacity-60 flex items-center gap-2 ${outbound ? "justify-end" : ""}`}>
          <span>{time(message.created_date)}</span>
          {outbound && <DeliveryMark status={message.status} />}
        </div>
      </div>
      {outbound && <MessageFlags message={message} />}
    </div>
  );
}