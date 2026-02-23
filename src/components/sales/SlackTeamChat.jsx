import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Loader2 } from 'lucide-react';
import SlackAuth from './SlackAuth';

export default function SlackTeamChat() {
    const [salesMemberId, setSalesMemberId] = useState('');
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [sentMessages, setSentMessages] = useState([]);
    const [isAuthed, setIsAuthed] = useState(false);

    useEffect(() => {
        const getSalesMembers = async () => {
            const user = await base44.auth.me();
            const members = await base44.entities.SalesTeamMember.filter({ email: user.email });
            if (members.length > 0) {
                setSalesMemberId(members[0].id);
                if (members[0].slack_token) {
                    setIsAuthed(true);
                    loadChannelsAndUsers(members[0].id);
                } else {
                    setIsAuthed(false);
                    setLoading(false);
                }
            } else {
                setError('Sales member not found');
                setLoading(false);
            }
        };
        getSalesMembers();
    }, []);

    const loadChannelsAndUsers = async (memberId) => {
        try {
            setLoading(true);
            setError('');
            const response = await base44.functions.invoke('slackGetChannelsAndUsersPersonal', { salesMemberId: memberId });
            
            if (response.data.channels) {
                setChannels(response.data.channels);
                if (response.data.channels.length > 0) {
                    setSelectedChannel(response.data.channels[0].id);
                }
            }
        } catch (err) {
            setError('Slack not authorized. Please authorize your account from the Sales Team page.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!message.trim() || !selectedChannel || !salesMemberId) return;

        try {
            setSending(true);
            setError('');
            
            await base44.functions.invoke('slackSendMessagePersonal', {
                salesMemberId: salesMemberId,
                channelId: selectedChannel,
                text: message,
            });

            setSentMessages([...sentMessages, { text: message, time: new Date() }]);
            setMessage('');
        } catch (err) {
            setError('Failed to send message. Try again.');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!isAuthed && salesMemberId) {
        return (
            <SlackAuth salesMemberId={salesMemberId} onAuthSuccess={() => {
                setIsAuthed(true);
                loadChannelsAndUsers(salesMemberId);
            }} />
        );
    }

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Select Channel</label>
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose a channel" />
                    </SelectTrigger>
                    <SelectContent>
                        {channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                                # {channel.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto border border-gray-200">
                {sentMessages.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                        No messages sent yet. Send your first message below.
                    </p>
                ) : (
                    sentMessages.map((msg, idx) => (
                        <div key={idx} className="bg-white rounded p-3 border-l-4 border-blue-500">
                            <p className="text-sm text-gray-900">{msg.text}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {msg.time.toLocaleTimeString()}
                            </p>
                        </div>
                    ))
                )}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sending || !selectedChannel}
                    className="flex-1"
                />
                <Button
                    type="submit"
                    disabled={sending || !message.trim() || !selectedChannel}
                    className="gap-2"
                >
                    {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="h-4 w-4" />
                    )}
                    Send
                </Button>
            </form>
        </div>
    );
}