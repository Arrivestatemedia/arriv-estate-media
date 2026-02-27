import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Phone, PhoneOff, MessageSquare, Clock, Send, Loader2, Mic, MicOff, Check, Plus, X, ArrowRight, Search } from "lucide-react";
import { format } from "date-fns";
import TransferCallPanel from "./TransferCallPanel";
import IncomingTransferAlert from "./IncomingTransferAlert";

const TABS = { RECENTS: "recents", KEYPAD: "keypad", MESSAGES: "messages" };
const CALL_STATES = { IDLE: "idle", CONNECTING: "connecting", RINGING: "ringing", INCOMING: "incoming", IN_CALL: "in_call", ENDED: "ended" };

export default function IphoneDialer({ salesMemberId }) {
  const [device, setDevice] = useState(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [hasTwilioNumber, setHasTwilioNumber] = useState(false);
  const [activeTab, setActiveTab] = useState(TABS.RECENTS);
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [keypadInput, setKeypadInput] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingFrom, setIncomingFrom] = useState("");
  const [incomingDisplayName, setIncomingDisplayName] = useState("");
  const [currentCall, setCurrentCall] = useState(null);
  const [callLogs, setCallLogs] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
   const [contactName, setContactName] = useState("");
   const [contactEmail, setContactEmail] = useState("");
   const [companyName, setCompanyName] = useState("");
   const [callNotes, setCallNotes] = useState("");
   const [expandedCallId, setExpandedCallId] = useState(null);
   const [showNewMessage, setShowNewMessage] = useState(false);
   const [newMsgNumber, setNewMsgNumber] = useState("");
   const [newMsgText, setNewMsgText] = useState("");
   const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [extensionSearch, setExtensionSearch] = useState("");
  const [secondCallNumber, setSecondCallNumber] = useState("");
  const [secondCallSid, setSecondCallSid] = useState(null);
  const [showThreeWayButton, setShowThreeWayButton] = useState(false);

  const callRef = useRef(null);
  const timerRef = useRef(null);
  const callStartRef = useRef(null);
  const messagesEndRef = useRef(null);
  const deviceRef = useRef(null);
  const activeTabRef = useRef(activeTab);
  const callStateRef = useRef(callState);
  const autoAcceptRef = useRef(null); // set when recipient accepts a transfer

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Device init — only runs once when salesMemberId is available
  useEffect(() => {
    const id = salesMemberId || localStorage.getItem('sales_member_id');
    if (!id) return;

    // Initialize device for any active sales member
    base44.entities.SalesTeamMember.filter({ id }).then(members => {
      if (!members?.[0]) {
        setError('Unable to verify your account. Contact your administrator.');
        return;
      }
      setHasTwilioNumber(!!members[0].twilio_phone_number);
      initDevice();
      // Load all members for extension directory
      base44.entities.SalesTeamMember.filter({ is_active: true }).then(setAllMembers).catch(() => {});
    }).catch(() => {
      setError('Unable to verify account');
    });
    
    setTimeout(() => {
      loadCallLogs().catch(() => {});
      loadConversations().catch(() => {});
    }, 500);

    setTimeout(() => {
      loadCallLogs().catch(() => {});
      loadConversations().catch(() => {});
    }, 500);

      const callLogsUnsub = base44.entities.ActivityLog.subscribe(() => loadCallLogs().catch(() => {}));
      const convoUnsub = base44.entities.SmsConversation.subscribe(() => loadConversations().catch(() => {}));

      return () => {
        if (deviceRef.current) { deviceRef.current.destroy(); deviceRef.current = null; }
        if (timerRef.current) clearInterval(timerRef.current);
        callLogsUnsub();
        convoUnsub();
      };
  }, [salesMemberId]);

  // Listen for transfer acceptance via real-time subscription
  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id');
    if (!salesMemberId) return;
    
    // Listen to PendingCallTransfer updates to reliably track transfer acceptance
    const unsubscribe = base44.entities.PendingCallTransfer.subscribe((event) => {
      const transfer = event.data;
      if (event.type !== 'update' || !transfer) return;
      
      console.log('Transfer status update:', transfer);
      
      // Case 1: This user INITIATED the transfer (they're the sender)
      // Backend handles all the call manipulation (hold, dial, bridge)
      if (transfer.from_member_id === salesMemberId && transfer.status === 'accepted') {
        console.log('Transfer accepted by recipient - backend is handling the call bridging');
        base44.entities.PendingCallTransfer.update(transfer.id, { status: 'completed' }).catch(() => {});
        setShowTransferPanel(false);
        return;
      }
      
      // Case 2: This user RECEIVED the transfer (they're the recipient)
      // The backend is already dialing them into the conference, so they just wait for the incoming call
      if (transfer.to_member_id === salesMemberId && transfer.status === 'accepted') {
        console.log('Transfer accepted as recipient - backend will dial you into the conference');
        base44.entities.PendingCallTransfer.update(transfer.id, { status: 'completed' }).catch(() => {});
        return;
      }
    });
    
    return unsubscribe;
  }, []);

  // Keyboard handler — separate effect so it never re-initializes device
  useEffect(() => {
    const handleKeydown = (e) => {
      if (activeTabRef.current !== TABS.KEYPAD || callStateRef.current !== CALL_STATES.IDLE) return;
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        addKeypadDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startCall();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    if (selectedConvo?.id) {
      loadMessages(selectedConvo.id);
      base44.entities.SmsConversation.update(selectedConvo.id, { unread_count: 0 });
    }
  }, [selectedConvo?.id]);

  // ⚠️ DO NOT REMOVE — listens for initiateTransfer custom event dispatched by ChatWindow or contact cards
  // Handles both regular calls and transfer calls (auto-starts second call if already in active call)
  useEffect(() => {
    const handleTransfer = (e) => {
      const { extension, name } = e.detail;
      if (!extension) return;

      // If already in a call, this becomes the second call for 3-way transfer
      if (callStateRef.current === CALL_STATES.IN_CALL && callRef.current) {
        console.log('Transfer triggered while in call - initiating second call for 3-way');
        startCall(extension, false);
      } else {
        // Otherwise auto-dial the extension
        startCall(extension);
      }
    };

    window.addEventListener('initiateTransfer', handleTransfer);
    return () => window.removeEventListener('initiateTransfer', handleTransfer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadTwilioSdk = () => new Promise((resolve, reject) => {
    if (window.Twilio?.Device) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://sdk.twilio.com/js/voice/releases/2.10.0/twilio.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load Twilio SDK'));
    document.head.appendChild(script);
  });

  const initDevice = async () => {
    try {
      await loadTwilioSdk();
      const salesMemberEmail = localStorage.getItem('sales_member_email');
      const res = await base44.functions.invoke('generateTwilioToken', { 
        salesMemberId,
        salesMemberEmail
      });
      const { token, identity } = res.data;

      if (!token) {
        setError('Failed to get access token');
        return;
      }

      const { Device } = window.Twilio;
      const twilioDevice = new Device(token, { 
        codecPreferences: ['opus', 'pcmu'], 
        enableRingingState: true,
        closeProtection: false,
        allowIncomingWhileBusy: true
      });

      twilioDevice.on('registered', () => {
        console.log('Twilio Device registered with identity:', identity);
        setDeviceReady(true);
      });

      twilioDevice.on('error', (err) => {
        console.error('Twilio Device error:', err);
        setError(err?.message || 'Twilio error');
        setCallState(CALL_STATES.IDLE);
      });

      twilioDevice.on('incoming', async (call) => {
        const rawFrom = call.parameters?.From || 'Unknown';
        console.log('Incoming call received from:', rawFrom);

        setIncomingCall(call);
        setIncomingFrom(rawFrom);
        setCallState(CALL_STATES.INCOMING);

        // Check custom parameters first — these are set for internal extension calls
        // regardless of what the From/callerId shows (which may be the company number)
        const callerName = call.customParameters?.get('callerName') || '';
        const callerExtension = call.customParameters?.get('callerExtension') || '';
        const callerIdentityParam = call.customParameters?.get('callerIdentity') || '';

        console.log('callerName:', callerName, 'callerExtension:', callerExtension, 'callerIdentity:', callerIdentityParam);

        if (callerName) {
          // Internal call — show name and extension
          const ext = callerExtension ? ` (Ext. ${callerExtension})` : '';
          setIncomingDisplayName(`${callerName}${ext}`);
        } else if (callerIdentityParam) {
          // Has identity but no name — look up
          try {
            const res = await base44.functions.invoke('lookupSalesMemberByIdentity', { identity: callerIdentityParam });
            if (res?.data?.full_name) {
              const ext = res.data.extension ? ` (Ext. ${res.data.extension})` : '';
              setIncomingDisplayName(`${res.data.full_name}${ext}`);
            } else {
              setIncomingDisplayName('Internal Call');
            }
          } catch (_) {
            setIncomingDisplayName('Internal Call');
          }
        } else if (rawFrom.startsWith('client:')) {
          // Legacy fallback for client: identity in From
          setIncomingDisplayName('Internal Call');
        } else {
          setIncomingDisplayName('');
        }
        
        call.on('disconnect', () => {
           console.log('Incoming call disconnected');
           handleCallEnded(incomingFrom);
         });
        call.on('cancel', () => {
          console.log('Incoming call cancelled');
          setIncomingCall(null);
          setIncomingFrom('');
          setIncomingDisplayName('');
          setCallState(CALL_STATES.IDLE);
        });
        call.on('reject', () => {
          console.log('Incoming call rejected');
          setIncomingCall(null);
          setIncomingFrom('');
          setIncomingDisplayName('');
          setCallState(CALL_STATES.IDLE);
        });
      });

      console.log('Registering Twilio Device...');
      await twilioDevice.register();
      deviceRef.current = twilioDevice;
      setDevice(twilioDevice);
    } catch (err) {
      console.error('Device init error:', err);
      setError('Failed to initialize: ' + err?.message);
    }
  };

  const loadCallLogs = async () => {
    try {
      const id = salesMemberId || localStorage.getItem('sales_member_id');
      const logs = await base44.entities.ActivityLog.filter({ activity_type: 'call', sales_member_id: id }, '-activity_date', 100);
      setCallLogs(logs);
    } catch (err) {
      console.error('Failed to load call logs:', err);
    }
  };

  const loadConversations = async () => {
    try {
      const id = salesMemberId || localStorage.getItem('sales_member_id');

      // Load all SMS conversations and filter to only those assigned to this rep
      const allConversations = await base44.entities.SmsConversation.list();
      const filtered = allConversations.filter(conv => conv.sales_member_id === id);

      // Sort by last message time, newest first
      filtered.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
      setConversations(filtered);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setConversations([]);
    }
  };

  const loadMessages = async (convoId) => {
    try {
      const data = await base44.entities.SmsMessage.filter({ conversation_id: convoId }, 'created_date');
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    }
  };

  const handleCallEnded = async (phoneNumber) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const duration = callStartRef.current ? Math.floor((Date.now() - callStartRef.current) / 1000) : 0;
    setCallDuration(duration);
    setMuted(false);
    setCallState(CALL_STATES.IDLE);
    callRef.current = null;

    // Auto-log the call
    if (phoneNumber) {
      try {
        const id = salesMemberId || localStorage.getItem('sales_member_id');
        const isIncoming = currentCall?.incoming || false;
        await base44.functions.invoke('logCallActivity', {
          salesMemberId: id,
          toNumber: phoneNumber,
          contactName: phoneNumber,
          contactEmail: '',
          companyName: '',
          durationSeconds: duration,
          notes: `${isIncoming ? 'Incoming' : 'Outgoing'} call with ${phoneNumber}`,
          direction: isIncoming ? 'incoming' : 'outgoing'
        });
        setTimeout(() => loadCallLogs(), 300);
      } catch (err) {
        console.error('Failed to auto-log call:', err);
      }
    }
    setCurrentCall(null);
  };

  const startCall = async (phoneNumber = null, transferring = false) => {
    const phoneToDial = (phoneNumber || keypadInput).trim();
    if (!phoneToDial) {
      setError('Please enter a phone number');
      return;
    }

    // Detect extension (exactly 3 digits, 100-999) — must be ONLY digits, no formatting
    const digitsOnly = phoneToDial.replace(/\D/g, '');
    const isExtension = /^\d{3}$/.test(digitsOnly) && parseInt(digitsOnly) >= 100 && phoneToDial === digitsOnly;

    // Block external calls if rep has no Twilio number
    if (!isExtension && !hasTwilioNumber) {
      setError('You need an assigned Twilio number to make external calls. Internal extensions only.');
      return;
    }
    // Send extension as-is (3 digits), format phone numbers with country code
    const formattedPhone = isExtension ? digitsOnly : (phoneToDial.startsWith('+') ? phoneToDial : '+1' + digitsOnly);
    setError('');
    setCallState(CALL_STATES.CONNECTING);

    try {
      // Ensure device is registered before connecting (fixes first-call routing to cell issue)
      if (!deviceRef.current) {
        setError('Dialer not ready. Please wait a moment and try again.');
        setCallState(CALL_STATES.IDLE);
        return;
      }
      if (deviceRef.current.state !== 'registered') {
        console.log('Device not yet registered, waiting...');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Device registration timed out')), 8000);
          deviceRef.current.once('registered', () => { clearTimeout(timeout); resolve(); });
        });
      }

      console.log('Initiating call to:', formattedPhone, isExtension ? '(extension)' : '(phone number)', transferring ? '(conference transfer)' : '');
      
      // For dialer transfer, use backend API to bridge calls
      if (transferring && callRef.current && currentCall?.number) {
        console.log('Initiating blind transfer via backend, callRef.current:', callRef.current, 'window._senderCallSid:', window._senderCallSid);
        try {
          const senderCallSid = window._senderCallSid || callRef.current?.sid;
          console.log('Using senderCallSid:', senderCallSid);
          if (!senderCallSid) {
            throw new Error('No active call to transfer');
          }
          
          const response = await base44.functions.invoke('blindTransferTest', {
            senderCallSid: senderCallSid,
            externalCallerNumber: currentCall.number,
            recipientExtension: parseInt(formattedPhone)
          });

          if (response.data.success) {
            console.log('Blind transfer initiated:', response.data.conferenceId);
            // Disconnect SDK call since backend has redirected it
            if (callRef.current) {
              try {
                callRef.current.disconnect();
              } catch (e) {
                console.warn('Error disconnecting call during transfer:', e);
              }
              callRef.current = null;
            }
            setCurrentCall(null);
            setCallState(CALL_STATES.IDLE);
            return;
          }
        } catch (e) {
          console.error('Blind transfer failed:', e);
          setError('Transfer failed: ' + e.message);
          return;
        }
      }
      
      // Regular call flow
      const call = await deviceRef.current.connect({ params: { To: formattedPhone } });
      callRef.current = call;
      setCurrentCall({ number: formattedPhone, startTime: Date.now(), incoming: false, sid: null });
      setCallState(CALL_STATES.IN_CALL);
      
      // If this is a second call during an active call, mark it differently
      if (callState === CALL_STATES.IN_CALL && secondCallNumber === '') {
        setSecondCallNumber(formattedPhone);
      }

      call.on('ringing', () => {
        console.log('Call ringing');
        setCallState(CALL_STATES.IN_CALL);
      });
      call.on('accept', () => {
        console.log('Call accepted, SID:', call.sid);
        // Store the call SID so backend can use Call Control API to redirect it
        window._senderCallSid = call.sid;
        callRef.current = call; // Ensure callRef is updated with accepted call
        setCurrentCall(prev => ({ ...prev, sid: call.sid }));
        
        // If we already have an active call, show 3-way button
        if (callState === CALL_STATES.IN_CALL) {
          setSecondCallSid(call.sid);
          setShowThreeWayButton(true);
        } else {
          setCallState(CALL_STATES.IN_CALL);
          callStartRef.current = Date.now();
          timerRef.current = setInterval(() => {
            setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
          }, 1000);
        }
      });
      call.on('disconnect', () => {
        console.log('Call disconnected');
        handleCallEnded(formattedPhone);
      });
      call.on('error', (err) => {
        console.error('Call error:', err);
        setError(err.message);
        setCallState(CALL_STATES.IDLE);
      });

      if (phoneNumber) setKeypadInput('');
    } catch (err) {
      console.error('Call initiation failed:', err);
      setError('Call failed: ' + err.message);
      setCallState(CALL_STATES.IDLE);
    }
  };

  const acceptCall = () => {
    if (incomingCall) {
      console.log('Accepting incoming call from:', incomingFrom);
      incomingCall.accept();
      callRef.current = incomingCall;
      setCurrentCall({ number: incomingFrom, startTime: Date.now(), incoming: true });
      setCallState(CALL_STATES.IN_CALL);
      callStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }, 1000);
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      console.log('Rejecting incoming call from:', incomingFrom);
      incomingCall.reject();
      setIncomingCall(null);
      setIncomingFrom('');
      setIncomingDisplayName('');
      setCallState(CALL_STATES.IDLE);
    }
  };

  const hangUp = () => {
    if (callRef.current) {
      callRef.current.disconnect();
    }
  };

  const toggleMute = () => {
    if (callRef.current) {
      callRef.current.mute(!muted);
      setMuted(!muted);
    }
  };

  const initiateThreeWay = async () => {
    if (!window._senderCallSid || !secondCallSid) {
      setError('Both calls must be active to create 3-way');
      return;
    }

    try {
      const response = await base44.functions.invoke('conferenceTwiml', {
        senderCallSid: window._senderCallSid,
        recipientCallSid: secondCallSid,
        externalCallerNumber: currentCall?.number
      });

      if (response.data.success) {
        console.log('3-way conference created:', response.data.conferenceId);
        setShowThreeWayButton(false);
      }
    } catch (e) {
      console.error('3-way conference failed:', e);
      setError('Failed to create 3-way: ' + e.message);
    }
  };

  const dropFromConference = () => {
    if (callRef.current) {
      try {
        callRef.current.disconnect();
        callRef.current = null;
        window._senderCallSid = null;
        setShowThreeWayButton(false);
        setSecondCallNumber("");
        setSecondCallSid(null);
        setError("You've been disconnected from the conference. The other parties remain connected.");
      } catch (e) {
        console.error('Error dropping from conference:', e);
      }
    }
  };

  const addKeypadDigit = (digit) => {
    setKeypadInput(prev => prev + digit);
  };

  const backspace = () => {
    setKeypadInput(prev => prev.slice(0, -1));
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConvo) return;
    try {
      await base44.functions.invoke('sendSms', {
        conversationId: selectedConvo.id,
        toNumber: selectedConvo.from_number,
        body: replyText.trim(),
        salesMemberId
      });
      setReplyText("");
      await loadMessages(selectedConvo.id);
    } catch (err) {
      console.error(err);
    }
  };

  const sendNewMessage = async () => {
    const phone = newMsgNumber.trim();
    const msg = newMsgText.trim();
    if (!phone || !msg) return;

    try {
      const id = salesMemberId || localStorage.getItem('sales_member_id');
      await base44.functions.invoke('sendSms', {
        toNumber: phone,
        body: msg,
        salesMemberId: id,
        newConversation: true
      });
      setNewMsgNumber("");
      setNewMsgText("");
      setShowNewMessage(false);
      await loadConversations();
    } catch (err) {
      setError('Failed to send message: ' + err.message);
    }
  };

  const formatDuration = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday ? d.toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : format(d, 'MMM d');
  };

  const logCall = async () => {
    if (!contactName.trim()) {
      setError('Contact name is required');
      return;
    }

    try {
      await base44.functions.invoke('logCallActivity', {
        salesMemberId,
        toNumber: currentCall?.number || '',
        contactName,
        contactEmail,
        companyName,
        durationSeconds: callDuration,
        notes: callNotes || `Call to ${currentCall?.number}`
      });

      // Reset form and show success message
      setContactName('');
      setContactEmail('');
      setCompanyName('');
      setCallNotes('');
      setCallDuration(0);
      setCallState(CALL_STATES.IDLE);

      setTimeout(() => loadCallLogs(), 300);
    } catch (err) {
      setError('Failed to log call: ' + err.message);
    }
  };

  // Incoming call modal
  if (callState === CALL_STATES.INCOMING && incomingCall) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
          <Phone className="w-12 h-12 mx-auto mb-4 animate-pulse" style={{ color: '#22c55e' }} />
          <p className="text-lg font-semibold mb-2">Incoming Call</p>
          <p className="text-2xl font-bold" style={{ color: '#B8956A' }}>
            {incomingDisplayName || incomingFrom || 'Unknown'}
          </p>
          {incomingDisplayName ? (
            <p className="text-sm opacity-50 mb-8">Internal Call</p>
          ) : (
            <div className="mb-8" />
          )}
          <div className="flex gap-3">
            <Button onClick={rejectCall} variant="destructive" className="flex-1 h-12 text-base">
              <PhoneOff className="w-5 h-5 mr-2" /> Decline
            </Button>
            <Button onClick={acceptCall} className="flex-1 h-12 text-base bg-green-600 hover:bg-green-700">
              <Phone className="w-5 h-5 mr-2" /> Accept
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // In-call UI
  if (callState === CALL_STATES.IN_CALL) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4 z-50 text-white">
        <p className="text-lg opacity-70 mb-2">{currentCall?.incoming ? 'On Call' : 'Calling'}</p>
        <p className="text-4xl font-bold mb-1">{currentCall?.number}</p>
        {secondCallNumber && <p className="text-sm opacity-60 mb-4">+ {secondCallNumber}</p>}
        <p className="text-3xl font-mono mb-8">{formatDuration(callDuration)}</p>
        <div className="flex gap-4 mb-6">
          <Button onClick={toggleMute} variant="ghost" className="text-white hover:bg-white/20 h-14 w-14 rounded-full">
            {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>
          {!showThreeWayButton && (
            <Button onClick={() => setShowTransferPanel(true)} variant="ghost" className="text-white hover:bg-white/20 h-14 w-14 rounded-full">
              <ArrowRight className="w-6 h-6" />
            </Button>
          )}
          {showThreeWayButton && (
            <Button onClick={initiateThreeWay} className="bg-blue-600 hover:bg-blue-700 h-14 w-14 rounded-full" title="Create 3-way call">
              <Plus className="w-6 h-6" />
            </Button>
          )}
          {showThreeWayButton && (
            <Button onClick={dropFromConference} className="bg-orange-600 hover:bg-orange-700 h-14 w-14 rounded-full" title="Drop from conference">
              <PhoneOff className="w-6 h-6" />
            </Button>
          )}
          {!showThreeWayButton && (
            <Button onClick={hangUp} className="bg-red-600 hover:bg-red-700 h-14 w-14 rounded-full">
              <PhoneOff className="w-6 h-6" />
            </Button>
          )}
        </div>
        {showTransferPanel && (
          <TransferCallPanel
            onClose={() => setShowTransferPanel(false)}
            currentCallNumber={currentCall?.number}
            currentCallName={currentCall?.number}
            onTransferAccepted={(extension) => {
              setShowTransferPanel(false);
              startCall(extension);
            }}
          />
        )}

      </div>
    );
  }

  // Regular UI
  return (
    <div className="h-full flex flex-col bg-white rounded-lg">
      {error && (
        <div className="p-3 bg-red-50 border-b border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        {[
          { tab: TABS.RECENTS, icon: Clock, label: 'Recents', disabled: false },
          { tab: TABS.KEYPAD, icon: Phone, label: 'Keypad', disabled: false },
          { tab: TABS.MESSAGES, icon: MessageSquare, label: 'Messages', disabled: !hasTwilioNumber }
        ].map(({ tab, icon: Icon, label, disabled }) => (
          <button
            key={tab}
            onClick={() => {
              if (disabled) return;
              setActiveTab(tab);
              setSelectedConvo(null);
            }}
            disabled={disabled}
            title={disabled ? 'SMS requires an assigned Twilio number' : undefined}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${
              activeTab === tab ? 'border-b-2' : ''
            } ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}
            style={{
              borderBottomColor: activeTab === tab ? '#B8956A' : 'transparent',
              color: activeTab === tab ? '#B8956A' : 'rgba(26,26,26,0.5)'
            }}
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === TABS.RECENTS && (
          <div className="space-y-0">
            {callLogs.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'rgba(26,26,26,0.4)' }}>
                <Phone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No recent calls</p>
              </div>
            ) : (
              callLogs.map((log) => {
                const phoneMatch = log.notes?.match(/\+?1?\d{10}/);
                const phoneNumber = phoneMatch?.[0];
                const isExpanded = expandedCallId === log.id;

                return (
                  <div key={log.id} style={{ borderBottom: '1px solid rgba(184,149,106,0.1)' }}>
                    <button
                      onClick={() => setExpandedCallId(isExpanded ? null : log.id)}
                      className="w-full text-left p-4 hover:bg-gray-50 transition flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: '#1A1A1A' }}>{log.contact_name || phoneNumber || 'Unknown'}</p>
                        {log.company_name && <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>{log.company_name}</p>}
                        {log.duration_minutes > 0 && (
                          <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.4)' }}>{log.duration_minutes} min</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>{formatTime(log.activity_date)}</p>
                        <Phone className="w-4 h-4 mt-1" style={{ color: '#B8956A' }} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-gray-50 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Date & Time</p>
                            <p style={{ color: '#1A1A1A' }}>{format(new Date(log.activity_date), 'MMM d, yyyy h:mm a')}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Duration</p>
                            <p style={{ color: '#1A1A1A' }}>{log.duration_minutes || 0} min</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Direction</p>
                          <p style={{ color: '#1A1A1A' }}>{log.direction ? log.direction.charAt(0).toUpperCase() + log.direction.slice(1) : 'Outgoing'}</p>
                        </div>

                        {log.contact_email && (
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Email</p>
                            <p style={{ color: '#1A1A1A' }}>{log.contact_email}</p>
                          </div>
                        )}
                        {log.notes && (
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Notes</p>
                            <p className="text-sm" style={{ color: '#1A1A1A' }}>{log.notes}</p>
                          </div>
                        )}
                        {phoneNumber && (
                          <Button 
                            onClick={() => startCall(phoneNumber)}
                            className="w-full gap-2 mt-3"
                            style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
                          >
                            <Phone className="w-4 h-4" />
                            Call Now
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {callState === CALL_STATES.ENDED && (
           <div className="p-4 text-center">
             <Check className="w-8 h-8 mx-auto mb-2" style={{ color: '#22c55e' }} />
             <p className="font-medium" style={{ color: '#1A1A1A' }}>Call logged successfully</p>
             <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{formatDuration(callDuration)}</p>
             <Button onClick={() => setCallState(CALL_STATES.IDLE)} className="w-full mt-4">
               Done
             </Button>
           </div>
         )}

        {activeTab === TABS.KEYPAD && (
          <div className="p-4 space-y-4">
            <Input
              value={keypadInput}
              placeholder="Enter number"
              readOnly
              className="text-center text-2xl font-mono tracking-widest"
            />
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <Button
                  key={digit}
                  onClick={() => addKeypadDigit(digit)}
                  className="h-14 text-lg font-semibold rounded-full"
                  style={{ backgroundColor: '#f0f0f0', color: '#1A1A1A' }}
                >
                  {digit}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={backspace} variant="outline" className="flex-1">
                ← Backspace
              </Button>
              <Button onClick={() => startCall()} className="flex-1 bg-green-600 hover:bg-green-700 gap-2">
                <Phone className="w-4 h-4" /> Call
              </Button>
            </div>

            {/* Extension Directory */}
            {allMembers.length > 0 && (
              <div className="border-t pt-4" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Extension Directory</p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Search by name or extension..."
                    value={extensionSearch}
                    onChange={(e) => setExtensionSearch(e.target.value)}
                    onKeyDown={(e) => {
                      // Allow backspace to work without triggering the global keypad handler
                      e.stopPropagation();
                    }}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allMembers
                    .filter(m => m.extension && extensionSearch !== '' && (
                      m.full_name?.toLowerCase().includes(extensionSearch.toLowerCase()) ||
                      String(m.extension).includes(extensionSearch)
                    ))
                    .sort((a, b) => a.extension - b.extension)
                    .map(m => (
                      <button
                        key={m.id}
                        onClick={() => startCall(String(m.extension))}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#B8956A]/10 transition text-left"
                      >
                        <span className="text-sm font-medium text-gray-800">{m.full_name}</span>
                        <span className="text-sm font-mono font-bold" style={{ color: '#B8956A' }}>Ext. {m.extension}</span>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === TABS.MESSAGES && (
          <>
            {!selectedConvo ? (
              <div className="flex flex-col h-full">
                {showNewMessage ? (
                  <div className="flex-1 flex flex-col p-4 gap-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">Send Message</p>
                      <Button variant="ghost" size="icon" onClick={() => setShowNewMessage(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Phone number"
                      value={newMsgNumber}
                      onChange={(e) => setNewMsgNumber(e.target.value)}
                      className="text-base"
                    />
                    <Textarea
                      placeholder="Message..."
                      value={newMsgText}
                      onChange={(e) => setNewMsgText(e.target.value)}
                      className="flex-1"
                    />
                    <Button 
                      onClick={sendNewMessage} 
                      disabled={!newMsgNumber.trim() || !newMsgText.trim()}
                      className="w-full"
                      style={{ backgroundColor: '#B8956A' }}
                    >
                      <Send className="w-4 h-4 mr-2" /> Send
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-0 flex-1 overflow-y-auto">
                    <div className="p-4">
                      <Button 
                        onClick={() => setShowNewMessage(true)}
                        className="w-full gap-2"
                        style={{ backgroundColor: '#B8956A' }}
                      >
                        <Plus className="w-4 h-4" /> New Message
                      </Button>
                    </div>
                    {conversations.length === 0 ? (
                      <div className="text-center py-10" style={{ color: 'rgba(26,26,26,0.4)' }}>
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No messages</p>
                      </div>
                ) : (
                  conversations.map((convo) => (
                    <button
                      key={convo.id}
                      onClick={() => setSelectedConvo(convo)}
                      className="w-full text-left p-4 border-b hover:bg-gray-50 transition"
                      style={{ borderColor: 'rgba(184,149,106,0.1)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium" style={{ color: '#1A1A1A' }}>
                              {convo.contact_name || convo.from_number}
                            </p>
                            {convo.unread_count > 0 && (
                              <span className="text-xs font-bold text-white rounded-full px-1.5 py-0.5" style={{ backgroundColor: '#B8956A' }}>
                                {convo.unread_count}
                              </span>
                            )}
                          </div>
                          <p className="text-sm truncate mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
                            {convo.last_message}
                          </p>
                        </div>
                        <p className="text-xs ml-3 shrink-0" style={{ color: 'rgba(26,26,26,0.4)' }}>
                          {formatTime(convo.last_message_at)}
                        </p>
                      </div>
                    </button>
                  ))
                    )}
                    </div>
                  )}
                  </div>
                  ) : (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedConvo(null)}>
                    <Phone className="w-5 h-5" />
                  </Button>
                  <div className="flex-1">
                    <p className="font-semibold">{selectedConvo.contact_name || selectedConvo.from_number}</p>
                    <p className="text-xs opacity-60">{selectedConvo.from_number}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="max-w-[75%] rounded-2xl px-4 py-2 text-sm"
                        style={
                          msg.direction === 'outbound'
                            ? { backgroundColor: '#B8956A', color: '#fff' }
                            : { backgroundColor: '#f3f4f6', color: '#1A1A1A' }
                        }
                      >
                        <p>{msg.body}</p>
                        <p className="text-xs mt-1 opacity-60">{formatTime(msg.created_date)}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply */}
                <div className="flex gap-2 p-3 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                  <Input
                    placeholder="Message..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  />
                  <Button onClick={sendReply} disabled={!replyText.trim()} size="icon" style={{ backgroundColor: '#B8956A' }}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!deviceReady && (
        <p className="text-xs text-center p-3 bg-amber-50" style={{ color: 'rgba(26,26,26,0.5)' }}>
          Setting up calling...
        </p>
      )}

      {/* Transfer alerts are now shown inside the ChatWindow via IncomingTransferBanner */}
    </div>
  );
}